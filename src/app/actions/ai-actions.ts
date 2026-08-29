'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface ProposalData {
  title: string;
  clientName: string;
  clientContact: string;
  date: string;
  area: string;
  investmentAmount: string;
  executionTime: string;
  fullProposalText: string;
}

// ─────────────────────────────────────────────
// SYSTEM PROMPTS
// ─────────────────────────────────────────────

const CHAT_SYSTEM_PROMPT = `Eres el asistente técnico de P&P CONSTRUYE. 
Tu nombre es "Pepe".

Tu estilo de respuesta debe ser:
- PROFESIONAL Y SOBRIO: Evita el uso excesivo de emojis (máximo 1 por mensaje o ninguno).
- SIN ADORNOS INNECESARIOS: No uses tablas de Markdown (evita las barras "|" y rayitas "---"). 
- LISTAS LIMPIAS: Para materiales o pasos técnicos, usa listas simples con guiones (-) o números. 
- DIRECTO AL GRANO: Si el usuario pide materiales, dálos en una lista de texto plano que sea fácil de copiar y pegar.
- VOCABULARIO TÉCNICO: Usa términos de construcción venezolana.

COMPORTAMIENTO:
- Siempre confirma lo que entendiste antes de calcular.
- Si el usuario dice "ponle X" o "quítale Y", ajusta los cálculos inmediatamente.
- Si el usuario dice "genera la propuesta" o "está listo", responde solo con: [LISTO_PARA_GENERAR]
- Máximo 3 párrafos.`;

const PROPOSAL_SYSTEM_PROMPT = `Eres el redactor de propuestas técnicas de P&P CONSTRUYE.
Basándote en la conversación proporcionada, redacta una propuesta profesional EXACTAMENTE en este formato (SIN incluir guiones "---" al principio ni al final):

Proyecto: [Nombre descriptivo del proyecto]
Fecha: [Fecha de hoy]
Para: [Nombre del cliente / familia]
Área de Ejecución: [Si se menciona]

Objetivo del Proyecto
[Descripción técnica y formal del propósito fundamental de la obra, detallando de forma clara, profesional y explícita el resultado esperado y el alcance general, sin exagerar pero con un lenguaje ingenieril elegante y descriptivo (1 o 2 párrafos).]

Fases del Trabajo (Alcance Técnico)
[Estructura OBLIGATORIAMENTE en fases numeradas en negrita (**Fase 1: Título de la Fase**, **Fase 2: Título**, etc.). Debajo de cada fase, desglosa los servicios y actividades técnicas específicas en viñetas con guión (-).
Ejemplo:
**Fase 1: Demolición y Albañilería**
- Demolición y remoción de manto asfáltico deteriorado
- Levantamiento de paredes en bloque de 15cm
- Frisado de muros con acabado liso

**Fase 2: Revestimientos e Instalaciones**
- Colocación de pisos de porcelanato
- Instalación de duchas y piezas sanitarias
- Colocación de lámparas y puntos de iluminación]

Tiempo de Ejecución y Entrega
[Tiempo estimado basado en lo discutido]

Presupuesto de Inversión (A Todo Costo o Solo Mano de Obra o Materiales)
[Genera el encabezado correspondiente según la modalidad acordada: "Presupuesto de Inversión (A Todo Costo)", "Presupuesto de Inversión (Solo Mano de Obra)", o "Presupuesto de Inversión (Materiales)". Luego redacta la modalidad:
- Si es "A Todo Costo": detalla que incluye materiales, herramientas y mano de obra.
- Si es "Solo Mano de Obra": detalla que incluye únicamente mano de obra calificada y herramientas, y que el suministro de materiales es por cuenta del cliente.
- Si es "Materiales": detalla que incluye únicamente el suministro y entrega de materiales en obra, y que la mano de obra para la instalación es por cuenta del cliente.]

INVERSIÓN TOTAL: $[Monto calculado o "Por Definir"]

Condiciones y Métodos de Pago
Esquema de Pago: Anticipo del 60% para la adquisición de materiales y movilización; 40% restante al finalizar la obra.
Tasa de Cambio: Este presupuesto está expresado en divisas. Métodos de pago: Efectivo, Zelle y Binance.

TAMBIÉN incluye al inicio un bloque JSON (antes del texto de la propuesta):
<JSON_DATA>
{
  "title": "nombre corto del proyecto",
  "clientName": "nombre del cliente",
  "clientContact": "si se mencionó",
  "area": "área si se mencionó",
  "investmentAmount": "monto numérico o Por Definir",
  "executionTime": "tiempo estimado"
}
</JSON_DATA>`;

