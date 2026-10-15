import { supabaseAdmin } from '@/lib/supabase-admin';

export const WEB_PEPE_SESSION_CHAT_ID = 999001;
export const GLOBAL_SKILLS_SESSION_CHAT_ID = 999000;

export interface PepeMemoryMessage {
  role: 'user' | 'model';
  text: string;
  timestamp?: string;
  actionTaken?: string;
}

export interface PepeSessionMemoryData {
  recentMessages: PepeMemoryMessage[];
  activeProjectId?: string | null;
  activeProjectTitle?: string | null;
  activeClientName?: string | null;
  lastActionTaken?: string | null;
  learnedFacts?: string[];
}

export interface FallbackSkill {
  id: string;
  category: string;
  skill_key: string;
  description: string;
  created_at: string;
  usage_count: number;
}

/**
 * Obtiene la memoria conversacional persistente de Pepe para una sesión web/móvil.
 */
export async function getPepeSessionMemory(
  sessionId: number = WEB_PEPE_SESSION_CHAT_ID
): Promise<PepeSessionMemoryData> {
  try {
    const { data, error } = await supabaseAdmin
      .from('telegram_sessions')
      .select('project_options, project_id, client_name, description')
      .eq('telegram_chat_id', sessionId)
      .maybeSingle();

    if (error || !data) {
      return { recentMessages: [] };
    }

    const options = (data.project_options as any) || {};
    return {
      recentMessages: Array.isArray(options.recentMessages) ? options.recentMessages : [],
      activeProjectId: data.project_id || options.activeProjectId || null,
      activeProjectTitle: options.activeProjectTitle || null,
      activeClientName: data.client_name || options.activeClientName || null,
      lastActionTaken: options.lastActionTaken || null,
      learnedFacts: Array.isArray(options.learnedFacts) ? options.learnedFacts : []
    };
  } catch (err: any) {
    console.warn('[PepeMemory] Error cargando memoria de sesión:', err?.message || err);
    return { recentMessages: [] };
  }
}

/**
 * Guarda o actualiza la memoria estructurada de Pepe para una sesión web/móvil.
 */
export async function savePepeSessionMemory(
  sessionId: number = WEB_PEPE_SESSION_CHAT_ID,
  memoryUpdate: Partial<PepeSessionMemoryData>
): Promise<void> {
  try {
    const current = await getPepeSessionMemory(sessionId);
    const updatedMessages = memoryUpdate.recentMessages
      ? memoryUpdate.recentMessages.slice(-20) // Guardar últimos 20 mensajes
      : current.recentMessages;

    const updatedOptions = {
      recentMessages: updatedMessages,
      activeProjectId: memoryUpdate.activeProjectId ?? current.activeProjectId,
      activeProjectTitle: memoryUpdate.activeProjectTitle ?? current.activeProjectTitle,
      activeClientName: memoryUpdate.activeClientName ?? current.activeClientName,
      lastActionTaken: memoryUpdate.lastActionTaken ?? current.lastActionTaken,
      learnedFacts: memoryUpdate.learnedFacts ?? current.learnedFacts ?? []
    };

    await supabaseAdmin
      .from('telegram_sessions')
      .upsert({
        telegram_chat_id: sessionId,
        state: 'active',
        project_id: updatedOptions.activeProjectId || null,
        client_name: updatedOptions.activeClientName || null,
        description: 'Memoria activa de Pepe (Web / App Móvil)',
        project_options: updatedOptions,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 días
      });
  } catch (err: any) {
    console.warn('[PepeMemory] Error guardando memoria de sesión:', err?.message || err);
  }
}

/**
 * Limpia el historial de conversación de la sesión web/móvil manteniendo las preferencias.
 */
export async function clearPepeSessionMemory(
  sessionId: number = WEB_PEPE_SESSION_CHAT_ID
): Promise<void> {
  try {
    await supabaseAdmin
      .from('telegram_sessions')
      .update({
        project_options: { recentMessages: [] },
        project_id: null,
        client_name: null
      })
      .eq('telegram_chat_id', sessionId);
  } catch (err: any) {
    console.warn('[PepeMemory] Error limpiando memoria de sesión:', err?.message || err);
  }
}

/**
 * Fallback resiliente para habilidades aprendidas cuando la tabla agent_learned_skills no existe.
 */
export async function getPersistentSkillsFallback(): Promise<FallbackSkill[]> {
  try {
    const { data } = await supabaseAdmin
      .from('telegram_sessions')
      .select('project_options')
      .eq('telegram_chat_id', GLOBAL_SKILLS_SESSION_CHAT_ID)
      .maybeSingle();

    if (!data?.project_options) return [];
    const skills = (data.project_options as any)?.skills;
    return Array.isArray(skills) ? skills : [];
  } catch {
    return [];
  }
}

export async function savePersistentSkillFallback(skill: {
  category: string;
  skill_key: string;
  description: string;
}): Promise<FallbackSkill> {
  const currentSkills = await getPersistentSkillsFallback();
  const newSkill: FallbackSkill = {
    id: `skill_${Date.now()}`,
    category: skill.category,
    skill_key: skill.skill_key,
    description: skill.description,
    created_at: new Date().toISOString(),
    usage_count: 1
  };

  // Reemplazar si ya existe la misma clave
  const filtered = currentSkills.filter(s => s.skill_key.toLowerCase() !== skill.skill_key.toLowerCase());
  const updatedSkills = [newSkill, ...filtered].slice(0, 50);

  await supabaseAdmin
    .from('telegram_sessions')
    .upsert({
      telegram_chat_id: GLOBAL_SKILLS_SESSION_CHAT_ID,
      state: 'skills_storage',
      description: 'Almacén de reglas aprendidas de Pepe (Fallback de habilidades)',
      project_options: { skills: updatedSkills },
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    });

  return newSkill;
}
