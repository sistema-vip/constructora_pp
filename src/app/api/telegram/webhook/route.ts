import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  processTelegramAgentMessage,
  ClientProjectContext,
  saveTelegramChatMessage,
  getTelegramChatHistory
} from '@/lib/telegram-ai';
import { getRecentSystemActivity } from '@/lib/system-core';
import { autoExtractLearningFromCorrection } from '@/lib/agent-learning';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    const message = update.message || update.edited_message;
    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const photos = message.photo;
    const voice = message.voice;
    const audio = message.audio;
    const messageText = (message.caption || message.text || '').trim();

    // Solo procesamos si hay texto, leyenda, foto o nota de voz/audio
    if (!messageText && (!photos || photos.length === 0) && !voice && !audio) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const fromId = message.from?.id;
    const telegramUserName = message.from?.username || message.from?.first_name || 'Telegram User';

    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    // 1. Descargar foto si el mensaje incluye una imagen (factura/recibo/comprobante)
    let imageBase64: string | undefined = undefined;
    if (photos && photos.length > 0) {
      try {
        const highestResPhoto = photos[photos.length - 1];
        const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${highestResPhoto.file_id}`);
        const fileData = await fileRes.json();
        
        if (fileData.ok && fileData.result?.file_path) {
          const imgRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`);
          const arrayBuffer = await imgRes.arrayBuffer();
          imageBase64 = Buffer.from(arrayBuffer).toString('base64');
        }
      } catch (imgErr) {
        console.error('Error al obtener la imagen de Telegram:', imgErr);
      }
    }

    // 1b. Descargar nota de voz o audio si el mensaje incluye uno
    let audioBase64: string | undefined = undefined;
    let audioMimeType: string = 'audio/ogg';
    if (voice || audio) {
      try {
        const fileId = voice?.file_id || audio?.file_id;
        const rawMime = (voice?.mime_type || audio?.mime_type || 'audio/ogg').toLowerCase();
        if (rawMime.includes('ogg')) {
          audioMimeType = 'audio/ogg';
        } else if (rawMime.includes('mp4') || rawMime.includes('m4a')) {
          audioMimeType = 'audio/mp4';
        } else if (rawMime.includes('mp3') || rawMime.includes('mpeg')) {
          audioMimeType = 'audio/mp3';
        } else if (rawMime.includes('wav')) {
          audioMimeType = 'audio/wav';
        } else {
          audioMimeType = 'audio/ogg';
        }

        const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
        const fileData = await fileRes.json();

        if (fileData.ok && fileData.result?.file_path) {
          const audioRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`);
          const arrayBuffer = await audioRes.arrayBuffer();
          audioBase64 = Buffer.from(arrayBuffer).toString('base64');
        }
      } catch (audioErr) {
        console.error('Error al obtener el audio de Telegram:', audioErr);
      }
    }

    // 2. Comando especial /start
    if (messageText.startsWith('/start')) {
      const welcomeMsg = `👋 *¡Hola! Soy Pepe, tu Asistente Inteligente de P&P CONSTRUYE*\n\nTu ID de Telegram es: \`${fromId || chatId}\`\n\n📌 *¿Qué puedo hacer por ti?*\n• 📊 *Consultar saldos:* _"¿Cuánto saldo queda en la obra de Zully?"_\n• 📝 *Propuestas:* _"Redacta propuesta para nivelar 50m2 para Carlos"_\n• 🏗️ *Gastos:* _"Gasté 85$ en cemento para Zully"_ (o envía foto del recibo)\n• 💳 *Compromisos:* _"Carga compromiso de 150$ para Carlos Herrero"_\n• 👥 *Clientes:* _"Crea cliente Inversiones ABC teléfono 04141234567"_\n• 🚧 *Estatus:* _"Pasa la propuesta de Zully a en ejecución"_`;
      await sendTelegramMessage(chatId, welcomeMsg);
      await saveTelegramChatMessage(chatId, 'user', messageText);
      await saveTelegramChatMessage(chatId, 'assistant', welcomeMsg, 'start_command');
      return NextResponse.json({ ok: true });
    }

    // 3. Seguridad: Verificar si el usuario está registrado en profiles
    if (!fromId) {
      return NextResponse.json({ ok: true });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, name, role')
      .eq('telegram_chat_id', fromId)
      .maybeSingle();

    // Si no está registrado en profiles, avisar en privado o ignorar
    if (!profile) {
      if (message.chat.type === 'private') {
        const unauthorizedMsg = `⚠️ *Usuario No Autorizado*\n\nTu ID personal de Telegram es: \`${fromId}\`\nNo estás registrado como usuario en P&P CONSTRUYE. Pídele a un administrador que registre tu ID en la plataforma web.`;
        await sendTelegramMessage(chatId, unauthorizedMsg);
        await saveTelegramChatMessage(chatId, 'user', messageText || '[Foto]');
        await saveTelegramChatMessage(chatId, 'assistant', unauthorizedMsg, 'unauthorized');
      }
      return NextResponse.json({ ok: true });
    }

    // 4. Manejo de respuesta con tasa de cambio para pendientes en Bolívares
    const { data: pendingVesEntry } = await supabaseAdmin
      .from('telegram_pending_entries')
      .select('*')
      .eq('telegram_chat_id', chatId)
      .eq('status', 'pending')
      .eq('amount_usd', 0)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingVesEntry && pendingVesEntry.ai_parsed_data?.original_currency === 'VES' && !imageBase64) {
      const rateMatch = messageText.match(/(?:tasa\s*)?(\d+(?:[.,]\d+)?)/i);
      if (rateMatch && messageText.length < 30) {
        const rate = parseFloat(rateMatch[1].replace(',', '.'));
        if (rate > 5 && rate < 200) {
          const originalAmount = pendingVesEntry.ai_parsed_data.original_amount || 0;
          const usdAmount = Number((originalAmount / rate).toFixed(2));

          await supabaseAdmin
            .from('telegram_pending_entries')
            .update({ amount_usd: usdAmount })
            .eq('id', pendingVesEntry.id);

          const rateReply = `✅ *Tasa de ${rate} aplicada exitosamente*\n\nEl monto ha sido actualizado a *$${usdAmount} USD*.\nEl registro está listo en tu Dashboard web para aprobación final.`;
          await sendTelegramMessage(chatId, rateReply);
          await saveTelegramChatMessage(chatId, 'user', messageText);
          await saveTelegramChatMessage(chatId, 'assistant', rateReply, 'rate_applied', pendingVesEntry.id);
          return NextResponse.json({ ok: true });
        }
      }
    }

    // Guardar el mensaje entrante del usuario en la memoria conversacional
    const logUserMsg = messageText || (voice ? '🎙️ [Nota de voz enviada]' : audio ? '🎵 [Audio enviado]' : photos ? '📷 [Foto adjunta]' : '');
    await saveTelegramChatMessage(chatId, 'user', logUserMsg);

    // 5. Cargar en paralelo: Clientes/Obras, Historial de Chat y Actividad Reciente del Sistema
    const [clientsRes, chatHistory, recentActivity] = await Promise.all([
      supabaseAdmin
        .from('clients')
        .select(`
          id,
          name,
          projects (
            id,
            title,
            status
          )
        `)
        .order('name'),
      getTelegramChatHistory(chatId, 8),
      getRecentSystemActivity(8)
    ]);

    const context: ClientProjectContext[] = (clientsRes.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      projects: (c.projects || [])
        .filter((p: any) => p.status !== 'cancelled' && p.status !== 'completed')
        .map((p: any) => ({
          id: p.id,
          title: p.title,
          status: p.status,
        })),
    }));

    // 6. Procesar el mensaje con el Agente Inteligente de Telegram y su Memoria (Texto, Foto o Audio)
    const isAdmin = (profile?.role === 'admin');
    const agentResponse = await processTelegramAgentMessage(
      messageText,
      context,
      imageBase64,
      chatId,
      telegramUserName,
      isAdmin,
      chatHistory,
      recentActivity,
      audioBase64,
      audioMimeType
    );

    if (agentResponse.replyText) {
      await sendTelegramMessage(chatId, agentResponse.replyText);
      // Guardar la respuesta del bot en la memoria conversacional
      await saveTelegramChatMessage(
        chatId,
        'assistant',
        agentResponse.replyText,
        agentResponse.actionTaken,
        agentResponse.recordId
      );
    }

    // 7. Auto-aprendizaje pasivo si el usuario corrigió un comportamiento previo
    const lastAssistantMsg = chatHistory && chatHistory.length > 0
      ? [...chatHistory].reverse().find(m => m.role === 'assistant')?.message_text
      : undefined;

    autoExtractLearningFromCorrection(messageText || logUserMsg, lastAssistantMsg).catch(err => {
      console.warn('Error in background auto-learning extraction:', err);
    });

    return NextResponse.json({ ok: true, action: agentResponse.actionTaken });
  } catch (error: any) {
    console.error('Error en Telegram Webhook:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

async function sendTelegramMessage(chatId: number, text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('Failed to send Telegram message:', err);
  }
}