const FALLBACK_MODELS = [
  'gemini-3.1-pro-preview',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest'
];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiWithFallback<T>(
  apiKey: string,
  fn: (model: any, modelName: string) => Promise<T>
): Promise<T> {
  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError: any;

  for (const modelName of FALLBACK_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        return await fn(model, modelName);
      } catch (error: any) {
        lastError = error;
        const msg = error?.message || String(error);
        const isTransient =
          msg.includes('503') ||
          msg.includes('429') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('high demand') ||
          msg.includes('RESOURCE_EXHAUSTED');

        console.warn(`[Gemini Fallback] Error en modelo ${modelName} (intento ${attempt + 1}):`, msg);

        if (isTransient && attempt === 0) {
          await sleep(500);
          continue;
        }
        break;
      }
    }
  }

  throw lastError || new Error('Todos los modelos de Gemini fallaron o están temporalmente ocupados.');
}

// ─────────────────────────────────────────────
// SEND CHAT MESSAGE (conversación libre)
// ─────────────────────────────────────────────
export async function sendChatMessage(messages: ChatMessage[]): Promise<{
  success: boolean;
  reply?: string;
  readyToGenerate?: boolean;
  error?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'TU_API_KEY_AQUI') {
    return { success: false, error: 'API Key de Gemini no configurada. Agrega GEMINI_API_KEY en el archivo .env.local (obtén una gratis en aistudio.google.com)' };
  }

  // Build clean alternating chat history for Gemini API
  const validHistory: { role: 'user' | 'model'; parts: { text: string }[] }[] = [
    { role: 'user', parts: [{ text: CHAT_SYSTEM_PROMPT }] },
    { role: 'model', parts: [{ text: '¡Entendido! Soy el asistente técnico de P&P CONSTRUYE. ¿En qué proyecto estamos trabajando?' }] }
  ];

  let lastRole: 'user' | 'model' = 'model';
  for (const m of messages.slice(0, -1)) {
    if (m.role !== lastRole) {
      validHistory.push({
        role: m.role,
        parts: [{ text: m.text }]
      });
      lastRole = m.role;
    }
  }

  const lastMessage = messages[messages.length - 1].text;

  try {
    return await callGeminiWithFallback(apiKey, async (model) => {
      const chat = model.startChat({ history: validHistory });
      const result = await chat.sendMessage(lastMessage);
      const replyText = result.response.text();

      const readyToGenerate = replyText.includes('[LISTO_PARA_GENERAR]');
      const cleanReply = replyText.replace('[LISTO_PARA_GENERAR]', '').trim();

      return {
        success: true,
        reply: cleanReply || '¡Perfecto! La información está lista. Presiona "Generar Propuesta" para formalizarla.',
        readyToGenerate,
      };
    });
  } catch (error: any) {
    return { success: false, error: `Error al contactar Gemini: ${error?.message || 'Servicio temporalmente no disponible'}` };
  }
}

// ─────────────────────────────────────────────
// GENERATE FINAL PROPOSAL (basado en conversación)
// ─────────────────────────────────────────────
export async function generateFinalProposal(messages: ChatMessage[]): Promise<{
  success: boolean;
  data?: ProposalData;
  error?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'TU_API_KEY_AQUI') {
    return { success: false, error: 'API Key de Gemini no configurada.' };
  }

  const conversationSummary = messages
    .map(m => `${m.role === 'user' ? 'Cliente/Usuario' : 'Asistente'}: ${m.text}`)
    .join('\n\n');

  const today = new Date().toLocaleDateString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });

  const prompt = `${PROPOSAL_SYSTEM_PROMPT}

La fecha de hoy es: ${today}

CONVERSACIÓN COMPLETA:
${conversationSummary}

Genera la propuesta profesional ahora.`;

  try {
    return await callGeminiWithFallback(apiKey, async (model) => {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      // Extract JSON
      const jsonMatch = responseText.match(/<JSON_DATA>([\s\S]*?)<\/JSON_DATA>/);
      let parsedJson: any = {};
      if (jsonMatch) {
        try { parsedJson = JSON.parse(jsonMatch[1].trim()); } catch {}
      }

      const fullProposalText = responseText
        .replace(/<JSON_DATA>[\s\S]*?<\/JSON_DATA>/, '')
        .replace(/^---\s*/, '')
        .replace(/\s*---$/, '')
        .trim();

      return {
        success: true,
        data: {
          title: parsedJson.title || 'Nueva Propuesta',
          clientName: parsedJson.clientName || '',
          clientContact: parsedJson.clientContact || '',
          date: parsedJson.date || today,
          area: parsedJson.area || '',
          investmentAmount: parsedJson.investmentAmount || 'Por Definir',
          executionTime: parsedJson.executionTime || '',
          fullProposalText,
        }
      };
    });
  } catch (error: any) {
    return { success: false, error: `Error al generar propuesta: ${error?.message || error}` };
  }
}

