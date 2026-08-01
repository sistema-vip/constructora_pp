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
[Lista secuencial de las fases de ejecución. Cada fase debe ir OBLIGATORIAMENTE en una nueva línea. NO coloques números de lista antes de la palabra "Fase" (Ej. usa directamente: **Fase 1 - Nombre de la fase**: descripción), e incluye una breve descripción técnica.]

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

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Build the chat history for the API (all except the last user message)
    const history = messages.slice(0, -1).map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    }));

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: CHAT_SYSTEM_PROMPT }] },
        { role: 'model', parts: [{ text: '¡Entendido! Soy el asistente técnico de P&P CONSTRUYE. ¿En qué proyecto estamos trabajando?' }] },
        ...history
      ],
    });

    const lastMessage = messages[messages.length - 1].text;
    const result = await chat.sendMessage(lastMessage);
    const replyText = result.response.text();

    const readyToGenerate = replyText.includes('[LISTO_PARA_GENERAR]');
    const cleanReply = replyText.replace('[LISTO_PARA_GENERAR]', '').trim();

    return {
      success: true,
      reply: cleanReply || '¡Perfecto! La información está lista. Presiona "Generar Propuesta" para formalizarla.',
      readyToGenerate,
    };
  } catch (error: any) {
    return { success: false, error: `Error al contactar Gemini: ${error.message}` };
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

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
  } catch (error: any) {
    return { success: false, error: `Error al generar propuesta: ${error.message}` };
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

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Eres un asistente técnico de construcción. A continuación te presento el texto actual de una propuesta de construcción.
El usuario ha solicitado el siguiente cambio o ajuste: "${instruction}"

Aplica el cambio solicitado sobre el texto actual manteniendo el formato profesional, sin añadir saludos ni despedidas innecesarias. 
IMPORTANTE: Para las fases del trabajo, NO coloques números ni viñetas al inicio (ej. NO pongas "1. Fase 1:"), escribe directamente el título "Fase 1: ...".
Devuelve ÚNICAMENTE el nuevo texto modificado. Elimina cualquier guión "---" al inicio o al final del texto.

--- TEXTO ACTUAL ---
${currentText}
--- FIN DEL TEXTO ACTUAL ---`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    return {
      success: true,
      modifiedText: responseText
    };
  } catch (error: any) {
    return { success: false, error: `Error al modificar propuesta: ${error.message}` };
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

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
5. Genera un desglose de las fases de trabajo técnico en 'phases' (Fases del Trabajo). NO uses listas numeradas tradicionales; comienza la línea directamente con "**Fase 1**" (o la fase correspondiente).
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

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const responseText = result.response.text();
    const data = JSON.parse(responseText);

    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: `Error en autocompletado: ${error.message}` };
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

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Eres un ingeniero civil / arquitecto de la constructora P&P CONSTRUYE.
Tu objetivo es redactar, mejorar y estructurar el texto para un campo específico de una propuesta.

Contexto general del proyecto:
"${context}"

Campo a modificar: "${fieldName}"
Texto actual o notas:
"${currentText}"

Instrucciones:
- Mejora la redacción, ortografía y estructura técnica.
- Usa lenguaje profesional y conciso, orientado a la construcción.
- Devuelve ÚNICAMENTE el texto mejorado, sin introducciones ni comillas.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return { success: true, text: text.trim() };
  } catch (error: any) {
    return { success: false, error: `Error al refinar campo: ${error.message}` };
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

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const clientsListStr = clients.map(c => "ID: " + c.id + " | Nombre: " + c.name + (c.company_name ? " (" + c.company_name + ")" : "")).join('\n');
    const conversationHistory = messages.map(m => (m.role === 'user' ? 'Usuario' : 'Pepe') + ': ' + m.text).join('\n');

    const prompt = `Eres Pepe, el asistente técnico de presupuestos de P&P CONSTRUYE. 
Tu objetivo es ayudar al usuario a rellenar un formulario estructurado para una nueva propuesta de construcción a través de una conversación interactiva.

El estado actual de los campos del formulario es el siguiente:
- Título del proyecto (title): "${currentForm.title}"
- ID del cliente registrado (clientId): "${currentForm.clientId}"
- Nombre en propuesta (clientName): "${currentForm.clientName}"
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
2. Si el usuario proporciona información relevante sobre la obra (como qué se va a construir, el área o medidas, materiales, montos, tiempos, o cliente), actualiza o rellena el formulario correspondientemente.
3. Si el usuario pide explícitamente modificar un campo o agregar un detalle (ej. "Ponle 1200 dólares", "Cambia el área a 50m2", "En las fases agrega pintar las vigas"), realiza esa modificación sobre el estado actual del formulario.
4. Intenta buscar coincidencias claras en la lista de clientes registrados. Si encuentras una, coloca su ID en 'clientId' y su nombre exacto en 'clientName'. Si no hay cliente registrado pero se menciona un nombre, colócalo en 'clientName' y deja 'clientId' vacío.
5. Si el usuario te pide que "hagas el presupuesto", "calcules" o "estimes", genera descripciones técnicas profesionales y estimaciones realistas basadas en tu conocimiento de ingeniería para rellenar los campos (objetivo, fases, tiempo, etc.), manteniendo siempre la coherencia.
6. En cuanto a la 'Modalidad del Presupuesto' (investmentModality): si el usuario menciona "mano de obra", actualiza este campo con una descripción formal para Solo Mano de Obra. Si menciona "materiales", usa una descripción formal para Solo Materiales. Por defecto, usa la descripción de "A Todo Costo".
7. Formula una respuesta conversacional corta, amable y profesional firmada como Pepe (máximo 3 párrafos, sin adornos excesivos, explicando de manera resumida qué campos actualizaste o pidiendo aclaraciones si falta información clave).
8. IMPORTANTE SOBRE 'phases' vs 'workItems': El campo 'phases' es EXCLUSIVAMENTE descriptivo — describe qué se va a hacer en cada fase, sin precios ni montos. NUNCA incluyas precios en 'phases'. El campo 'workItems' es una sección SEPARADA llamada 'Desglose de Inversión' que SOLO se usa cuando el usuario pide explícitamente desglosar costos por concepto (ej. "ponme el aire a 850 y la pared a 1200"). Si el usuario NO pide desglose de precios, deja 'workItems' vacío ([]). Cada objeto de 'workItems' debe tener un 'id' único (string), una 'description' y un 'price' (solo el número en formato string, sin símbolo de dólar).
9. DEVUELVE TU RESPUESTA ESTRICTAMENTE EN FORMATO JSON con las siguientes dos claves:
{
  "reply": "Tu mensaje conversacional explicando qué hiciste o preguntando detalles...",
  "form": {
    "title": "...",
    "clientId": "...",
    "clientName": "...",
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

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    return { 
      success: true, 
      reply: parsed.reply, 
      form: parsed.form 
    };
  } catch (error: any) {
    return { success: false, error: `Error en chat de Pepe: ${error.message}` };
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

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Analiza la siguiente propuesta de construcción redactada y extrae/deduce los valores correspondientes para los campos del formulario.
Si algún campo no está explícitamente en el texto, deduce un valor adecuado basado en el contexto de la propuesta.

Texto de la propuesta:
"${text}"

Campos a extraer:
- title: Título del proyecto (extrae del campo 'Proyecto:')
- clientName: Nombre del cliente (extrae del campo 'Para:')
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

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const responseText = result.response.text();
    const data = JSON.parse(responseText);

    return { success: true, form: data };
  } catch (error: any) {
    return { success: false, error: `Error al parsear propuesta: ${error.message}` };
  }
}

