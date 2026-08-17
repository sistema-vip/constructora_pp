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

  const prompt = `
Eres Spark / Pepe, el copiloto inteligente de P&P CONSTRUYE.
Tu misión es interpretar la intención del usuario a partir de su texto, audio o foto de recibo, y ejecutar la acción correcta en el sistema.

Contexto actual de Clientes y Obras activas:
${JSON.stringify(context, null, 2)}

INSTRUCCIONES DE CLASIFICACIÓN DE INTENCIÓN:
1. "kpi_query": Preguntas sobre saldos, presupuestos, cobrado, gastado o balance (ej. "¿cuánto saldo queda a Zully?", "dame el resumen de la obra de bomba", "cuánto dinero hay disponible").
   - Extrae "projectId" si menciona o coincide con alguna obra del contexto.

2. "entity_query": Listar proyectos, clientes o cuentas por pagar (ej. "dame la lista de clientes", "cuáles son las cuentas por pagar", "muéstrame las obras").
   - entityType: "projects" | "clients" | "payables".

3. "create_client": Crear nuevo cliente (ej. "crea un cliente llamado Inversiones ABC teléfono 0414...").
   - client_name, phone, company_name, email.

4. "create_project": Crear nueva obra o propuesta (ej. "crea una obra llamada Remodelación Cocina para Zully presupuesto 1500$").
   - title, client_id (del contexto si existe), amount.

5. "create_cost": Registrar gasto directo (ej. "gasté 85$ en cemento para Zully", o foto de recibo de compra).
   - amount, currency ("USD" o "VES"), description, project_id, category ("materials", "labor", "equipment", "subcontract", "other"), provider.

6. "create_commitment": Registrar deuda/compromiso a pagar a proveedor u obrero (ej. "carga un compromiso de 150$ para Carlos Herrero en la obra de Zully").
   - amount, currency ("USD" o "VES"), description, provider, project_id, category.

7. "create_client_payment": Registrar cobro o abono de cliente (ej. "Zully abonó 500$").
   - amount, currency, description, project_id.

8. "create_partner_advance": Retiro de socio (ej. "retiro de socio Henry 300$").
   - amount, currency, partner_name, description.

9. "update_status": Cambiar estatus de una obra (ej. "pasa la propuesta de Zully a en ejecución / aprobada", "cancela la propuesta X").
   - project_id, new_status ("in_progress", "completed", "cancelled", "proposal").

10. "proposal_request": Redactar o analizar propuesta técnica (ej. "ayúdame a redactar una propuesta para impermeabilizar 100m2 para Carlos").
    - topic, client_name, details.

11. "delete_record": Borrar un registro específico si se menciona ID o solicitud expresa.
    - entityType, recordId.

12. "chat": Saludos, preguntas generales de construcción o conversación casual.

Si hay foto adjunta (recibo/factura), examínala para extraer monto, comercio y concepto.

Responde ÚNICAMENTE con este JSON:
{
  "intent": "kpi_query" | "entity_query" | "create_client" | "create_project" | "create_cost" | "create_commitment" | "create_client_payment" | "create_partner_advance" | "update_status" | "proposal_request" | "delete_record" | "chat",
  "params": {
    "projectId": "string UUID o null",
    "entityType": "projects" | "clients" | "payables" | "cost" | "commitment" | "project" | null,
    "amount": 0,
    "currency": "USD" | "VES",
    "description": "string",
    "provider": "string o null",
    "client_name": "string o null",
    "client_id": "string UUID o null",
    "category": "materials" | "labor" | "equipment" | "subcontract" | "other",
    "partner_name": "string o null",
    "title": "string o null",
    "new_status": "in_progress" | "completed" | "cancelled" | "proposal" | null,
    "topic": "string o null",
    "details": "string o null",
    "recordId": "string o null",
    "chat_reply": "string con respuesta amigable si es intent chat"
  }
}

Mensaje del usuario:
"${rawMessage || 'Foto adjunta'}"
`;

  const fallbackModels = imageBase64 
    ? ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-flash-latest']
    : ['gemini-1.5-flash', 'gemini-flash-latest', 'gemini-1.5-pro'];

  let parsedDecision: any = null;

  for (const modelName of fallbackModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const contents: any[] = [prompt];
      if (imageBase64) {
        contents.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBase64,
          },
        });
      }

      const result = await model.generateContent(contents);
      parsedDecision = JSON.parse(result.response.text());
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