// ─────────────────────────────────────────────
// MODIFY PROPOSAL TEXT
// ─────────────────────────────────────────────
export async function modifyProposalText(currentText: string, instruction: string): Promise<{
  success: boolean;
  modifiedText?: string;
  error?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'TU_API_KEY_AQUI') {
    return { success: false, error: 'API Key de Gemini no configurada.' };
  }

  const prompt = `Eres un asistente técnico de construcción. A continuación te presento el texto actual de una propuesta de construcción.
El usuario ha solicitado el siguiente cambio o ajuste: "${instruction}"

Aplica el cambio solicitado sobre el texto actual manteniendo el formato profesional, sin añadir saludos ni despedidas innecesarias. 
IMPORTANTE: Para las fases del trabajo, NO coloques números ni viñetas al inicio (ej. NO pongas "1. Fase 1:"), escribe directamente el título "Fase 1: ...".
Devuelve ÚNICAMENTE el nuevo texto modificado. Elimina cualquier guión "---" al inicio o al final del texto.

--- TEXTO ACTUAL ---
${currentText}
--- FIN DEL TEXTO ACTUAL ---`;

  try {
    return await callGeminiWithFallback(apiKey, async (model) => {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      return {
        success: true,
        modifiedText: responseText
      };
    });
  } catch (error: any) {
    return { success: false, error: `Error al modificar propuesta: ${error?.message || error}` };
  }
}

// ─────────────────────────────────────────────
// AUTOFILL PROPOSAL FIELDS
// ─────────────────────────────────────────────
export async function autofillProposalFields(
  userInput: string,
  clients: { id: string; name: string; company_name?: string }[]
): Promise<{ success: boolean; data?: any; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'TU_API_KEY_AQUI') {
    return { success: false, error: 'API Key de Gemini no configurada.' };
  }

  const clientsListStr = clients.map(c => "ID: " + c.id + " | Nombre: " + c.name + (c.company_name ? " (" + c.company_name + ")" : "")).join('\n');

  const prompt = `Eres un asistente inteligente para la constructora P&P CONSTRUYE.
Tu objetivo es analizar las notas o descripción de un proyecto proporcionada por el usuario y extraer/generar los campos necesarios para un formulario de propuesta.

Notas del usuario:
"${userInput}"

Lista de clientes registrados (ID | Nombre):
${clientsListStr || 'No hay clientes registrados.'}

Instrucciones:
1. Extrae o deduce un título corto y descriptivo para el proyecto (title).
2. Extrae el nombre del cliente (clientName).
3. Busca en la lista de clientes registrados el que mejor coincida con el nombre mencionado. Si encuentras uno, pon su ID exacto en 'matchedClientId'. Si no hay coincidencia clara o no se menciona cliente, déjalo vacío ("").
4. Genera una descripción técnica profesional como 'objective' (Objetivo del Proyecto).
5. Genera un desglose de las fases de trabajo técnico en 'phases' (Fases del Trabajo). Estructura OBLIGATORIAMENTE cada fase con su título en negrita (**Fase 1: Título**, **Fase 2: Título**) y debajo cada servicio u actividad específica en viñetas con guión (-).
Ejemplo:
**Fase 1: Albañilería y Paredes**
- Levantamiento de paredes en bloque de 15cm
- Frisado de muros con acabado liso

**Fase 2: Revestimientos e Instalaciones**
- Colocación de porcelanato en pisos
- Instalación de duchas y lámparas
6. Extrae o estima el tiempo de ejecución en 'time'.
7. Extrae el monto total (solo números o formato de moneda) en 'amount'. Si no se menciona, pon "".
8. Extrae las condiciones de pago en 'payment'. Si no se mencionan, pon "60% anticipo / 40% al finalizar".
9. Extrae cualquier nota adicional en 'notes'.

IMPORTANTE: Responde ÚNICAMENTE con un objeto JSON válido con las siguientes claves:
{
  "title": "",
  "clientName": "",
  "matchedClientId": "",
  "objective": "",
  "phases": "",
  "time": "",
  "amount": "",
  "payment": "",
  "notes": ""
}`;

  try {
    return await callGeminiWithFallback(apiKey, async (model) => {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        }
      });

      const responseText = result.response.text();
      const data = JSON.parse(responseText);
      return { success: true, data };
    });
  } catch (error: any) {
    return { success: false, error: `Error en autocompletado: ${error?.message || error}` };
  }
}

