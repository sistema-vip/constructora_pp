import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { processTelegramAgentMessage, ClientProjectContext } from '@/lib/telegram-ai';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    const message = update.message || update.edited_message;
    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const photos = message.photo;
    const messageText = (message.caption || message.text || '').trim();

    // Solo procesamos si hay texto, leyenda o foto
    if (!messageText && (!photos || photos.length === 0)) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const fromId = message.from?.id;
    const telegramUserName = message.from?.username || message.from?.first_name || 'Telegram User';

    // 1. Descargar foto si el mensaje incluye una imagen (factura/recibo/comprobante)
    let imageBase64: string | undefined = undefined;
    if (photos && photos.length > 0) {
      try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
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

    // 2. Comando especial /start
    if (messageText.startsWith('/start')) {
      await sendTelegramMessage(
        chatId,
        `👋 *¡Hola! Soy tu Copiloto Inteligente de P&P CONSTRUYE*\n\nTu ID de Telegram es: \`${fromId || chatId}\`\n\n📌 *¿Qué puedo hacer por ti?*\n• 📊 *Consultar saldos:* _"¿Cuánto saldo queda en la obra de Zully?"_\n• 📝 *Propuestas:* _"Redacta propuesta para nivelar 50m2 para Carlos"_\n• 🏗️ *Gastos:* _"Gasté 85$ en cemento para Zully"_ (o envía foto del recibo)\n• 💳 *Compromisos:* _"Carga compromiso de 150$ para Carlos Herrero"_\n• 👥 *Clientes:* _"Crea cliente Inversiones ABC teléfono 04141234567"_\n• 🚧 *Estatus:* _"Pasa la propuesta de Zully a en ejecución"_`
      );
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
        await sendTelegramMessage(
          chatId,
          `⚠️ *Usuario No Autorizado*\n\nTu ID personal de Telegram es: \`${fromId}\`\nNo estás registrado como usuario en P&P CONSTRUYE. Pídele a un administrador que registre tu ID en la plataforma web.`
        );
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

          await sendTelegramMessage(
            chatId,
            `✅ *Tasa de ${rate} aplicada exitosamente*\n\nEl monto ha sido actualizado a *$${usdAmount} USD*.\nEl registro está listo en tu Dashboard web para aprobación final.`
          );
          return NextResponse.json({ ok: true });
        }
      }
    }

    // 5. Cargar contexto de clientes y proyectos activos
    const { data: clientsData } = await supabaseAdmin
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
      .order('name');

    const context: ClientProjectContext[] = (clientsData || []).map((c: any) => ({
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

    // 6. Procesar el mensaje con el Agente Inteligente de Telegram
    const isAdmin = (profile?.role === 'admin');
    const agentResponse = await processTelegramAgentMessage(
      messageText,
      context,
      imageBase64,
      chatId,
      telegramUserName,
      isAdmin
    );

    if (agentResponse.replyText) {
      await sendTelegramMessage(chatId, agentResponse.replyText);
    }

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
