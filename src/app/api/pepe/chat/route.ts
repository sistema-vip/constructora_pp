import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  processTelegramAgentMessage,
  ClientProjectContext,
  TelegramChatMessageItem,
  saveTelegramChatMessage
} from '@/lib/telegram-ai';
import { getPepeSystemKnowledge } from '@/lib/pepe/systemKnowledge';
import {
  WEB_PEPE_SESSION_CHAT_ID,
  getPepeSessionMemory,
  savePepeSessionMemory
} from '@/lib/pepe/pepeMemory';
import { autoExtractLearningFromCorrection, getLearnedSkillsContext } from '@/lib/agent-learning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FAST_STREAM_MODELS = [
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-3.7-flash'
];

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY no configurada en .env.local' },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { messages, sessionId = WEB_PEPE_SESSION_CHAT_ID } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'No se recibieron mensajes para procesar.' },
        { status: 400 }
      );
    }

    const lastMessage = messages[messages.length - 1].text || '';
    const lowerMsg = lastMessage.toLowerCase();

    // 1. Detectar si el mensaje requiere ejecución de acción administrativa
    const isActionIntent =
      lowerMsg.includes('registra') ||
      lowerMsg.includes('cargar ') ||
      lowerMsg.includes('carga ') ||
      lowerMsg.includes('crear ') ||
      lowerMsg.includes('crea ') ||
      lowerMsg.includes('eliminar') ||
      lowerMsg.includes('borrar') ||
      lowerMsg.includes('cambiar estatus') ||
      lowerMsg.includes('aprende que') ||
      lowerMsg.includes('recuerda que') ||
      lowerMsg.includes('enséñame') ||
      lowerMsg.includes('olvida');

    // Cargar contexto de clientes y obras
    const { data: clientsRes } = await supabaseAdmin
      .from('clients')
      .select('id, name, projects(id, title, status)')
      .order('name');

    const context: ClientProjectContext[] = (clientsRes || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      projects: (c.projects || [])
        .filter((p: any) => p.status !== 'cancelled' && p.status !== 'completed')
        .map((p: any) => ({ id: p.id, title: p.title, status: p.status }))
    }));

    // Si es una acción o comando administrativo, ejecutar a través del motor ejecutivo
    if (isActionIntent) {
      const chatHistory: TelegramChatMessageItem[] = messages.slice(0, -1).map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        message_text: m.text,
        created_at: new Date().toISOString()
      }));

      const agentRes = await processTelegramAgentMessage(
        lastMessage,
        context,
        undefined,
        sessionId,
        'Usuario App P&P',
        true,
        chatHistory
      );

      const replyText = (agentRes.replyText || '').replace('[LISTO_PARA_GENERAR]', '').trim();
      const readyToGenerate = (agentRes.replyText || '').includes('[LISTO_PARA_GENERAR]') ||
        lowerMsg.includes('genera la propuesta') ||
        lowerMsg.includes('generar propuesta') ||
        lowerMsg.includes('está listo');

      // Guardar en memoria persistente
      await saveTelegramChatMessage(
        sessionId,
        'user',
        lastMessage,
        agentRes.actionTaken,
        agentRes.recordId
      );
      await saveTelegramChatMessage(
        sessionId,
        'assistant',
        replyText,
        agentRes.actionTaken,
        agentRes.recordId
      );

      // Responder en stream simulado ultra-rápido para mantener interfaz SSE uniforme
      const encoder = new TextEncoder();
      const customStream = new ReadableStream({
        async start(controller) {
          // Emitir en bloques para animación fluida en UI
          const words = replyText.split(' ');
          let buffer = '';
          for (let i = 0; i < words.length; i++) {
            buffer += (i > 0 ? ' ' : '') + words[i];
            if (i % 3 === 0 || i === words.length - 1) {
              const data = JSON.stringify({ type: 'chunk', text: buffer });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              buffer = '';
            }
          }

          const doneData = JSON.stringify({
            type: 'done',
            reply: replyText,
            readyToGenerate,
            actionTaken: agentRes.actionTaken,
            recordId: agentRes.recordId
          });
          controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
          controller.close();
        }
      });

      return new Response(customStream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive'
        }
      });
    }

    // 2. Flujo Conversacional Directo con Streaming en Tiempo Real
    const [systemKnowledge, learnedSkills] = await Promise.all([
      getPepeSystemKnowledge().catch(() => ''),
      getLearnedSkillsContext(10).catch(() => '')
    ]);

    const activeProjectsSummary = context
      .map(c => `• ${c.name}: ${c.projects.length > 0 ? c.projects.map(p => `"${p.title}"`).join(', ') : 'Sin obras activas'}`)
      .join('\n');

    const conversationHistoryText = messages
      .slice(-6)
      .map((m: any) => `${m.role === 'user' ? 'Usuario' : 'Pepe'}: ${m.text}`)
      .join('\n');

    const prompt = `Eres Pepe, el asistente técnico y copiloto inteligente de P&P CONSTRUYE.
Tu personalidad es profesional, precisa, cordial y directa. Usas vocabulario constructivo venezolano cuando aplique.

${systemKnowledge}

── REGLAS Y CONOCIMIENTO APRENDIDO ──
${learnedSkills}

── CLIENTES Y OBRAS ACTIVAS REGISTRADAS ──
${activeProjectsSummary}

── CONVERSACIÓN RECIENTE ──
${conversationHistoryText}

INSTRUCCIONES CLAVE:
1. Responde de forma clara, directa y concisa a la pregunta del usuario.
2. Si te preguntan por saldos, presupuestos o proyectos, usa con precisión los datos numéricos de la base de conocimiento cargada en tu memoria.
3. Si el usuario te indica que quiere redactar o armar una propuesta, ayúdale recopilando los detalles y cuando esté listo incluye la frase "[LISTO_PARA_GENERAR]".
4. No uses tablas de Markdown excesivas; usa listas con viñetas limpias (-).
5. Responde con naturalidad como Pepe en primera persona.`;

    const genAI = new GoogleGenerativeAI(apiKey);
    let activeStream: any = null;
    let selectedModel = '';

    for (const modelName of FAST_STREAM_MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1000
          }
        });
        activeStream = await model.generateContentStream(prompt);
        selectedModel = modelName;
        break;
      } catch (err: any) {
        console.warn(`[Pepe Stream API] Fallo al iniciar stream con ${modelName}:`, err?.message || err);
      }
    }

    if (!activeStream) {
      return NextResponse.json(
        { error: 'No se pudo iniciar el asistente en este momento. Intenta de nuevo.' },
        { status: 503 }
      );
    }

    const encoder = new TextEncoder();
    let fullReply = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of activeStream.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
              fullReply += chunkText;
              const data = JSON.stringify({ type: 'chunk', text: chunkText });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }

          const readyToGenerate = fullReply.includes('[LISTO_PARA_GENERAR]') ||
            lowerMsg.includes('genera la propuesta') ||
            lowerMsg.includes('generar propuesta') ||
            lowerMsg.includes('está listo');

          const cleanReply = fullReply.replace('[LISTO_PARA_GENERAR]', '').trim();

          const doneData = JSON.stringify({
            type: 'done',
            reply: cleanReply,
            readyToGenerate,
            actionTaken: 'chat'
          });
          controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
          controller.close();

          // Persistir mensajes asíncronamente en memoria de sesión
          saveTelegramChatMessage(sessionId, 'user', lastMessage).catch(() => {});
          saveTelegramChatMessage(sessionId, 'assistant', cleanReply).catch(() => {});

          // Auto-aprendizaje de correcciones
          autoExtractLearningFromCorrection(lastMessage, messages[messages.length - 2]?.text).catch(() => {});
        } catch (streamErr: any) {
          console.error('[Pepe Stream API] Error durante transmisión:', streamErr);
          const errData = JSON.stringify({ type: 'error', error: streamErr?.message || 'Error en streaming' });
          controller.enqueue(encoder.encode(`data: ${errData}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      }
    });
  } catch (error: any) {
    console.error('Error en /api/pepe/chat:', error);
    return NextResponse.json(
      { error: error?.message || 'Error interno del servidor en chat con Pepe' },
      { status: 500 }
    );
  }
}
