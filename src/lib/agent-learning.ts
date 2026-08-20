import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseAdmin } from './supabase-admin';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface LearnedSkill {
  id: string;
  category: 'alias' | 'supplier' | 'rule' | 'pricing' | 'correction' | 'general';
  skill_key: string;
  description: string;
  confidence: number;
  source: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. OBTENER HABILIDADES ACTIVAS PARA EL CONTEXTO DEL AGENTE
// ─────────────────────────────────────────────────────────────────────────────

export async function getLearnedSkillsContext(limit: number = 15): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin
      .from('agent_learned_skills')
      .select('id, category, skill_key, description, usage_count')
      .order('usage_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data || data.length === 0) {
      return 'No hay habilidades o reglas aprendidas registradas aún.';
    }

    const categoryLabels: Record<string, string> = {
      alias: 'Alias / Sobrenombre',
      supplier: 'Proveedor',
      rule: 'Regla Operativa',
      pricing: 'Costo / Precio',
      correction: 'Corrección previa',
      general: 'Conocimiento'
    };

    return data.map((s: any) => {
      const cat = categoryLabels[s.category] || s.category;
      return `• [${cat}] ${s.skill_key}: ${s.description}`;
    }).join('\n');
  } catch (err: any) {
    console.error('Error cargando habilidades aprendidas:', err);
    return 'No hay habilidades aprendidas disponibles.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ENSEÑAR HABILIDAD DIRECTAMENTE
// ─────────────────────────────────────────────────────────────────────────────

export async function teachSkillDirectly(instructionText: string): Promise<{
  success: boolean;
  skillKey: string;
  category: string;
  description: string;
  message: string;
}> {
  if (!genAI) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const prompt = `
Eres el sintetizador de conocimientos de P&P CONSTRUYE.
Tu misión es extraer y estructurar una habilidad, alias o regla de negocio a partir de la siguiente instrucción del usuario:

Instrucción del usuario:
"${instructionText}"

Categorías posibles:
- "alias": Asociación de sobrenombres a clientes u obras (ej. "el galpón" -> Proyecto X).
- "supplier": Hábitos y rubros de proveedores (ej. "EPA vende materiales", "Tubos C.A. da 30 días de crédito").
- "rule": Reglas operativas o de negocio (ej. "los fletes menores a 30$ van en otros").
- "pricing": Precios de referencia o rangos de costos (ej. "el saco de cemento cuesta 8$").
- "correction": Correcciones a comportamientos previos.
- "general": Conocimiento general de la constructora.

Responde ÚNICAMENTE con este JSON:
{
  "category": "alias" | "supplier" | "rule" | "pricing" | "correction" | "general",
  "skill_key": "<clave corta o término disparador, ej. 'el galpón', 'ferretería EPA', 'fletes'>",
  "description": "<descripción clara y directa de la regla que el bot debe aplicar siempre>"
}
`;

  const fallbackModels = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];
  let parsed: any = null;

  for (const modelName of fallbackModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.1 }
      });

      const result = await model.generateContent(prompt);
      const rawText = result.response.text();
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) || rawText.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : rawText;
      parsed = JSON.parse(jsonStr.trim());
      break;
    } catch (e: any) {
      console.warn(`Error en modelo ${modelName} para teachSkill:`, e.message);
    }
  }

  if (!parsed) {
    throw new Error('No se pudo sintetizar el aprendizaje con los modelos disponibles.');
  }

  try {

    // Guardar en la base de datos
    const { data, error } = await supabaseAdmin
      .from('agent_learned_skills')
      .insert({
        category: parsed.category || 'general',
        skill_key: parsed.skill_key || 'regla_general',
        description: parsed.description || instructionText,
        confidence: 1.0,
        source: 'user_instruction'
      })
      .select('id, category, skill_key, description')
      .single();

    if (error) throw error;

    return {
      success: true,
      skillKey: data.skill_key,
      category: data.category,
      description: data.description,
      message: `✅ *Habilidad Aprendida Exitosamente*\n📌 *Clave:* ${data.skill_key}\n🏷️ *Tipo:* ${data.category.toUpperCase()}\n📖 *Regla:* ${data.description}`
    };
  } catch (err: any) {
    console.error('Error al sintetizar habilidad:', err);
    throw new Error(`No pude procesar el aprendizaje: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. AUTO-EXTRACCION DE APRENDIZAJE POR CORRECCION
// ─────────────────────────────────────────────────────────────────────────────

export async function autoExtractLearningFromCorrection(
  userMessage: string,
  previousBotMessage?: string
): Promise<boolean> {
  if (!genAI) return false;

  const lower = userMessage.toLowerCase();
  // Patrones que indican corrección o enseñanza implícita
  const isCorrection = 
    lower.startsWith('no,') || 
    lower.startsWith('no ') || 
    lower.includes('no era') || 
    lower.includes('acuérdate que') || 
    lower.includes('acuerdate que') || 
    lower.includes('recuerda que') || 
    lower.includes('la próxima vez') || 
    lower.includes('siempre pon') || 
    lower.includes('no vuelvas a');

  if (!isCorrection || userMessage.length < 10) {
    return false;
  }

  const prompt = `
Analiza si el siguiente mensaje del usuario contiene una CORRECCIÓN de comportamiento o REGLA DE NEGOCIO para el asistente de construcción:

Mensaje del usuario: "${userMessage}"
Mensaje previo del bot: "${previousBotMessage || 'N/A'}"

Si contiene una regla o corrección útil que debe recordarse a futuro, extrae el JSON:
{
  "is_learnable": true,
  "category": "alias" | "supplier" | "rule" | "pricing" | "correction",
  "skill_key": "<clave corta>",
  "description": "<regla clara a recordar>"
}

Si es solo una negación casual sin regla duradera (ej. "no gracias", "no entiendo"), responde:
{ "is_learnable": false }
`;

  const fallbackModels = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];
  let parsed: any = null;

  for (const modelName of fallbackModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.1 }
      });

      const res = await model.generateContent(prompt);
      const rawText = res.response.text();
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) || rawText.match(/(\{[\s\S]*\})/);
      parsed = JSON.parse((jsonMatch ? jsonMatch[1] : rawText).trim());
      break;
    } catch (e: any) {
      console.warn(`Error en modelo ${modelName} para autoExtractLearning:`, e.message);
    }
  }

  try {
    if (parsed && parsed.is_learnable && parsed.skill_key && parsed.description) {
      await supabaseAdmin.from('agent_learned_skills').insert({
        category: parsed.category || 'correction',
        skill_key: parsed.skill_key,
        description: parsed.description,
        confidence: 0.9,
        source: 'correction'
      });
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Error en auto-extracción de corrección:', err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. LISTAR Y ELIMINAR HABILIDADES
// ─────────────────────────────────────────────────────────────────────────────

export async function listLearnedSkills(category?: string): Promise<LearnedSkill[]> {
  try {
    let query = supabaseAdmin
      .from('agent_learned_skills')
      .select('*')
      .order('usage_count', { ascending: false })
      .order('created_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query.limit(30);
    if (error) throw error;
    return data || [];
  } catch (err: any) {
    console.error('Error listando habilidades aprendidas:', err);
    return [];
  }
}

export async function deleteLearnedSkill(id: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('agent_learned_skills')
      .delete()
      .eq('id', id);

    return !error;
  } catch (err) {
    console.error('Error eliminando habilidad aprendida:', err);
    return false;
  }
}
