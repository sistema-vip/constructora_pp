import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parseTelegramMessageWithAI, ClientProjectContext } from '@/lib/telegram-ai';

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    // Solo procesamos mensajes con texto
    if (!update.message || !update.message.text) {
      return NextResponse.json({ ok: true });
    }

    const messageText = update.message.text.trim();
    const chatId = update.message.chat.id;
    const messageId = update.message.message_id;
    const telegramUserName = update.message.from.username || update.message.from.first_name || 'Telegram User';

    // 1. Comando especial /start para vinculación
    if (messageText.startsWith('/start')) {
      const parts = messageText.split(' ');
      if (parts.length > 1) {
        const linkCode = parts[1]; // Código de vinculación opcional
        // Guardamos el chatId
      }

      await sendTelegramMessage(
        chatId,
        `👋 *¡Hola! Bienvenido al Bot de P&P CONSTRUYE*\n\nTu ID de Telegram es: \`${chatId}\`\n\n📌 *Comandos de consulta:*\n• Escribe /proyectos para ver todos los clientes y propuestas activas.\n• O pregunta: _"¿Qué proyectos tiene Zully?"_\n\n📌 *Registrar gastos/pagos en lenguaje natural:*\n• _"Gasté 200 en cemento para la cocina de Zully"_\n• _"Retiro de socio Henry 300 dólares"_\n• _"Zully abonó 500 al proyecto fachada"_`
      );
      return NextResponse.json({ ok: true });
    }

    // 1b. Comando /proyectos o consultas tipo "¿cuáles son las propuestas de Zully?"
    const lowerText = messageText.toLowerCase();
    const isQueryRequest = 
      lowerText.startsWith('/proyectos') || 
      lowerText.startsWith('/propuestas') || 
      lowerText.includes('cuales son') || 
      lowerText.includes('cuáles son') || 
      lowerText.includes('que proyectos') || 
      lowerText.includes('qué proyectos') || 
      lowerText.includes('que propuestas') || 
      lowerText.includes('qué propuestas') || 
      lowerText.includes('lista de proyectos');

    // 2. Validar que el chat_id pertenezca a un perfil de usuario o admin registrado
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, name, role')
      .eq('telegram_chat_id', chatId)
      .maybeSingle();

    // NOTA: Si no hay usuarios vinculados aun, permitimos a administradores por defecto o enviamos el ID para vincular
    if (!profile) {
      // Verificar si hay algún perfil sin vincular o enviamos el ID para su vinculación
      await sendTelegramMessage(
        chatId,
        `⚠️ *Cuenta de Telegram No Vinculada*\n\nTu Chat ID es: \`${chatId}\`\nPor favor regístralo en la sección de **Administración** de la plataforma web o pídele a un administrador que vincule tu usuario.`
      );
      return NextResponse.json({ ok: true });
    }

    // 3. Cargar contexto de clientes y proyectos activos para que la IA haga matching
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

    const context: ClientProjectContext[] = (clientsData || []).map((client: any) => ({
      id: client.id,
      name: client.name,
      projects: (client.projects || [])
        .filter((p: any) => p.status !== 'cancelled')
        .map((p: any) => ({
          id: p.id,
          title: p.title,
          status: p.status,
        })),
    }));

    // 4. Si es una consulta de proyectos o propuestas, responder directamente
    if (isQueryRequest) {
      let responseMsg = '📋 *Proyectos y Propuestas Activas:*\n\n';
      let hasProjects = false;

      context.forEach((client) => {
        if (client.projects.length > 0) {
          hasProjects = true;
          responseMsg += `👤 *Cliente: ${client.name}*\n`;
          client.projects.forEach((p) => {
            const statusLabel = p.status === 'in_progress' ? '🚧 En ejecución' : '📄 Propuesta';
            responseMsg += `  • ${p.title} (${statusLabel})\n`;
          });
          responseMsg += '\n';
        }
      });

      if (!hasProjects) {
        responseMsg = 'ℹ️ No hay proyectos ni propuestas activas registradas en este momento.';
      }

      await sendTelegramMessage(chatId, responseMsg);
      return NextResponse.json({ ok: true });
    }

    // 5. Parsear mensaje de registro de gasto/pago usando Gemini AI
    const aiResult = await parseTelegramMessageWithAI(messageText, context);

    // 5. Insertar en la tabla telegram_pending_entries
    const { data: newEntry, error: insertErr } = await supabaseAdmin
      .from('telegram_pending_entries')
      .insert({
        entry_type: aiResult.entry_type,
        description: aiResult.description || messageText,
        amount_usd: aiResult.amount_usd || 0,
        category: aiResult.category || 'other',
        provider: aiResult.provider || null,
        partner_name: aiResult.partner_name || (aiResult.entry_type === 'partner_advance' ? profile.name : null),
        payment_reference: aiResult.payment_reference || null,
        project_id: aiResult.matched_project_id || null,
        raw_message: messageText,
        ai_parsed_data: aiResult,
        suggested_client_name: aiResult.suggested_client_name || null,
        suggested_project_name: aiResult.suggested_project_name || null,
        confidence_score: aiResult.confidence_score || 0,
        status: 'pending',
        telegram_chat_id: chatId,
        telegram_message_id: messageId,
        telegram_user_name: telegramUserName,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('Error insertando telegram_pending_entries:', insertErr);
      await sendTelegramMessage(chatId, '❌ Hubo un error al registrar tu solicitud. Por favor intenta de nuevo.');
      return NextResponse.json({ ok: false, error: insertErr.message });
    }

    // 6. Responder al usuario en Telegram con el resumen parseado
    const typeLabel = {
      cost: '🏗️ Gasto ejecutado',
      partner_advance: '👤 Retiro de socio',
      client_payment: '💵 Pago de cliente',
      commitment: '📝 Compromiso de pago',
    }[aiResult.entry_type];

    const categoryLabel = aiResult.category ? ` • Cat: _${aiResult.category}_` : '';
    const matchedProjectText = aiResult.matched_project_id
      ? `🎯 *Proyecto Asociado:* ${aiResult.suggested_project_name || 'Asignado automáticamente'}`
      : `⚠️ *Proyecto:* No identificado con certeza (${aiResult.suggested_project_name || 'Pendiente por asignar en la web'})`;

    const confirmationMsg = `✅ *Registrado como Pendiente en la Web*\n\n*Tipo:* ${typeLabel}\n*Monto:* *$${aiResult.amount_usd.toFixed(2)}*\n*Detalle:* ${aiResult.description}${categoryLabel}\n${matchedProjectText}\n\n_Puedes revisarlo y confirmarlo en el Dashboard web._`;

    await sendTelegramMessage(chatId, confirmationMsg);

    return NextResponse.json({ ok: true, id: newEntry.id });
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
