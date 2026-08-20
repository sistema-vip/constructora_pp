import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseAdmin } from './supabase-admin';
import {
  getSystemKpis,
  listCoreEntities,
  createRecord,
  updateRecord,
  deleteRecord,
  generateTechnicalProposal,
  getRecentSystemActivity,
  getProjectDetailedFinancials,
  searchDetailedExpenses,
  SystemActivityItem
} from './system-core';
import {
  getLearnedSkillsContext,
  teachSkillDirectly,
  listLearnedSkills,
  deleteLearnedSkill
} from './agent-learning';

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

export interface TelegramChatMessageItem {
  role: 'user' | 'assistant';
  message_text: string;
  action_taken?: string;
  record_id?: string;
  created_at: string;
}

export interface TelegramAgentResponse {
  replyText: string;
  actionTaken?: string;
  recordId?: string;
}

export async function saveTelegramChatMessage(
  telegramChatId: number,
  role: 'user' | 'assistant',
  messageText: string,
  actionTaken?: string,
  recordId?: string
): Promise<void> {
  if (!telegramChatId || !messageText) return;
  try {
    await supabaseAdmin.from('telegram_chat_history').insert({
      telegram_chat_id: telegramChatId,
      role,
      message_text: messageText,
      action_taken: actionTaken || null,
      record_id: recordId || null
    });
  } catch (err: any) {
    console.error('Error saving telegram chat message to history:', err);
  }
}

export async function getTelegramChatHistory(
  telegramChatId: number,
  limit: number = 8
): Promise<TelegramChatMessageItem[]> {
  if (!telegramChatId) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from('telegram_chat_history')
      .select('role, message_text, action_taken, record_id, created_at')
      .eq('telegram_chat_id', telegramChatId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data.reverse();
  } catch (err: any) {
    console.error('Error fetching telegram chat history:', err);
    return [];
  }
}

