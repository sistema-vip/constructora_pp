import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  processTelegramAgentMessage,
  ClientProjectContext,
  saveTelegramChatMessage,
  getTelegramChatHistory,
  detectUserIntent,
  extractExpenseEntities,
  ExpenseEntities
} from '@/lib/telegram-ai';
import { getRecentSystemActivity, createRecord } from '@/lib/system-core';
import { autoExtractLearningFromCorrection } from '@/lib/agent-learning';

export const dynamic = 'force-dynamic';

// ══════════════════════════════════════════════════════════════════
// TIPOS DE SESIÓN
// ══════════════════════════════════════════════════════════════════
interface TelegramSession {
  id: string;
  telegram_chat_id: number;
  state: 'awaiting_expense_data' | 'awaiting_project' | 'awaiting_project_selection';
  amount: number | null;
  currency: string;
  description: string | null;
  provider: string | null;
  payment_reference: string | null;
  category: string;
  project_id: string | null;
  client_name: string | null;
  project_options: Array<{ id: string; title: string; clientName: string }> | null;
  telegram_user_name: string | null;
  expires_at: string;
}

// ══════════════════════════════════════════════════════════════════
// HELPERS DE SESIÓN
// ══════════════════════════════════════════════════════════════════

async function ensureSessionTableExists(): Promise<void> {
  // Crear la tabla si no existe (auto-migración en primer uso)
  try {
    await supabaseAdmin.rpc('create_telegram_sessions_if_not_exists');
  } catch {
    // Si la función RPC no existe, la tabla ya debe existir o se creará en el deploy
  }
}

