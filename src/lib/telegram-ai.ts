import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

export interface ParsedTelegramMessage {
  entry_type: 'cost' | 'partner_advance' | 'client_payment' | 'commitment';
  description: string;
  amount_usd: number;
  category?: 'materials' | 'labor' | 'equipment' | 'subcontract' | 'other';
  provider?: string;
  partner_name?: string;
  payment_reference?: string;
  suggested_client_name?: string;
  suggested_project_name?: string;
  matched_project_id?: string;
  confidence_score: number;
}

export interface ClientProjectContext {
  id: string;
  name: string;
  projects: Array<{
    id: string;
    title: string;
    status: string;
  }>;
}

export interface MessageClassification {
  intent: 'greeting' | 'query' | 'transaction' | 'unclear';
  reply: string;
}

export async function classifyTelegramIntent(
  rawMessage: string
): Promise<MessageClassification> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada');
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const prompt = `
Eres el asistente virtual "Pepe" para P&P CONSTRUYE.
Tu tarea es clasificar la intención del usuario basándote en su mensaje de Telegram.

Intenciones posibles (intent):
- "greeting": Saludos, despedidas, agradecimientos o conversación casual (ej. "Hola Pepe", "Gracias", "Buen día").
- "query": Preguntas generales sobre proyectos, clientes, finanzas (ej. "¿Cuántos proyectos activos hay?", "¿Cuáles son los clientes?").
- "transaction": Instrucciones claras para registrar un gasto, pago, adelanto o compromiso. Debe contener al menos una acción financiera (ej. "Gasté $50 en materiales", "Retiro de socio 300").
- "unclear": Mensajes ambiguos, incomprensibles o que no encajan en las otras categorías (ej. "asdfg", "me equivoqué").

Si la intención es "greeting", genera una respuesta corta y amigable (ej. "¡Hola! ¿En qué te ayudo hoy?").
Si es "query", genera un texto diciendo que procesarás su consulta (ej. "Revisando la base de datos...").
Si es "transaction", genera un texto vacío (el webhook lo ignorará).
Si es "unclear", pide que reformule su mensaje.

Responde ÚNICAMENTE con el siguiente JSON:
{
  "intent": "greeting" | "query" | "transaction" | "unclear",
  "reply": "Tu respuesta amigable al usuario (vacía si es transaction)"
}

Mensaje del usuario:
"${rawMessage}"
`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  
  try {
    return JSON.parse(responseText);
  } catch (error) {
    console.error('Error parseando JSON de clasificación:', responseText, error);
    return { intent: 'unclear', reply: '🤔 No estoy seguro de lo que intentas decir.' };
  }
}


export async function parseTelegramMessageWithAI(
  rawMessage: string,
  context: ClientProjectContext[]
): Promise<ParsedTelegramMessage> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada');
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const prompt = `
Eres el motor de Inteligencia Artificial para P&P CONSTRUYE (constructora).
Tu tarea es interpretar mensajes cortos en lenguaje natural enviados por los socios/administradores a través de Telegram y estructurarlos para registrar transacciones financieras reales.

Contexto actual de Clientes y sus Proyectos en el sistema:
\${JSON.stringify(context, null, 2)}

Tipos de entrada posibles (entry_type):
- "cost": Gastos de obra o compras (ej. "Gasté $200 en cemento para la cocina de Zully", "Pago de $150 al plomero").
- "partner_advance": Retiros o adelantos a socios (ej. "Retiro de Henry $500 del proyecto fachada", "Retiro socio $300").
- "client_payment": Pagos o abonos recibidos del cliente (ej. "Zully pagó $1000 por la remodelación", "Abono cliente $500").
- "commitment": Compromiso o deuda futura de gasto (ej. "Compromiso de $400 con ferretería EPA").

Categorías posibles de gastos (category):
- "materials": Materiales de construcción, agregados, tubos, cables, herramientas, etc.
- "labor": Mano de obra, pago a obreros, albañiles, plomeros, electricistas.
- "equipment": Alquiler o compra de equipos/maquinaria.
- "subcontract": Trabajos subcontratados.
- "other": Varios u otros.

Reglas CRÍTICAS:
1. Extrae el monto en USD (amount_usd). Si el usuario no especifica un monto numérico válido, pon 0.
2. Identifica el nombre del cliente y proyecto si se mencionan en la conversación. Compara contra el contexto inyectado para hacer match exacto de matched_project_id si existe coincidencia alta.
3. Si el entry_type es "partner_advance", intenta identificar el nombre del socio en partner_name.
4. Asigna un score de confianza (confidence_score) entre 0.0 y 1.0.

Responde ÚNICAMENTE con el siguiente objeto JSON:
{
  "entry_type": "cost" | "partner_advance" | "client_payment" | "commitment",
  "description": "descripción detallada y limpia",
  "amount_usd": número,
  "category": "materials" | "labor" | "equipment" | "subcontract" | "other",
  "provider": "nombre de proveedor/vendedor si aplica",
  "partner_name": "nombre de socio si aplica",
  "payment_reference": "referencia de pago si aplica",
  "suggested_client_name": "nombre del cliente mencionado o deducido",
  "suggested_project_name": "nombre del proyecto mencionado o deducido",
  "matched_project_id": "UUID del proyecto si coincide con el contexto, o null",
  "confidence_score": número entre 0 y 1
}

Mensaje a analizar:
"\${rawMessage}"
`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  
  try {
    const parsed: ParsedTelegramMessage = JSON.parse(responseText);
    return parsed;
  } catch (error) {
    console.error('Error parseando JSON de Gemini:', responseText, error);
    return {
      entry_type: 'cost',
      description: rawMessage,
      amount_usd: 0,
      category: 'other',
      confidence_score: 0.2,
    };
  }
}