// ─────────────────────────────────────────────
// REFINE PROPOSAL FIELD
// ─────────────────────────────────────────────
export async function refineProposalField(
  fieldName: string,
  currentText: string,
  context: string
): Promise<{ success: boolean; text?: string; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'TU_API_KEY_AQUI') {
    return { success: false, error: 'API Key de Gemini no configurada.' };
  }

  const prompt = `Eres un ingeniero civil / supervisor de obras de la constructora P&P CONSTRUYE.
Tu objetivo es redactar, mejorar y estructurar el texto para un campo específico de una propuesta técnica.

Contexto general del proyecto:
"${context}"

Campo a modificar: "${fieldName}"
Texto actual o notas:
"${currentText}"

Instrucciones:
- Mejora la redacción, ortografía y estructura técnica.
- Usa lenguaje profesional y conciso, orientado a la construcción venezolana.
${fieldName.toLowerCase().includes('fase') ? `- Para las Fases del Trabajo, estructura el texto OBLIGATORIAMENTE en fases numeradas en negrita, y debajo de cada fase coloca cada servicio u actividad en una viñeta separada con guión (-).
Ejemplo:
**Fase 1: Albañilería y Paredes**
- Levantamiento de paredes en bloque de 15cm
- Frisado de muros con acabado liso

**Fase 2: Revestimientos e Instalaciones**
- Colocación de porcelanato en pisos
- Instalación de duchas y piezas sanitarias
- Colocación de lámparas y puntos de iluminación` : ''}
- Devuelve ÚNICAMENTE el texto mejorado, sin introducciones, saludos ni comillas.`;

  try {
    return await callGeminiWithFallback(apiKey, async (model) => {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return { success: true, text: text.trim() };
    });
  } catch (error: any) {
    return { success: false, error: `Error al refinar campo: ${error?.message || error}` };
  }
}

