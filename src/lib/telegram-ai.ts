import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  getSystemKpis,
  listCoreEntities,
  createRecord,
  updateRecord,
  deleteRecord,
  generateTechnicalProposal
} from './system-core';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface ClientProjectContext {
  id: string;
  name: string;
  projects: Array<{
    id: string;
    title: string;
    status: string;
  }>;
}

export interface TelegramAgentResponse {
  replyText: string;
  actionTaken?: string;
  recordId?: string;
}

export async function processTelegramAgentMessage(
  rawMessage: string,
  context: ClientProjectContext[],
  imageBase64?: string,
  telegramChatId: number = 0,
  telegramUserName: string = 'Telegram User',
  isAdmin: boolean = true
): Promise<TelegramAgentResponse> {
  if (!genAI) {
    return { replyText: '❌ Error: GEMINI_API_KEY no configurada en el servidor.' };
  }

  const clienteName = context.map(c => `${c.name}: ${c.projects.map(p => p.title + ' [' + p.id + ']').join(', ')}`).join(' | ');

  const prompt = `
Eres Spark, el copiloto inteligente de P&P CONSTRUYE con permisos de Super Administrador.
Tu misión es interpretar la intención del usuario y responder con el JSON correcto.

Contexto de Clientes y Obras activas (usa los IDs exactos para projectId y client_id):
${clienteName}

Full context:
${JSON.stringify(context, null, 2)}

REGLAS IMPORTANTES:
- Si el usuario pregunta por proyectos de un cliente (ej. "proyectos de Zully"), usa intent "entity_query" con entityType "projects" y filtra por ese cliente en chat_reply.
- Si el usuario quiere registrar un gasto pero no especifica la obra exacta, usa intent "entity_query" con entityType "projects" y en chat_reply explica: "Estos son los proyectos activos. ¿En cuál deseas registrar el gasto?"
- Si el usuario menciona monto Y proyecto claramente (ej. "gasté 50$ en cemento en la obra de Zully"), usa intent "create_cost" directamente.
- Si el usuario hace dos peticiones a la vez (listar proyectos + registrar gasto), prioriza mostrar la lista de proyectos primero (entity_query).
- Para imágenes de recibos, usa siempre intent "create_cost" o "create_commitment".
- Extrae el projectId del contexto si el usuario menciona el nombre del cliente o parte del título del proyecto.

INTENTS DISPONIBLES:
1. "kpi_query": Saldos, presupuestos, cobrado, gastado (extrae projectId si hay obra específica).
2. "entity_query": Listar proyectos/clients/payables. entityType: "projects" | "clients" | "payables". Usa chat_reply para personalizar el mensaje si hay filtro por cliente.
3. "create_client": Crear cliente (client_name, phone, company_name, email).
4. "create_project": Crear obra/propuesta (title, client_id, amount).
5. "create_cost": Gasto directo (amount, currency, description, project_id, category, provider).
6. "create_commitment": Deuda/compromiso a proveedor (amount, currency, description, provider, project_id, category).
7. "create_client_payment": Cobro de cliente (amount, currency, description, project_id).
8. "create_partner_advance": Retiro de socio (amount, currency, partner_name, description, project_id).
9. "update_status": Cambiar estatus de obra (project_id, new_status: "in_progress"|"completed"|"cancelled"|"proposal").
10. "proposal_request": Redactar propuesta técnica (topic, client_name, details).
11. "delete_record": Eliminar registro (entityType, recordId).
12. "chat": Saludos o conversación casual.

Responde ÚNICAMENTE con este JSON (sin markdown, sin texto extra):
{
  "intent": "<intent>",
  "params": {
    "projectId": "<UUID o null>",
    "entityType": "<projects|clients|payables|null>",
    "amount": 0,
    "currency": "USD",
    "description": "<string>",
    "provider": null,
    "client_name": null,
    "client_id": null,
    "category": "materials",
    "partner_name": null,
    "title": null,
    "new_status": null,
    "topic": null,
    "details": null,
    "recordId": null,
    "chat_reply": "<respuesta en español si es entity_query con filtro o chat>"
  }
}

Mensaje del usuario:
"${rawMessage || 'Foto adjunta'}"
`;

  const fallbackModels = imageBase64
    ? ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-preview-05-20']
    : ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-preview-05-20'];

  let parsedDecision: any = null;

  for (const modelName of fallbackModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.1,
        },
      });

      const contents: any[] = [{ role: 'user', parts: [{ text: prompt }] }];
      if (imageBase64) {
        contents[0].parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBase64,
          },
        });
      }

      const result = await model.generateContent({ contents });
      const rawText = result.response.text();

      // Extract JSON robustly from text (handles markdown code blocks)
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                        rawText.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : rawText;
      parsedDecision = JSON.parse(jsonStr.trim());
      break;
    } catch (e: any) {
      console.warn(`Error en modelo ${modelName}:`, e.message);
    }
  }


  if (!parsedDecision) {
    return { replyText: '🤔 No pude procesar tu mensaje. Por favor intenta de nuevo.' };
  }

  const { intent, params } = parsedDecision;

  // ── RESTRICCIÓN DE SEGURIDAD POR ROL PARA USUARIOS NO ADMINISTRADORES ──
  if (!isAdmin) {
    // Si un usuario no admin intenta consultas financieras o acciones de administración
    if (['kpi_query', 'entity_query', 'create_client', 'create_project', 'update_status', 'delete_record'].includes(intent)) {
      return {
        replyText: '🔒 *Acceso Restringido:* Tu usuario solo tiene autorización para reportar gastos y comprobantes a la bandeja de pendientes. Las consultas financieras y administración de obras están reservadas para administradores.',
        actionTaken: 'blocked_non_admin'
      };
    }

    // Si un usuario no admin envía un gasto, compromiso o pago, forzar modo 'draft' (Pendiente)
    if (['create_cost', 'create_commitment', 'create_client_payment', 'create_partner_advance'].includes(intent)) {
      const draftRes = await createRecord({
        entry_type: intent === 'create_cost' ? 'cost' : intent === 'create_commitment' ? 'commitment' : 'client_payment',
        amount: params.amount,
        currency: params.currency || 'USD',
        description: params.description || rawMessage,
        project_id: params.projectId,
        category: params.category || 'materials',
        provider: params.provider,
        mode: 'draft',
        telegram_chat_id: telegramChatId,
        telegram_user_name: telegramUserName
      });

      return {
        replyText: `📥 *Gasto enviado a revisión*\n📝 *Concepto:* ${params.description || rawMessage}\n💰 *Monto:* ${params.currency === 'VES' ? 'Bs ' + params.amount : '$' + Number(params.amount).toFixed(2)}\n_El administrador revisará y aprobará este registro en el sistema._`,
        actionTaken: 'draft_submitted_non_admin',
        recordId: draftRes.recordId
      };
    }
  }

  // ── EJECUCIÓN SUPER ADMIN (TÚ) ──
  try {
    // 1. KPI QUERY
    if (intent === 'kpi_query') {
      const kpis = await getSystemKpis(params.projectId || undefined);
      if (params.projectId && kpis.title) {
        return {
          replyText: `📊 *Obra: ${kpis.title}*\n👤 *Cliente:* ${kpis.client_name}\n💰 *Presupuesto:* $${Number(kpis.budget_usd).toFixed(2)}\n💵 *Cobrado:* $${Number(kpis.total_collected_usd).toFixed(2)} | *Gastado:* $${Number(kpis.total_spent_usd).toFixed(2)}\n📌 *Saldo por Cobrar:* $${Number(kpis.remaining_balance_usd).toFixed(2)}\n📈 *Margen estimado:* ${kpis.margin_percentage}%\n🏷️ *Estatus:* ${kpis.status === 'in_progress' ? 'En Ejecución 🚧' : kpis.status}`,
          actionTaken: 'kpi_query'
        };
      }
      return {
        replyText: `📊 *Resumen Financiero Global:*\n💵 *Ingresos Cobrados:* $${Number(kpis.total_income_usd).toFixed(2)}\n📉 *Costos Ejecutados:* $${Number(kpis.total_costs_usd).toFixed(2)}\n💎 *Balance Disponible:* $${Number(kpis.remaining_balance_usd).toFixed(2)}\n🚧 *Obras en Ejecución:* ${kpis.active_projects_count}\n📥 *Borradores Pendientes:* ${kpis.pending_drafts_count}`,
        actionTaken: 'kpi_query_global'
      };
    }

    // 2. ENTITY QUERY
    if (intent === 'entity_query') {
      const list = await listCoreEntities(params.entityType || 'projects');
      if (params.entityType === 'clients') {
        let msg = `👥 *Directorio de Clientes (${list.length}):*\n\n`;
        list.slice(0, 10).forEach((c: any) => msg += `• *${c.name}* | ${c.phone || 'Sin tel'} | ${c.company_name || 'Particular'}\n`);
        return { replyText: msg, actionTaken: 'list_clients' };
      }
      if (params.entityType === 'payables') {
        let msg = `💳 *Cuentas por Pagar (${list.length}):*\n\n`;
        list.slice(0, 10).forEach((p: any) => msg += `• *${p.supplier_name}:* $${Number(p.amount).toFixed(2)} (${p.description || 'Compromiso'}) - *${p.project_title}*\n`);
        return { replyText: msg, actionTaken: 'list_payables' };
      }
      let msg = `📋 *Obras y Propuestas (${list.length}):*\n\n`;
      list.slice(0, 10).forEach((p: any) => msg += `• *${p.title}* [${p.status}]\n  Cliente: ${p.client_name} | Presupuesto: $${Number(p.budget_usd).toFixed(2)} | Cobrado: $${Number(p.total_collected_usd).toFixed(2)}\n`);
      return { replyText: msg, actionTaken: 'list_projects' };
    }

    // 3. CREATE CLIENT
    if (intent === 'create_client') {
      const res = await createRecord({
        entry_type: 'client',
        client_name: params.client_name || params.description,
        phone: params.phone,
        company_name: params.company_name,
        email: params.email
      });
      return {
        replyText: `✅ *Cliente Registrado Exitosamente*\n👤 *Nombre:* ${params.client_name}\n📞 *Teléfono:* ${params.phone || 'N/A'}\n🆔 *ID:* \`${res.recordId}\``,
        actionTaken: 'create_client',
        recordId: res.recordId
      };
    }

    // 4. CREATE PROJECT
    if (intent === 'create_project') {
      const res = await createRecord({
        entry_type: 'project',
        title: params.title || params.description,
        description: params.description,
        amount: params.amount || 0,
        client_id: params.client_id,
        status: 'proposal'
      });
      return {
        replyText: `✅ *Obra/Propuesta Creada Exitosamente*\n📋 *Título:* ${params.title || params.description}\n💰 *Presupuesto Inicial:* $${Number(params.amount || 0).toFixed(2)}\n📄 *Estatus:* Propuesta`,
        actionTaken: 'create_project',
        recordId: res.recordId
      };
    }

    // 5. CREATE COST (DIRECTO)
    if (intent === 'create_cost') {
      const res = await createRecord({
        entry_type: 'cost',
        amount: params.amount,
        currency: params.currency || 'USD',
        description: params.description,
        project_id: params.projectId,
        category: params.category || 'materials',
        provider: params.provider,
        mode: 'direct'
      });
      return {
        replyText: `✅ *Gasto Asentado en Obra*\n📝 *Concepto:* ${params.description}\n💰 *Monto:* ${params.currency === 'VES' ? 'Bs ' + params.amount : '$' + Number(params.amount).toFixed(2)}\n🏷️ *Categoría:* ${params.category || 'Materiales'}\n${params.provider ? '🏪 *Proveedor:* ' + params.provider : ''}`,
        actionTaken: 'create_cost',
        recordId: res.recordId
      };
    }

    // 6. CREATE COMMITMENT (COMPROMISO / CXP)
    if (intent === 'create_commitment') {
      const res = await createRecord({
        entry_type: 'commitment',
        amount: params.amount,
        currency: params.currency || 'USD',
        description: params.description,
        provider: params.provider || 'Proveedor',
        project_id: params.projectId,
        category: params.category || 'materials',
        mode: 'direct'
      });
      return {
        replyText: `✅ *Compromiso y Cuenta por Pagar Registrados*\n📝 *Detalle:* ${params.description}\n👤 *Proveedor/Obrero:* ${params.provider || 'Proveedor'}\n💰 *Monto:* $${Number(params.amount).toFixed(2)}\n💳 *Sincronizado en:* Módulo de Cuentas por Pagar`,
        actionTaken: 'create_commitment',
        recordId: res.commitmentId
      };
    }

    // 7. CREATE CLIENT PAYMENT
    if (intent === 'create_client_payment') {
      const res = await createRecord({
        entry_type: 'client_payment',
        amount: params.amount,
        currency: params.currency || 'USD',
        description: params.description || 'Abono recibido',
        project_id: params.projectId,
        mode: 'direct'
      });
      return {
        replyText: `✅ *Cobro/Abono Asentado en Obra*\n💰 *Monto Recibido:* $${Number(params.amount).toFixed(2)}\n📝 *Concepto:* ${params.description || 'Abono de Cliente'}`,
        actionTaken: 'create_client_payment',
        recordId: res.recordId
      };
    }

    // 8. CREATE PARTNER ADVANCE
    if (intent === 'create_partner_advance') {
      const res = await createRecord({
        entry_type: 'partner_advance',
        amount: params.amount,
        currency: params.currency || 'USD',
        partner_name: params.partner_name || 'Socio',
        description: params.description || 'Retiro de socio',
        project_id: params.projectId,
        mode: 'direct'
      });
      return {
        replyText: `✅ *Retiro de Socio Registrado*\n👤 *Socio:* ${params.partner_name || 'Socio'}\n💰 *Monto:* $${Number(params.amount).toFixed(2)}`,
        actionTaken: 'create_partner_advance',
        recordId: res.recordId
      };
    }

    // 9. UPDATE STATUS
    if (intent === 'update_status' && params.projectId) {
      await updateRecord('project', params.projectId, { status: params.new_status || 'in_progress' });
      return {
        replyText: `✅ *Estatus de Obra Actualizado*\n🆔 *Obra ID:* \`${params.projectId}\`\n🚧 *Nuevo Estatus:* ${params.new_status || 'in_progress'}`,
        actionTaken: 'update_status'
      };
    }

    // 10. PROPOSAL REQUEST
    if (intent === 'proposal_request') {
      const proposalText = await generateTechnicalProposal(params.topic || 'Obra General', params.client_name || 'Cliente', params.details);
      return {
        replyText: `📑 *Propuesta Técnica Estructurada:*\n\n${proposalText}`,
        actionTaken: 'proposal_request'
      };
    }

    // 11. DELETE RECORD
    if (intent === 'delete_record' && params.recordId && params.entityType) {
      await deleteRecord(params.entityType, params.recordId);
      return {
        replyText: `🗑️ *Registro de ${params.entityType.toUpperCase()} eliminado permanentemente del sistema.*`,
        actionTaken: 'delete_record'
      };
    }

    // 12. CHAT / GREETING
    return {
      replyText: params.chat_reply || '¡Hola! Soy tu asistente de P&P CONSTRUYE. ¿En qué obra o registro estamos trabajando hoy?',
      actionTaken: 'chat'
    };

  } catch (err: any) {
    console.error('Error executing Telegram agent action:', err);
    return {
      replyText: `⚠️ Ocurrió un error al ejecutar la acción: ${err.message}`
    };
  }
}