async function getActiveSession(chatId: number): Promise<TelegramSession | null> {
  const { data, error } = await supabaseAdmin
    .from('telegram_sessions')
    .select('*')
    .eq('telegram_chat_id', chatId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as TelegramSession;
}

async function createSession(
  chatId: number,
  state: TelegramSession['state'],
  telegramUserName: string,
  entities?: Partial<ExpenseEntities>
): Promise<TelegramSession> {
  // Eliminar cualquier sesión existente primero
  await supabaseAdmin.from('telegram_sessions').delete().eq('telegram_chat_id', chatId);

  const { data, error } = await supabaseAdmin
    .from('telegram_sessions')
    .insert({
      telegram_chat_id: chatId,
      state,
      telegram_user_name: telegramUserName,
      amount: entities?.amount ?? null,
      currency: entities?.currency ?? 'USD',
      description: entities?.description ?? null,
      provider: entities?.provider ?? null,
      payment_reference: entities?.payment_reference ?? null,
      category: entities?.category ?? 'materials',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    })
    .select()
    .single();

  if (error) throw new Error(`Error creando sesión: ${error.message}`);
  return data as TelegramSession;
}

async function updateSession(chatId: number, updates: Partial<TelegramSession>): Promise<void> {
  await supabaseAdmin
    .from('telegram_sessions')
    .update({ ...updates, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
    .eq('telegram_chat_id', chatId);
}

async function deleteSession(chatId: number): Promise<void> {
  await supabaseAdmin.from('telegram_sessions').delete().eq('telegram_chat_id', chatId);
}

// ══════════════════════════════════════════════════════════════════
// HELPER: FUZZY MATCH DE PROYECTOS
// ══════════════════════════════════════════════════════════════════

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // quitar tildes
    .replace(/[^a-z0-9\s]/g, ' ')     // solo alfanumérico
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyMatchProjects(
  text: string,
  context: ClientProjectContext[]
): Array<{ id: string; title: string; clientName: string }> {
  const textNorm = normalize(text);
  const stopWords = new Set([
    'para', 'obra', 'proyecto', 'cliente', 'gasto', 'el', 'la', 'de', 'en',
    'con', 'y', 'los', 'las', 'un', 'una', 'ese', 'esa', 'este', 'esta',
    'del', 'al', 'por', 'que', 'a', 'los', 'mia', 'mi'
  ]);

  const words = textNorm
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  const scored: Array<{ id: string; title: string; clientName: string; score: number }> = [];

  for (const client of context) {
    const clientNorm = normalize(client.name);

    for (const proj of client.projects) {
      const projNorm = normalize(proj.title);
      const fullTarget = `${clientNorm} ${projNorm}`;
      let score = 0;

      // Match directo: el texto contiene el nombre completo del cliente o proyecto
      if (textNorm.includes(clientNorm) || clientNorm.includes(textNorm)) score += 10;
      if (textNorm.includes(projNorm) || projNorm.includes(textNorm)) score += 10;

      // Match por keywords individuales
      for (const word of words) {
        if (fullTarget.includes(word)) score += 1;
      }

      if (score > 0) {
        scored.push({ id: proj.id, title: proj.title, clientName: client.name, score });
      }
    }
  }

  // Ordenar por score descendente y devolver solo los mejores
  scored.sort((a, b) => b.score - a.score);

  // Si hay un match con score muy alto (match directo), devolver solo ese
  if (scored.length > 0 && scored[0].score >= 10) {
    return [scored[0]];
  }

  // Devolver hasta 5 matches para mostrar lista
  return scored.slice(0, 5).map(({ id, title, clientName }) => ({ id, title, clientName }));
}

// ══════════════════════════════════════════════════════════════════
// HELPER: EJECUTAR REGISTRO DEL GASTO
// ══════════════════════════════════════════════════════════════════

async function executeExpense(
  session: TelegramSession,
  project: { id: string; title: string; clientName: string },
  isAdmin: boolean,
  chatId: number,
  telegramUserName: string
): Promise<string> {
  const amount = session.amount ?? 0;
  const currency = session.currency || 'USD';
  const isVes = currency === 'VES';
  const formattedAmount = isVes
    ? 'Bs ' + Number(amount).toLocaleString('es-VE')
    : '$' + Number(amount).toFixed(2);

  const res = await createRecord({
    entry_type: 'cost',
    amount,
    currency,
    description: session.description || 'Gasto registrado por Telegram',
    project_id: project.id,
    category: session.category || 'materials',
    provider: session.provider || undefined,
    payment_reference: session.payment_reference || undefined,
    mode: isAdmin ? 'direct' : 'draft',
    telegram_chat_id: chatId,
    telegram_user_name: telegramUserName
  });

  // Si es VES y no hay tasa, guardar pendiente para tasa de cambio
  if (isVes && isAdmin) {
    try {
      await supabaseAdmin.from('telegram_pending_entries').insert({
        description: session.description || 'Gasto en Bs',
        amount_usd: 0,
        entry_type: 'cost',
        project_id: project.id,
        category: session.category || 'materials',
        provider: session.provider || null,
        payment_reference: session.payment_reference || null,
        status: 'pending',
        telegram_chat_id: chatId,
        telegram_user_name: telegramUserName,
        raw_message: `Gasto de ${formattedAmount}`,
        ai_parsed_data: {
          original_amount: amount,
          original_currency: 'VES',
          description: session.description,
          provider: session.provider,
          payment_reference: session.payment_reference,
          category: session.category
        }
      });
    } catch (e) {
      console.error('Error insertando telegram_pending_entries:', e);
    }

    return `✅ *Gasto Asentado en Obra*\n🏗️ *Obra:* ${project.title} (${project.clientName})\n📝 *Concepto:* ${session.description}\n💰 *Monto:* ${formattedAmount}\n🏷️ *Categoría:* ${session.category || 'Materiales'}${session.provider ? '\n🏪 *Proveedor:* ' + session.provider : ''}\n\n⚠️ *Gasto en Bolívares:* Para convertir a USD, responde con la tasa de cambio (ej: _"tasa 92"_).`;
  }

  return `✅ *Gasto Asentado en Obra*\n🏗️ *Obra:* ${project.title} (${project.clientName})\n📝 *Concepto:* ${session.description || 'Gasto registrado'}\n💰 *Monto:* ${formattedAmount}\n🏷️ *Categoría:* ${session.category || 'Materiales'}${session.provider ? '\n🏪 *Proveedor:* ' + session.provider : ''}${res.recordId ? '\n🆔 *ID:* `' + res.recordId + '`' : ''}`;
}

// ══════════════════════════════════════════════════════════════════
// WEBHOOK PRINCIPAL
// ══════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    const message = update.message || update.edited_message;
    if (!message) return NextResponse.json({ ok: true });

    const photos = message.photo;
    const voice = message.voice;
    const audio = message.audio;
    const messageText = (message.caption || message.text || '').trim();

    // Solo procesamos si hay texto, foto o audio
    if (!messageText && (!photos || photos.length === 0) && !voice && !audio) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const fromId = message.from?.id;
    const telegramUserName = message.from?.username || message.from?.first_name || 'Telegram User';
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    // ── 1. Descargar foto si la hay ──
    let imageBase64: string | undefined;
    if (photos && photos.length > 0) {
      try {
        const highest = photos[photos.length - 1];
        const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${highest.file_id}`);
        const fileData = await fileRes.json();
        if (fileData.ok && fileData.result?.file_path) {
          const imgRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`);
          imageBase64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
        }
      } catch (e) { console.error('Error descargando imagen:', e); }
    }

    // ── 2. Descargar audio/voz si hay ──
    let audioBase64: string | undefined;
    let audioMimeType = 'audio/ogg';
    if (voice || audio) {
      try {
        const fileId = voice?.file_id || audio?.file_id;
        const rawMime = (voice?.mime_type || audio?.mime_type || 'audio/ogg').toLowerCase();
        if (rawMime.includes('mp4') || rawMime.includes('m4a')) audioMimeType = 'audio/mp4';
        else if (rawMime.includes('mp3') || rawMime.includes('mpeg')) audioMimeType = 'audio/mp3';
        else if (rawMime.includes('wav')) audioMimeType = 'audio/wav';
        const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
        const fileData = await fileRes.json();
        if (fileData.ok && fileData.result?.file_path) {
          const audioRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`);
          audioBase64 = Buffer.from(await audioRes.arrayBuffer()).toString('base64');
        }
      } catch (e) { console.error('Error descargando audio:', e); }
    }

    // ── 3. Comando /start ──
    if (messageText.startsWith('/start')) {
      const welcomeMsg = `👋 *¡Hola! Soy Pepe, tu Asistente de P&P CONSTRUYE*\n\nTu ID de Telegram: \`${fromId || chatId}\`\n\n📌 *¿Qué puedo hacer?*\n• 🏗️ *Registrar gasto:* _"Quiero registrar un gasto"_ (o envía la foto directamente)\n• 📊 *Consultar saldos:* _"¿Cuánto queda en la obra de Zully?"_\n• 📝 *Propuestas:* _"Redacta propuesta para 50m2 de piso"_\n• 💳 *Compromisos:* _"Carga compromiso 150$ con Carlos"_\n• 🚧 *Cambiar estatus:* _"Pasa la propuesta de Zully a en ejecución"_\n• ❌ *Cancelar:* _"cancelar"_ (cancela la operación actual)`;
      await sendTelegramMessage(chatId, welcomeMsg);
      await saveTelegramChatMessage(chatId, 'user', messageText);
      await saveTelegramChatMessage(chatId, 'assistant', welcomeMsg, 'start_command');
      return NextResponse.json({ ok: true });
    }

    // ── 4. Verificar usuario autorizado ──
    if (!fromId) return NextResponse.json({ ok: true });
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('id, name, role').eq('telegram_chat_id', fromId).maybeSingle();

    if (!profile) {
      if (message.chat.type === 'private') {
        const msg = `⚠️ *Usuario No Autorizado*\n\nTu ID de Telegram: \`${fromId}\`\nNo estás registrado en P&P CONSTRUYE. Pídele al administrador que registre tu ID.`;
        await sendTelegramMessage(chatId, msg);
        await saveTelegramChatMessage(chatId, 'user', messageText || '[Foto]');
        await saveTelegramChatMessage(chatId, 'assistant', msg, 'unauthorized');
      }
      return NextResponse.json({ ok: true });
    }

    const isAdmin = profile.role === 'admin';

    // ── 5. Guardar mensaje del usuario ──
    const logUserMsg = messageText || (voice ? '🎙️ [Nota de voz]' : audio ? '🎵 [Audio]' : photos ? '📷 [Foto adjunta]' : '');
    await saveTelegramChatMessage(chatId, 'user', logUserMsg);

    // ── 6. Cargar clientes/proyectos y sesión activa en paralelo ──
    const [clientsRes, activeSession] = await Promise.all([
      supabaseAdmin.from('clients').select('id, name, projects(id, title, status)').order('name'),
      getActiveSession(chatId)
    ]);

    const context: ClientProjectContext[] = (clientsRes.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      projects: (c.projects || [])
        .filter((p: any) => p.status !== 'cancelled' && p.status !== 'completed')
        .map((p: any) => ({ id: p.id, title: p.title, status: p.status }))
    }));

    // ── 7. MÁQUINA DE ESTADOS ──

    let replyText = '';
    let actionTaken = 'chat';
    let recordId: string | undefined;

    // Comando de cancelación explícita (funciona en cualquier estado)
    const lowerMsg = messageText.toLowerCase().trim();
    if (activeSession && (lowerMsg === 'cancelar' || lowerMsg === 'cancel' || lowerMsg === 'salir')) {
      await deleteSession(chatId);
      replyText = '❌ *Operación cancelada.* ¿En qué más puedo ayudarte?';
      actionTaken = 'session_cancelled';
      await sendTelegramMessage(chatId, replyText);
      await saveTelegramChatMessage(chatId, 'assistant', replyText, actionTaken);
      return NextResponse.json({ ok: true });
    }

    if (!activeSession) {
      // ─────────────────────────────────────────────
      // ESTADO: SIN SESIÓN
      // Detectar intención: ¿quiere registrar un gasto o algo más?
      // ─────────────────────────────────────────────
      const intent = await detectUserIntent(messageText, !!imageBase64, !!audioBase64);

      if (intent === 'register_expense') {
        // Si además del intent ya trae datos (foto o texto con monto), extraer de inmediato
        if (imageBase64 || audioBase64 || messageText) {
          const entities = await extractExpenseEntities(messageText, imageBase64, audioBase64, audioMimeType);

          if (entities.amount && entities.description) {
            // Tenemos datos completos → crear sesión en estado AWAITING_PROJECT
            await createSession(chatId, 'awaiting_project', telegramUserName, entities);

            const formatted = entities.currency === 'VES'
              ? `Bs. ${Number(entities.amount).toLocaleString('es-VE')}`
              : `$${Number(entities.amount).toFixed(2)} USD`;

            replyText = `✅ *Recibido:*\n📝 *Concepto:* ${entities.description}\n💰 *Monto:* ${formatted}${entities.provider ? '\n🏪 *Proveedor:* ' + entities.provider : ''}\n\n👤 *¿A qué cliente u obra deseas asignar este gasto?*\n_(Escribe el nombre del cliente o de la obra)_`;
            actionTaken = 'awaiting_project';
          } else {
            // No se pudieron extraer datos → crear sesión y pedir datos
            await createSession(chatId, 'awaiting_expense_data', telegramUserName);
            replyText = `📝 *Vamos a registrar el gasto.*\n\nNo pude leer todos los datos. Por favor envía:\n• La foto de la factura/recibo, O\n• El monto, concepto y proveedor en texto\n\n_Ej: "50$ en cemento, proveedor EPA"_\n_(Para cancelar escribe: cancelar)_`;
            actionTaken = 'awaiting_expense_data';
          }
        } else {
          // Solo dijo "quiero registrar gasto" sin datos → pedir la factura
          await createSession(chatId, 'awaiting_expense_data', telegramUserName);
          replyText = `📝 *¡Perfecto! Vamos a registrar el gasto.*\n\nEnvíame:\n• 📷 La foto de la factura/recibo, O\n• ✍️ El monto, concepto y proveedor\n\n_Ej: "85$ en cemento Portland, proveedor EPA"_\n_(Para cancelar escribe: cancelar)_`;
          actionTaken = 'awaiting_expense_data';
        }

      } else {
        // No es registro de gasto → delegar al agente IA completo para KPI, propuestas, chat, etc.
        const [chatHistory, recentActivity] = await Promise.all([
          getTelegramChatHistory(chatId, 8),
          getRecentSystemActivity(8)
        ]);

        const agentResponse = await processTelegramAgentMessage(
          messageText, context, imageBase64, chatId, telegramUserName,
          isAdmin, chatHistory, recentActivity, audioBase64, audioMimeType
        );
        replyText = agentResponse.replyText;
        actionTaken = agentResponse.actionTaken || 'chat';
        recordId = agentResponse.recordId;

        // Auto-aprendizaje pasivo
        const lastAssistantMsg = chatHistory?.length > 0
          ? [...chatHistory].reverse().find(m => m.role === 'assistant')?.message_text
          : undefined;
        autoExtractLearningFromCorrection(messageText || logUserMsg, lastAssistantMsg).catch(() => {});
      }

    } else if (activeSession.state === 'awaiting_expense_data') {
      // ─────────────────────────────────────────────
      // ESTADO: ESPERANDO DATOS DEL GASTO
      // El usuario debe enviar la factura (foto/texto/audio)
      // ─────────────────────────────────────────────
      const entities = await extractExpenseEntities(messageText, imageBase64, audioBase64, audioMimeType);

      if (!entities.amount || !entities.description) {
        // Todavía sin datos suficientes
        replyText = `🔍 No pude extraer el monto o el concepto del gasto. Por favor intenta de nuevo:\n\n• 📷 Envía la foto de la factura, O\n• ✍️ Escribe: _"[monto] en [concepto], proveedor [nombre]"_\n\n_Ej: "120$ en pinturas y rodillos, EPA Ferretería"_\n_(Para cancelar escribe: cancelar)_`;
        actionTaken = 'awaiting_expense_data';
      } else {
        // Datos extraídos con éxito → actualizar sesión y pedir proyecto
        await updateSession(chatId, {
          state: 'awaiting_project',
          amount: entities.amount,
          currency: entities.currency,
          description: entities.description,
          provider: entities.provider,
          payment_reference: entities.payment_reference,
          category: entities.category
        });

        const formatted = entities.currency === 'VES'
          ? `Bs. ${Number(entities.amount).toLocaleString('es-VE')}`
          : `$${Number(entities.amount).toFixed(2)} USD`;

        replyText = `✅ *Recibido:*\n📝 *Concepto:* ${entities.description}\n💰 *Monto:* ${formatted}${entities.provider ? '\n🏪 *Proveedor:* ' + entities.provider : ''}\n\n👤 *¿A qué cliente u obra deseas asignar este gasto?*\n_(Escribe el nombre del cliente o de la obra)_\n_(Para cancelar escribe: cancelar)_`;
        actionTaken = 'awaiting_project';
      }

    } else if (activeSession.state === 'awaiting_project') {
      // ─────────────────────────────────────────────
      // ESTADO: ESPERANDO PROYECTO
      // El usuario indica el cliente/obra
      // ─────────────────────────────────────────────

      // Si manda foto en este estado, es una NUEVA factura → reiniciar flujo
      if (imageBase64) {
        const entities = await extractExpenseEntities(messageText, imageBase64, audioBase64, audioMimeType);
        if (entities.amount && entities.description) {
          await updateSession(chatId, {
            state: 'awaiting_project',
            amount: entities.amount,
            currency: entities.currency,
            description: entities.description,
            provider: entities.provider,
            payment_reference: entities.payment_reference,
            category: entities.category,
            project_options: null
          });
          const formatted = entities.currency === 'VES'
            ? `Bs. ${Number(entities.amount).toLocaleString('es-VE')}`
            : `$${Number(entities.amount).toFixed(2)} USD`;
          replyText = `🔄 *Nuevo comprobante recibido:*\n📝 *Concepto:* ${entities.description}\n💰 *Monto:* ${formatted}${entities.provider ? '\n🏪 *Proveedor/Beneficiario:* ' + entities.provider : ''}\n\n👤 *¿A qué cliente u obra corresponde?*`;
          actionTaken = 'awaiting_project';
        } else {
          replyText = `❌ No pude leer con claridad los datos del comprobante. ¿A qué proyecto asigno el gasto anterior o deseas enviarlo de nuevo?`;
          actionTaken = 'awaiting_project';
        }
      } else {
        // Texto → intentar match de proyecto
        const matches = fuzzyMatchProjects(messageText, context);

        if (matches.length === 1) {
          // ✅ Un solo match → ejecutar directamente
          const successMsg = await executeExpense(activeSession, matches[0], isAdmin, chatId, telegramUserName);
          await deleteSession(chatId);
          replyText = successMsg;
          actionTaken = 'create_cost';
        } else if (matches.length > 1) {
          // Múltiples matches → mostrar lista numerada
          await updateSession(chatId, {
            state: 'awaiting_project_selection',
            project_options: matches
          });
          const list = matches.map((p, i) => `*${i + 1}.* ${p.title} _(${p.clientName})_`).join('\n');
          replyText = `Encontré varias obras que coinciden. ¿En cuál deseas registrar el gasto?\n\n${list}\n\n_Responde con el número (1, 2, 3...)_\n_(Para cancelar escribe: cancelar)_`;
          actionTaken = 'awaiting_project_selection';
        } else {
          // Sin match → pedir más específico, mantener estado
          const clientList = context.slice(0, 8).map(c => `• ${c.name}`).join('\n');
          replyText = `🔍 No encontré ninguna obra que coincida con _"${messageText}"_.\n\nTus clientes registrados:\n${clientList}\n\n¿Puedes escribir el nombre del cliente o de la obra más exacto?\n_(Para cancelar escribe: cancelar)_`;
          actionTaken = 'awaiting_project';
        }
      }

    } else if (activeSession.state === 'awaiting_project_selection') {
      // ─────────────────────────────────────────────
      // ESTADO: ESPERANDO SELECCIÓN DE NÚMERO
      // El usuario elige de una lista numerada
      // ─────────────────────────────────────────────
      const options = (activeSession.project_options || []) as Array<{ id: string; title: string; clientName: string }>;
      const num = parseInt(messageText.trim());

      if (!isNaN(num) && num >= 1 && num <= options.length) {
        // Selección válida
        const chosen = options[num - 1];
        const successMsg = await executeExpense(activeSession, chosen, isAdmin, chatId, telegramUserName);
        await deleteSession(chatId);
        replyText = successMsg;
        actionTaken = 'create_cost';
      } else {
        // También intentar match de texto (el usuario puede escribir el nombre en vez de un número)
        const textMatches = fuzzyMatchProjects(messageText, context.filter(c =>
          options.some(o => o.clientName === c.name)
        ));
        if (textMatches.length === 1) {
          const successMsg = await executeExpense(activeSession, textMatches[0], isAdmin, chatId, telegramUserName);
          await deleteSession(chatId);
          replyText = successMsg;
          actionTaken = 'create_cost';
        } else {
          replyText = `Por favor responde con un número del *1* al *${options.length}*:\n\n${options.map((p, i) => `*${i + 1}.* ${p.title} _(${p.clientName})_`).join('\n')}`;
          actionTaken = 'awaiting_project_selection';
        }
      }
    }

    // ── 8. Enviar respuesta y guardar en historial ──
    if (replyText) {
      await sendTelegramMessage(chatId, replyText);
      await saveTelegramChatMessage(chatId, 'assistant', replyText, actionTaken, recordId);
    }

    return NextResponse.json({ ok: true, action: actionTaken });

  } catch (error: any) {
    console.error('Error en Telegram Webhook:', error);
    return NextResponse.json({ ok: true, error: error.message });
  }
}

async function sendTelegramMessage(chatId: number, text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
  } catch (err) {
    console.error('Failed to send Telegram message:', err);
  }
}
