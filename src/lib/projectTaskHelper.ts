import { supabase } from './supabase';
import { extractServicesFromProposalWithPepe } from '@/app/actions/ai-actions';

/**
 * Parser inteligente que extrae fases y servicios ofrecidos del texto de la propuesta
 */
export function parseProposalTasks(description: string): { title: string; phase: string; sort_order: number }[] {
  if (!description) return [];
  const lines = description.split('\n');
  const extractedTasks: { title: string; phase: string; sort_order: number }[] = [];
  let currentPhase = 'Fase 1: Alcance y Obras Preliminares';
  let inScopeSection = false;
  let sortCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();

    // Detectar inicio de sección técnica
    if (
      lower.includes('fases del trabajo') || 
      lower.includes('alcance técnico') || 
      lower.includes('alcance de la obra') ||
      lower.includes('fases de ejecución') ||
      lower.includes('desglose de inversión')
    ) {
      inScopeSection = true;
      continue;
    }

    // Detectar fin de sección técnica
    if (
      lower.includes('tiempo de ejecución') || 
      lower.includes('presupuesto de inversión') || 
      lower.includes('inversión total') || 
      lower.includes('condiciones y métodos de pago')
    ) {
      inScopeSection = false;
    }

    // Detectar encabezado de Fase
    const phaseMatch = 
      trimmed.match(/^(?:###|\*\*|\*|#)?\s*(Fase\s+[\w\d\.\-]+[^\n\*\:]*)/i) ||
      trimmed.match(/^(\d+\.\s*(?:Fase|Etapa)[^\n\*\:]*)/i) ||
      trimmed.match(/^(?:Día|Dia)\s+\d+:\s*(.*)/i);

    if (phaseMatch) {
      const rawPhaseName = phaseMatch[1].replace(/[\*#\:\_]/g, '').trim();
      currentPhase = rawPhaseName.length > 3 ? rawPhaseName : `Fase ${rawPhaseName}`;
      inScopeSection = true;
      continue;
    }

    // Detectar actividades / viñetas
    if (inScopeSection) {
      const bulletMatch = 
        trimmed.match(/^[-*•]\s+(.*)$/) ||
        trimmed.match(/^\d+[\.\)]\s+(.*)$/) ||
        trimmed.match(/^[a-z][\.\)]\s+(.*)$/i);

      if (bulletMatch) {
        const rawTitle = bulletMatch[1].replace(/[\*_]/g, '').trim();
        if (!rawTitle.toLowerCase().startsWith('fase') && rawTitle.length > 2) {
          extractedTasks.push({
            title: rawTitle,
            phase: currentPhase,
            sort_order: sortCounter++
          });
        }
      } else if (trimmed.length > 5 && !trimmed.startsWith('#') && !trimmed.endsWith(':')) {
        const cleanText = trimmed.replace(/[\*_]/g, '').trim();
        if (!cleanText.toLowerCase().startsWith('fase') && cleanText.length < 160) {
          extractedTasks.push({
            title: cleanText,
            phase: currentPhase,
            sort_order: sortCounter++
          });
        }
      }
    }
  }

  // Fallback si no había formato explícito de fases
  if (extractedTasks.length === 0) {
    const paragraphs = description.split('\n\n').filter(p => p.trim());
    for (const p of paragraphs) {
      const cleanP = p.replace(/[\*_#]/g, '').trim();
      if (cleanP.length > 5 && cleanP.length < 150 && !cleanP.toLowerCase().includes('inversión') && !cleanP.toLowerCase().includes('condiciones')) {
        extractedTasks.push({
          title: cleanP,
          phase: 'Fase General',
          sort_order: sortCounter++
        });
      }
    }
  }

  return extractedTasks;
}

/**
 * Traslada automáticamente los servicios de la propuesta a la lista de seguimiento
 * al momento de aprobar la propuesta o iniciar la obra.
 */
export async function autoPopulateTrackingTasks(projectId: string, description: string) {
  if (!projectId || !description) return;

  try {
    // 1. Verificar si ya existen tareas para este proyecto
    const { data: existingTasks, error: countError } = await supabase
      .from('project_tasks')
      .select('id')
      .eq('project_id', projectId)
      .limit(1);

    if (countError) {
      console.warn('Error checking existing tasks:', countError);
    }

    if (existingTasks && existingTasks.length > 0) {
      return; // Ya tiene tareas cargadas
    }

    // 2. Extraer tareas con el parser rápido
    let tasksToInsert = parseProposalTasks(description);

    // 3. Si el parser local no detectó tareas, usar Pepe IA como respaldo inteligente
    if (tasksToInsert.length === 0) {
      try {
        const aiRes = await extractServicesFromProposalWithPepe(description);
        if (aiRes.success && aiRes.phases) {
          let counter = 0;
          aiRes.phases.forEach(p => {
            p.tasks.forEach(t => {
              tasksToInsert.push({
                title: t,
                phase: p.phase,
                sort_order: counter++
              });
            });
          });
        }
      } catch (aiErr) {
        console.warn('Pepe fallback failed in autoPopulateTrackingTasks:', aiErr);
      }
    }

    // 4. Insertar las tareas en project_tasks
    if (tasksToInsert.length > 0) {
      const records = tasksToInsert.map(t => ({
        project_id: projectId,
        title: t.title,
        phase: t.phase,
        completed: false,
        sort_order: t.sort_order
      }));

      const { error: insertError } = await supabase
        .from('project_tasks')
        .insert(records);

      if (insertError) {
        console.error('Error inserting auto tracking tasks:', insertError);
      }
    }
  } catch (err) {
    console.error('Error in autoPopulateTrackingTasks:', err);
  }
}