// ─────────────────────────────────────────────
// CHAT WITH PEPE (AI ASSISTANT)
// ─────────────────────────────────────────────
export async function chatAndUpdateForm(
  messages: ChatMessage[],
  currentForm: {
    title: string;
    clientId: string;
    clientName: string;
    date?: string;
    area: string;
    objective: string;
    phases: string;
    investmentModality: string;
    time: string;
    amount: string;
    payment: string;
    currency?: string;
    paymentMethods?: string;
    workItems?: { id: string; description: string; price: string }[];
  },
  clients: { id: string; name: string; company_name?: string }[]
): Promise<{ success: boolean; reply?: string; form?: any; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'TU_API_KEY_AQUI') {
    return { success: false, error: 'API Key de Gemini no configurada.' };
  }

  const clientsListStr = clients.map(c => "ID: " + c.id + " | Nombre: " + c.name + (c.company_name ? " (" + c.company_name + ")" : "")).join('\n');
  const conversationHistory = messages.map(m => (m.role === 'user' ? 'Usuario' : 'Pepe') + ': ' + m.text).join('\n');

  const prompt = `Eres Pepe, el asistente técnico de presupuestos de P&P CONSTRUYE. 
Tu objetivo es ayudar al usuario a rellenar un formulario estructurado para una nueva propuesta de construcción a través de una conversación interactiva.

El estado actual de los campos del formulario es el siguiente:
- Título del proyecto (title): "${currentForm.title}"
- ID del cliente registrado (clientId): "${currentForm.clientId}"
- Nombre en propuesta (clientName): "${currentForm.clientName}"
- Fecha de la propuesta (date): "${currentForm.date || ''}" (formato YYYY-MM-DD)
- Área de Ejecución (area): "${currentForm.area}"
- Objetivo del proyecto (objective): "${currentForm.objective}"
- Fases del trabajo (phases): "${currentForm.phases}" — IMPORTANTE: Este campo es SOLO narrativo/descriptivo. Describe las fases de trabajo sin precios.
- Desglose de inversión (workItems): ${JSON.stringify(currentForm.workItems || [])} — Sección SEPARADA y OPCIONAL con ítems y precios individuales.
- Modalidad del presupuesto (investmentModality): "${currentForm.investmentModality}"
- Tiempo de ejecución (time): "${currentForm.time}"
- Monto total en USD (amount): "${currentForm.amount}"
- Condiciones de pago (payment): "${currentForm.payment}"
- Moneda de Pago (currency): "${currentForm.currency || 'Divisas'}"
- Formas de Pago (paymentMethods): "${currentForm.paymentMethods || ''}"

Lista de clientes registrados en el sistema (ID | Nombre):
${clientsListStr || 'No hay clientes registrados.'}

Historial de la conversación:
${conversationHistory}

Instrucciones:
1. Analiza el último mensaje del usuario en el historial.
2. Si el usuario proporciona información relevante sobre la obra (como qué se va a construir, la fecha, el área o medidas, materiales, montos, tiempos, o cliente), actualiza o rellena el formulario correspondientemente.
3. Si el usuario pide explícitamente modificar un campo o agregar un detalle (ej. "Ponle 1200 dólares", "Ponle fecha de ayer", "Fecha 15 de agosto", "Cambia el área a 50m2", "En las fases agrega pintar las vigas"), realiza esa modificación sobre el estado actual del formulario. Para fechas, usa siempre formato YYYY-MM-DD.
4. Intenta buscar coincidencias claras en la lista de clientes registrados. Si encuentras una, coloca su ID en 'clientId' y su nombre exacto en 'clientName'. Si no hay cliente registrado pero se menciona un nombre, colócalo en 'clientName' y deja 'clientId' vacío.
5. Si el usuario te pide que "hagas el presupuesto", "calcules" o "estimes", genera descripciones técnicas profesionales y estimaciones realistas basadas en tu conocimiento de ingeniería para rellenar los campos (objetivo, fases, tiempo, etc.), manteniendo siempre la coherencia.
6. En cuanto a la 'Modalidad del Presupuesto' (investmentModality): si el usuario menciona "mano de obra", actualiza este campo con una descripción formal para Solo Mano de Obra. Si menciona "materiales", usa una descripción formal para Solo Materiales. Por defecto, usa la descripción de "A Todo Costo".
7. Formula una respuesta conversacional corta, amable y profesional firmada como Pepe (máximo 3 párrafos, sin adornos excesivos, explicando de manera resumida qué campos actualizaste o pidiendo aclaraciones si falta información clave).
8. IMPORTANTE SOBRE 'phases' vs 'workItems': El campo 'phases' es EXCLUSIVAMENTE descriptivo y técnico (sin precios). Debes estructurarlo OBLIGATORIAMENTE con el título de cada fase en negrita (**Fase 1: Título**, **Fase 2: Título**, etc.) y debajo de cada una los servicios y actividades técnicas específicas desglosadas en viñetas con guión (-).
Ejemplo:
**Fase 1: Albañilería y Paredes**
- Levantamiento de paredes en bloque de 15cm
- Frisado de muros con acabado liso

**Fase 2: Revestimientos e Instalaciones**
- Colocación de porcelanato en pisos
- Instalación de duchas y piezas sanitarias
- Colocación de lámparas y puntos de iluminación

El campo 'workItems' es una sección SEPARADA llamada 'Desglose de Inversión' que SOLO se usa cuando el usuario pide explícitamente desglosar costos por concepto (ej. "ponme el aire a 850 y la pared a 1200"). Si el usuario NO pide desglose de precios, deja 'workItems' vacío ([]). Cada objeto de 'workItems' debe tener un 'id' único (string), una 'description' y un 'price' (solo el número en formato string, sin símbolo de dólar).
9. DEVUELVE TU RESPUESTA ESTRICTAMENTE EN FORMATO JSON con las siguientes dos claves:
{
  "reply": "Tu mensaje conversacional explicando qué hiciste o preguntando detalles...",
  "form": {
    "title": "...",
    "clientId": "...",
    "clientName": "...",
    "date": "YYYY-MM-DD",
    "area": "...",
    "objective": "...",
    "phases": "...",
    "workItems": [
      { "id": "1", "description": "...", "price": "..." }
    ],
    "investmentModality": "...",
    "time": "...",
    "amount": "...",
    "payment": "...",
    "currency": "...",
    "paymentMethods": "..."
  }
}

IMPORTANTE: Responde ÚNICAMENTE con el objeto JSON anterior, sin markdown adicional, sin rodeos, sin el bloque de código \`\`\`json. Asegúrate de escapar TODAS las comillas dobles internas con \\" (ejemplo: \\"A Todo Costo\\") y los saltos de línea correctamente para que el JSON sea válido.`;

  try {
    return await callGeminiWithFallback(apiKey, async (model) => {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        }
      });

      let responseText = result.response.text().trim();
      if (responseText.startsWith('```json')) {
        responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(responseText);

      return { 
        success: true, 
        reply: parsed.reply || 'Entendido, he actualizado el formulario.', 
        form: parsed.form || currentForm 
      };
    });
  } catch (error: any) {
    return { success: false, error: `Error en chat de Pepe: ${error?.message || 'Servicio temporalmente ocupado'}` };
  }
}