export async function processTelegramAgentMessage(
  rawMessage: string,
  context: ClientProjectContext[],
  imageBase64?: string,
  telegramChatId: number = 0,
  telegramUserName: string = 'Telegram User',
  isAdmin: boolean = true,
  chatHistory?: TelegramChatMessageItem[],
  recentActivity?: SystemActivityItem[],
  audioBase64?: string,
  audioMimeType?: string
): Promise<TelegramAgentResponse> {
  if (!genAI) {
    return { replyText: '❌ Error: GEMINI_API_KEY no configurada en el servidor.' };
  }

  // Cargar historial, actividad y habilidades aprendidas en paralelo
  const [history, activity, learnedSkillsText] = await Promise.all([
    chatHistory ? Promise.resolve(chatHistory) : (telegramChatId ? getTelegramChatHistory(telegramChatId, 8) : Promise.resolve([])),
    recentActivity ? Promise.resolve(recentActivity) : getRecentSystemActivity(8),
    getLearnedSkillsContext(15)
  ]);

  const clienteName = context.map(c => `${c.name}: ${c.projects.map(p => p.title + ' [' + p.id + ']').join(', ')}`).join(' | ');

  const formattedHistory = history.length > 0
    ? history.map(m => `- [${m.role === 'user' ? 'Usuario' : 'Pepe (Tú)'}]: ${m.message_text}`).join('\n')
    : 'Sin mensajes previos en esta sesión.';

  const formattedActivity = activity.length > 0
    ? activity.map(a => `• [${a.typeLabel}] $${a.amount_usd.toFixed(2)} - "${a.description}" | Obra: ${a.project_title || 'General'} (${a.client_name || 'Particular'})${a.provider_or_partner ? ' | Por/Para: ' + a.provider_or_partner : ''} [ID: ${a.id}]`).join('\n')
    : 'No hay registros recientes.';

  const prompt = `
Eres Pepe, el copiloto y asistente administrativo inteligente de P&P CONSTRUYE con permisos de Super Administrador.
Tu misión es actuar como un asistente de construcción humano: inteligente, metódico, guiado paso a paso y con cero alucinaciones.

── HABILIDADES Y REGLAS APRENDIDAS (BASE DE CONOCIMIENTO VIVA) ──
${learnedSkillsText}

── MEMORIA: HISTORIAL DE CONVERSACIÓN RECIENTE (LO QUE SE ESTÁ HABLANDO EN ESTE CHAT AHORA) ──
${formattedHistory}

── AUDITORÍA HISTÓRICA DEL SISTEMA (REGISTROS VIEJOS YA GUARDADOS EN BD - SOLO CONSULTAS INFORMATIVAS) ──
${formattedActivity}

── CONTEXTO DE CLIENTES Y OBRAS EN EL SISTEMA (usa los IDs exactos para projectId y client_id) ──
${clienteName}

Full context:
${JSON.stringify(context, null, 2)}

══════════════════════════════════════════════════════════════════════════════
REGLAS CRÍTICAS DE PRELACIÓN: FACTURA PENDIENTE EN CHAT vs REGISTROS VIEJOS
══════════════════════════════════════════════════════════════════════════════
⚠️ ADVERTENCIA CRÍTICA CONTRA CONFUSIONES:
- La sección "AUDITORÍA HISTÓRICA DEL SISTEMA" contiene registros del pasado que YA FUERON GUARDADOS en la base de datos (ej. PAINTSHOP, compras de días anteriores).
- ¡ESTÁ ESTRICTAMENTE PROHIBIDO usar montos, proveedores o conceptos de la AUDITORÍA HISTÓRICA para asentar un gasto nuevo!
- La AUDITORÍA HISTÓRICA SOLO se consulta si el usuario pregunta expresamente: "¿cuánto se gastó ayer?", "¿cuál fue el último registro?", etc.

1. CASO A: FACTURA LEÍDA EN EL CHAT ➡️ EL USUARIO INDICA EL PROYECTO AHORA:
   - Si en el HISTORIAL DE CONVERSACIÓN RECIENTE (el último mensaje del bot) aparece una factura o compra procesada (ej. "He procesado la nota de consumo Nº 104455 de FERREVEN 3000, C.A. por ... Total: Bs. 13.520,00"), Y en este mensaje el usuario responde con el cliente o proyecto (ej. "El de ZULLY GUERRERO, ADECUACIÓN CON DEMOLICIÓN Y ACABADOS"):
     👉 ESTE NUEVO GASTO PERTENECE 100% A ESA FACTURA (FERREVEN 3000, C.A. por Bs. 13.520,00).
     👉 ¡PROHIBIDO mirar la AUDITORÍA HISTÓRICA (PAINTSHOP u otros)!
     👉 EXTRAE OBLIGATORIAMENTE los datos de la factura leída en el chat:
        • provider: El proveedor de la factura del chat (ej. "FERREVEN 3000, C.A.")
        • amount: El total numérico de la factura del chat (ej. 13520)
        • currency: "VES" (si estaba en Bs.) o "USD" (si estaba en $)
        • description: Los ítems detallados de la factura del chat (ej. "Disco 4.1/2\" Diamantado Turbo Brullen, Pega P.V.C. Tubopeg 1/32G (Nota #104455)")
        • projectId: El ID del proyecto indicado por el usuario (ej. ID de "ADECUACIÓN CON DEMOLICIÓN Y ACABADOS" de Zully)
        • intent: "create_cost"
     👉 ASENTA EL REGISTRO DIRECTAMENTE y confirma el éxito con esos datos exactos.

2. CASO B: PROYECTO CONVERSADO EN EL CHAT ➡️ EL USUARIO ENVÍA LA FOTO AHORA:
   - Si en el chat el usuario ya indicó la obra (ej. "en la cocina de Zully") y ahora envía la foto de la factura:
     👉 ASOCIA la foto con esa obra y ASENTA EL REGISTRO INMEDIATAMENTE en esa obra usando los datos de la foto actual.

3. CASO C: FOTO LEÍDA SIN PROYECTO:
   - Extrae con máxima precisión: provider, amount, currency, description, payment_reference.
   - En "chat_reply", resume con exactitud los datos leídos para que queden guardados en el historial del chat:
     "¡Recibido! He procesado la factura de [Proveedor] por la compra de: [Items]. Total: [Moneda] [Monto]. 👤 ¿A qué cliente o proyecto deseas asignarle este gasto?"
   - Pasa en el JSON los datos extraídos ("amount", "currency", "provider", "description", "payment_reference").

4. REGLA DE ORO CONTRA BUCLES:
   - Si entre la foto (actual o del historial) y el texto (actual o del historial) ya tienes: [Proyecto] + [Monto] + [Concepto], NUNCA vuelvas a preguntar. EJECUTA EL REGISTRO DIRECTAMENTE.

══════════════════════════════════════════════════════════════════════════════
ÁRBOL DE DECISIÓN CONVERSACIONAL GUIADO (PASO A PASO - CERO VOLCADOS CIEGOS):
══════════════════════════════════════════════════════════════════════════════
1. PASO 1 - INTENCIÓN GENÉRICA SIN CLIENTE NI OBRA:
   - Si el usuario dice "quiero registrar un gasto", "carguemos un pago", "voy a registrar algo":
     • Usa intent "chat".
     • En "chat_reply" pregunta educadamente:
       "¡Perfecto! Vamos a registrar el gasto. 👤 ¿A qué **cliente** deseas hacerle el cargo? (O dime directamente el nombre de la obra)."

2. PASO 2 - CLIENTE INDICADO, PERO FALTA SELECCIONAR LA OBRA:
   - Si el usuario indica un cliente (ej. "Zully", "Carlos", "a nombre de Inversiones ABC") y ese cliente tiene obras:
     • Busca los proyectos de ese cliente en el contexto.
     • Si tiene varios proyectos, agrúpalos y pregunta con claridad:
       "👤 **Cliente: [Nombre Cliente]**. ¿En qué obra deseas registrar el gasto?
       
       🚧 *Obras en Ejecución:*
       • [Título Obra 1]
       
       📄 *Propuestas / Pendientes por Aprobar:*
       • [Título Obra 2]
       
       ¿Deseas afectar una obra activa o una propuesta pendiente?"
     • Si tiene solo 1 proyecto, selecciónalo directamente y pasa al Paso 3.

3. PASO 3 - OBRA SELECCIONADA, PERO FALTA MONTO O CONCEPTO:
   - Si el usuario indica la obra (ej. "en la cocina", "en adecuación y acabados", "en la propuesta de fachada") Y NO hay una factura previa en la memoria:
     • Identifica el "projectId" exacto.
     • Usa intent "chat".
     • En "chat_reply" solicita los datos puntuales:
       "¡Entendido! Para la obra **[Nombre de Obra] ([Nombre de Cliente])**: ¿Cuál fue el monto gastado, concepto y proveedor? (Puedes escribirlo, enviar foto de factura o enviar una nota de voz 🎙️)."

4. PASO 4 - ASENTAMIENTO CON DATOS COMPLETOS:
   - Si se cuenta con monto, concepto y obra (provistos en este mensaje o rescatados de la memoria conversacional previa):
     • Usa intent "create_cost" (o "create_commitment" / "create_client_payment").
     • Asienta el registro y muestra la confirmación detallada.

══════════════════════════════════════════════════════════════════════════════
REGLAS DE MULTIMODALIDAD (FOTO + TEXTO + NOTA DE VOZ):
══════════════════════════════════════════════════════════════════════════════
1. FOTO + TEXTO COMPLEMENTARIO:
   - Si el usuario envía una foto (factura/recibo) Y un texto explicativo (ej. foto + "para la obra de Zully, nos hicieron 10$ de descuento"):
     • OCR DE LA IMAGEN: Extrae razón social en "provider" (Ferretería EPA, RIF, etc.), desglose de productos en "description", subtotal/total y nro. de factura.
     • TEXTO COMPLEMENTARIO: Aplica las instrucciones de cliente/obra y modificaciones de monto indicadas en el texto.
     • Combina AMBOS para generar el registro perfecto.
2. NOTAS DE VOZ (AUDIO):
   - Si se adjunta un audio/nota de voz, escucha con total nitidez lo que dijo el usuario, extrae todas las entidades y responde o asienta con la misma exactitud que un mensaje escrito.

REGLAS DE AUTO-APRENDIZAJE Y HABILIDADES:
1. APLICA TUS HABILIDADES: Revisa las "HABILIDADES Y REGLAS APRENDIDAS". Aplica siempre los alias y reglas del negocio allí indicadas.
2. ENSEÑANZA DIRECTA: Si el usuario te enseña o pide recordar algo (ej. "Pepe, aprende que..."), usa intent "teach_skill" con la regla en "description".
3. CONSULTA DE HABILIDADES: Si el usuario pregunta qué has aprendido, usa intent "list_skills".
4. OLVIDAR REGLA: Si el usuario pide olvidar una regla, usa intent "forget_skill".

REGLAS DE CONSULTA Y DESGLOSE FINANCIERO DE OBRAS:
1. Si el usuario pregunta cuáles son los gastos ejecutados en una obra (ej. "¿cuáles son los gastos en el proyecto X de Zully?"): usa intent "project_financial_breakdown" y extrae "projectId" y/o "client_name".
2. Si el usuario busca gastos específicos por concepto o proveedor: usa intent "search_expenses".

INTENTS DISPONIBLES:
1. "teach_skill": Enseñar una nueva regla, alias o habilidad (description: instrucción completa).
2. "list_skills": Consultar la lista de habilidades y reglas que el bot ha aprendido.
3. "forget_skill": Olvidar o eliminar una regla aprendida (query: término o ID).
4. "project_financial_breakdown": Desglose completo ítem por ítem de gastos, compromisos y pagos de una obra específica (projectId o client_name).
5. "search_expenses": Búsqueda y filtrado de gastos específicos por concepto, material, proveedor o categoría (query, provider, category, projectId, client_name).
6. "kpi_query": Saldos, presupuestos, cobrado, gastado global o de obra.
7. "entity_query": Listar proyectos/clients/payables SOLO SI EL USUARIO LO PIDE EXPRESAMENTE ("/proyectos").
8. "recent_activity": Ver lista de últimos movimientos o registros realizados recientemente.
9. "create_client": Crear cliente (client_name, phone, company_name, email).
10. "create_project": Crear obra/propuesta (title, client_id, amount).
11. "create_cost": Gasto directo (amount, currency, description, project_id, category, provider, payment_reference).
12. "create_commitment": Deuda/compromiso a proveedor (amount, currency, description, provider, project_id, category).
13. "create_client_payment": Cobro de cliente (amount, currency, description, project_id, payment_reference).
14. "create_partner_advance": Retiro de socio (amount, currency, partner_name, description, project_id).
15. "update_status": Cambiar estatus de obra (project_id, new_status: "in_progress"|"completed"|"cancelled"|"proposal").
16. "proposal_request": Redactar propuesta técnica (topic, client_name, details).
17. "delete_record": Eliminar registro (entityType, recordId).
18. "chat": Saludos, aclaraciones, diálogo guiado paso a paso, respuestas sobre acciones pasadas o conversación casual.

Responde ÚNICAMENTE con este JSON (sin markdown, sin texto extra):
{
  "intent": "<intent>",
  "params": {
    "projectId": "<UUID o null>",
    "entityType": "<projects|clients|payables|null>",
    "amount": 0,
    "currency": "USD",
    "description": "<string>",
    "provider": "<nombre de proveedor/ferretería/tienda o null>",
    "payment_reference": "<nro de factura o comprobante o null>",
    "client_name": "<string o null>",
    "client_id": "<UUID o null>",
    "category": "materials",
    "partner_name": null,
    "title": null,
    "new_status": null,
    "topic": null,
    "details": null,
    "recordId": null,
    "query": "<término de búsqueda para search_expenses o null>",
    "chat_reply": "<respuesta en español para el diálogo guiado paso a paso, chat o aclaraciones>"
  }
}

Mensaje del usuario:
"${rawMessage || (audioBase64 ? 'Nota de voz adjunta' : imageBase64 ? 'Foto adjunta' : 'Mensaje multimedia')}"
`;

  const fallbackModels = (imageBase64 || audioBase64)
    ? ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite']
    : ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'];

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
      if (audioBase64) {
        contents[0].parts.push({
          inlineData: {
            mimeType: audioMimeType || 'audio/ogg',
            data: audioBase64,
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
    if (['kpi_query', 'entity_query', 'project_financial_breakdown', 'search_expenses', 'create_client', 'create_project', 'update_status', 'delete_record'].includes(intent)) {
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
    // 00a. TEACH SKILL (ENSEÑANZA DIRECTA DE HABILIDAD / REGLA)
    if (intent === 'teach_skill') {
      const teachRes = await teachSkillDirectly(params.description || rawMessage);
      return {
        replyText: teachRes.message,
        actionTaken: 'teach_skill'
      };
    }

    // 00b. LIST LEARNED SKILLS (LISTADO DE HABILIDADES APRENDIDAS)
    if (intent === 'list_skills') {
      const skills = await listLearnedSkills();
      if (skills.length === 0) {
        return {
          replyText: 'ℹ️ Aún no tengo habilidades o reglas personalizadas guardadas. Puedes enseñarme diciéndome: _"Pepe, aprende que..."_ o _"Recuerda que..."_',
          actionTaken: 'list_skills_empty'
        };
      }
      let msg = `🧠 *Habilidades y Reglas que he Aprendido (${skills.length}):*\n\n`;
      skills.forEach((s, idx) => {
        msg += `${idx + 1}. *[${s.category.toUpperCase()}]* \`${s.skill_key}\`\n   📖 ${s.description}\n`;
      });
      return {
        replyText: msg.trim(),
        actionTaken: 'list_skills'
      };
    }

    // 00c. FORGET SKILL (ELIMINAR HABILIDAD)
    if (intent === 'forget_skill') {
      const queryTerm = (params.query || params.description || '').toLowerCase();
      const skills = await listLearnedSkills();
      const matched = skills.find(s => s.id === params.recordId || s.skill_key.toLowerCase().includes(queryTerm) || s.description.toLowerCase().includes(queryTerm));
      if (matched) {
        await deleteLearnedSkill(matched.id);
        return {
          replyText: `🗑️ *Regla olvidada:* He eliminado la regla \`${matched.skill_key}\` de mi base de conocimiento.`,
          actionTaken: 'forget_skill'
        };
      }
      return {
        replyText: `❓ No encontré ninguna regla o habilidad que coincida con "${params.query || params.description}".`,
        actionTaken: 'forget_skill_not_found'
      };
    }

    // 0a. PROJECT FINANCIAL BREAKDOWN (DESGLOSE COMPLETO DE GASTOS DE UNA OBRA)
    if (intent === 'project_financial_breakdown') {
      let targetProjectId = params.projectId;

      // Si no tenemos projectId pero sí client_name o nombre de obra en el texto, buscar en context
      if (!targetProjectId && (params.client_name || params.description || rawMessage)) {
        const term = (params.client_name || params.description || rawMessage || '').toLowerCase();
        for (const client of context) {
          if (term.includes(client.name.toLowerCase()) || client.name.toLowerCase().includes(term)) {
            if (client.projects.length === 1) {
              targetProjectId = client.projects[0].id;
              break;
            }
          }
          for (const proj of client.projects) {
            if (term.includes(proj.title.toLowerCase()) || proj.title.toLowerCase().includes(term)) {
              targetProjectId = proj.id;
              break;
            }
          }
          if (targetProjectId) break;
        }
      }

      if (!targetProjectId) {
        return {
          replyText: `❓ ¿De cuál obra deseas consultar el desglose de gastos? Por favor especifica el nombre del proyecto o cliente.\n\n_Ejemplo: "¿Cuáles son los gastos de la cocina de Zully?"_`,
          actionTaken: 'ask_project_for_breakdown'
        };
      }

      const fin = await getProjectDetailedFinancials(targetProjectId);

      let msg = `🏗️ *Detalle de Gastos: ${fin.title}*\n`;
      msg += `👤 *Cliente:* ${fin.clientName}\n`;
      msg += `💰 *Presupuesto:* $${Number(fin.budgetUsd).toFixed(2)} | 💵 *Cobrado:* $${Number(fin.totalCollectedUsd).toFixed(2)}\n`;
      msg += `📉 *Total Gastos Ejecutados:* $${Number(fin.totalCostsUsd).toFixed(2)}\n`;
      msg += `💎 *Saldo por Cobrar:* $${Number(fin.remainingBalanceUsd).toFixed(2)} | *Margen Est.:* ${fin.marginPercentage}%\n\n`;

      if (fin.costs.length === 0) {
        msg += `ℹ️ *No se han asentado gastos ejecutados aún en esta obra.*\n`;
      } else {
        msg += `📋 *Gastos Ejecutados (${fin.costs.length}):*\n`;
        fin.costs.slice(0, 15).forEach((c, idx) => {
          msg += `${idx + 1}. 📅 *${c.date}* | 🏪 *${c.provider}*\n   📝 ${c.description}\n   💰 *$${Number(c.total_usd).toFixed(2)}* _(${c.category})_\n`;
        });
        if (fin.costs.length > 15) {
          msg += `\n_...y ${fin.costs.length - 15} gastos adicionales registrados en el sistema web._\n`;
        }
      }

      if (fin.commitments.length > 0) {
        msg += `\n💳 *Compromisos / Cuentas por Pagar (${fin.commitments.length}):*\n`;
        fin.commitments.forEach(com => {
          msg += `• *${com.provider}:* $${Number(com.amount_usd).toFixed(2)} (${com.description})\n`;
        });
      }

      return {
        replyText: msg.trim(),
        actionTaken: 'project_financial_breakdown',
        recordId: targetProjectId
      };
    }

    // 0b. SEARCH EXPENSES (BÚSQUEDA PUNTUAL DE GASTOS POR PROVEEDOR/CONCEPTO)
    if (intent === 'search_expenses') {
      const results = await searchDetailedExpenses({
        projectId: params.projectId || undefined,
        clientName: params.client_name || undefined,
        category: params.category || undefined,
        provider: params.provider || undefined,
        query: params.query || params.description || undefined,
        limit: 12
      });

      if (results.length === 0) {
        return {
          replyText: `🔍 No encontré gastos que coincidan con tu búsqueda${params.provider ? ' para el proveedor "' + params.provider + '"' : ''}${params.query ? ' ("' + params.query + '")' : ''}.`,
          actionTaken: 'search_expenses_empty'
        };
      }

      const totalMatched = results.reduce((acc: number, r: any) => acc + (Number(r.total_usd) || 0), 0);
      let msg = `🔍 *Resultados de Gastos Encontrados (${results.length}):*\n`;
      msg += `💰 *Suma Total:* $${Number(totalMatched).toFixed(2)}\n\n`;

      results.forEach((r, idx) => {
        msg += `${idx + 1}. 📅 *${r.date}* | 🏪 *${r.provider}*\n   📝 ${r.description}\n   💰 *$${Number(r.total_usd).toFixed(2)}* | 🏗️ ${r.project_title} (${r.client_name})\n`;
      });

      return {
        replyText: msg.trim(),
        actionTaken: 'search_expenses'
      };
    }

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

      // Filtrado inteligente por cliente si se especifica
      let filtered = list;
      if (params.client_name) {
        const clientSearch = params.client_name.toLowerCase().trim();
        const matched = list.filter((p: any) => p.client_name?.toLowerCase().includes(clientSearch));
        if (matched.length > 0) {
          filtered = matched;
        }
      }

      // Filtrado por estado si se pide (en ejecución o aprobados)
      const rawLower = (rawMessage || '').toLowerCase();
      if (rawLower.includes('ejecucion') || rawLower.includes('ejecución') || rawLower.includes('aprobado')) {
        const inProgress = filtered.filter((p: any) => p.status === 'in_progress');
        if (inProgress.length > 0) {
          filtered = inProgress;
        }
      }

      let msg = params.chat_reply ? `${params.chat_reply}\n\n` : '';
      msg += `📋 *Obras Encontradas (${filtered.length}):*\n\n`;
      if (filtered.length === 0) {
        msg += `ℹ️ No se encontraron proyectos activos para el cliente indicado.`;
      } else {
        filtered.slice(0, 10).forEach((p: any) => {
          const statusLabel = p.status === 'in_progress' ? '🚧 En ejecución' : p.status === 'proposal' ? '📄 Propuesta' : p.status;
          msg += `• *${p.title}* (${statusLabel})\n  👤 Cliente: ${p.client_name} | 💰 Presupuesto: $${Number(p.budget_usd).toFixed(2)} | 💵 Cobrado: $${Number(p.total_collected_usd).toFixed(2)}\n\n`;
        });
      }
      return { replyText: msg.trim(), actionTaken: 'list_projects' };
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

      let projectInfo = '';
      if (params.projectId) {
        for (const c of context) {
          const p = c.projects.find(proj => proj.id === params.projectId);
          if (p) {
            projectInfo = `\n🏗️ *Obra:* ${p.title} (${c.name})`;
            break;
          }
        }
      }

      const formattedAmount = params.currency === 'VES'
        ? 'Bs ' + Number(params.amount).toLocaleString('es-VE')
        : '$' + Number(params.amount).toFixed(2);

      return {
        replyText: `✅ *Gasto Asentado en Obra*${projectInfo}\n📝 *Concepto:* ${params.description}\n💰 *Monto:* ${formattedAmount}\n🏷️ *Categoría:* ${params.category || 'Materiales'}\n${params.provider ? '🏪 *Proveedor:* ' + params.provider : ''}`,
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

    // 12. RECENT ACTIVITY QUERY
    if (intent === 'recent_activity') {
      const activity = await getRecentSystemActivity(8);
      if (!activity || activity.length === 0) {
        return {
          replyText: 'ℹ️ No hay movimientos o registros recientes en el sistema.',
          actionTaken: 'recent_activity'
        };
      }
      let msg = `🕒 *Últimos Movimientos Registrados (${activity.length}):*\n\n`;
      activity.forEach((item, idx) => {
        msg += `${idx + 1}. *[${item.typeLabel}]* $${Number(item.amount_usd).toFixed(2)}\n`;
        msg += `   📝 ${item.description}\n`;
        msg += `   🏗️ ${item.project_title || 'General'}${item.client_name ? ' (' + item.client_name + ')' : ''}\n\n`;
      });
      return {
        replyText: msg.trim(),
        actionTaken: 'recent_activity'
      };
    }

    // 13. CHAT / GREETING / MEMORY RESPONSE
    return {
      replyText: params.chat_reply || '¡Hola! Soy Pepe, tu asistente de P&P CONSTRUYE. ¿En qué obra o registro estamos trabajando hoy?',
      actionTaken: 'chat'
    };

  } catch (err: any) {
    console.error('Error executing Telegram agent action:', err);
    return {
      replyText: `⚠️ Ocurrió un error al ejecutar la acción: ${err.message}`
    };
  }
}