// ─────────────────────────────────────────────
// PARSE PROPOSAL TEXT TO FORM FIELDS
// ─────────────────────────────────────────────
export async function parseProposalTextToForm(
  text: string
): Promise<{ success: boolean; form?: any; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'TU_API_KEY_AQUI') {
    return { success: false, error: 'API Key de Gemini no configurada.' };
  }

  const prompt = `Analiza la siguiente propuesta de construcción redactada y extrae/deduce los valores correspondientes para los campos del formulario.
Si algún campo no está explícitamente en el texto, deduce un valor adecuado basado en el contexto de la propuesta.

Texto de la propuesta:
"${text}"

Campos a extraer:
- title: Título del proyecto (extrae del campo 'Proyecto:')
- clientName: Nombre del cliente (extrae del campo 'Para:')
- date: Fecha de la propuesta en formato YYYY-MM-DD (extrae del campo 'Fecha:' si está presente, convirtiéndolo a YYYY-MM-DD)
- area: Área de ejecución (extrae del campo 'Área de Ejecución:')
- objective: El texto completo de la sección 'Objetivo del Proyecto' (sin el título 'Objetivo del Proyecto')
- phases: Las fases de trabajo en texto libre.
- workItems: Si las fases del trabajo incluyen ítems con precios específicos (ej: "Instalación... $100"), extráelos como un array de objetos con 'id' (generado aleatoriamente), 'description' y 'price' (solo el número en formato string).
- investmentModality: El texto de la sección 'Presupuesto de Inversión' (típicamente explica la modalidad de inversión, sin incluir el monto total ni el título de la sección)
- time: Tiempo de ejecución (extrae del campo 'Tiempo de Ejecución y Entrega:' o similar)
- amount: Monto de inversión en USD, solo números o formato decimal (ejemplo: "1234.56" o "1234,56", extrae del campo 'INVERSIÓN TOTAL:')
- payment: Esquema de pago (ej: "60% anticipo / 40% al finalizar", extrae del campo 'Esquema de Pago:')
- currency: Moneda de pago (ej: "Divisas" o "Bolívares", extrae del campo 'Moneda de Pago:' o 'Tasa de Cambio:' o dedúcelo de la descripción)
- paymentMethods: Formas de pago / métodos (extrae de 'Formas de Pago:' o 'Métodos de pago:')

IMPORTANTE: Responde ÚNICAMENTE con un objeto JSON válido con las siguientes claves:
{
  "title": "",
  "clientName": "",
  "date": "",
  "area": "",
  "objective": "",
  "phases": "",
  "workItems": [],
  "investmentModality": "",
  "time": "",
  "amount": "",
  "payment": "",
  "currency": "",
  "paymentMethods": ""
}`;

  try {
    return await callGeminiWithFallback(apiKey, async (model) => {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        }
      });

      const responseText = result.response.text();
      const data = JSON.parse(responseText);

      return { success: true, form: data };
    });
  } catch (error: any) {
    return { success: false, error: `Error al parsear propuesta: ${error?.message || error}` };
  }
}

// ─────────────────────────────────────────────
// PEPE IA: EXTRAER SERVICIOS OFRECIDOS EN LA PROPUESTA
// ─────────────────────────────────────────────
export interface ExtractedServicePhase {
  phase: string;
  tasks: string[];
}

export async function extractServicesFromProposalWithPepe(proposalText: string): Promise<{
  success: boolean;
  phases?: ExtractedServicePhase[];
  error?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'TU_API_KEY_AQUI') {
    return { success: false, error: 'API Key de Gemini no configurada. Agrega GEMINI_API_KEY en el archivo .env.local' };
  }

  const prompt = `Eres "Pepe", el asistente técnico de ingeniería y obras de P&P CONSTRUYE.
Tu misión es analizar el texto de una propuesta técnica y económica y extraer ÚNICA Y EXCLUSIVAMENTE los SERVICIOS Y ACTIVIDADES DE OBRA OFRECIDOS al cliente, para cargarlos en la lista de seguimiento y control de ejecución.

TEXTO DE LA PROPUESTA:
"""
${proposalText}
"""

REGLAS ESTRICTAS DE EXTRACCIÓN:
1. Extrae únicamente las actividades técnicas, partidas reales y servicios ofrecidos que el equipo debe ejecutar en la obra (ejemplos: "Demolición y remoción de manto asfáltico deteriorado", "Aplicación de imprimante asfáltico en 45 m²", "Colocación de manto asfáltico 4mm con soplete", "Instalación de tuberías sanitarias PVC 4 pulgadas", "Prueba de estanqueidad por 48 horas", etc.).
2. Agrupa los servicios bajo el nombre de su Fase correspondiente tal como se redactó en la propuesta (ej. "Fase 1: Preparación y Demolición", "Fase 2: Impermeabilización", "Fase 3: Acabados"). Si la propuesta no tiene fases explícitas, agrúpalas en fases lógicas de construcción ("Fase 1: Trabajos Preliminares", "Fase 2: Ejecución Principal", "Fase 3: Acabados y Entrega").
3. DESCARTA ABSOLUTAMENTE Y NO INCLUYAS:
   - Esquemas o porcentajes de pago (anticipo, porcentajes de finalización, etc.).
   - Monedas, divisas, bancos, Zelle, Binance, efectivo o tasas de cambio.
   - Precios, costos unitarios o montos de inversión en los títulos.
   - Nombres de clientes, saludos, introducciones comerciales o firmas.
   - Garantías o textos administrativos.
4. Cada tarea debe ser una frase clara, descriptiva y ejecutable de lo que se prometió hacer.

Responde OBLIGATORIAMENTE en formato JSON con la siguiente estructura:
[
  {
    "phase": "Fase 1: Nombre de la fase",
    "tasks": [
      "Descripción clara del servicio o actividad 1",
      "Descripción clara del servicio o actividad 2"
    ]
  },
  {
    "phase": "Fase 2: Nombre de la fase",
    "tasks": [
      "Descripción del servicio..."
    ]
  }
]`;

  try {
    return await callGeminiWithFallback(apiKey, async (model) => {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        }
      });

      const responseText = result.response.text();
      const parsedData = JSON.parse(responseText);

      if (!Array.isArray(parsedData)) {
        throw new Error('La respuesta de Pepe IA no tuvo el formato de lista esperado.');
      }

      // Validar y limpiar estructura
      const cleanPhases: ExtractedServicePhase[] = parsedData.map((item: any, idx: number) => ({
        phase: typeof item.phase === 'string' && item.phase.trim() ? item.phase.trim() : `Fase ${idx + 1}`,
        tasks: Array.isArray(item.tasks) 
          ? item.tasks.map((t: any) => String(t).trim()).filter((t: string) => t.length > 0)
          : []
      })).filter(p => p.tasks.length > 0);

      return { success: true, phases: cleanPhases };
    });
  } catch (error: any) {
    return { success: false, error: `Error de Pepe IA al extraer servicios: ${error?.message || error}` };
  }
}

