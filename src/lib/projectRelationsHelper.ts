import { supabase } from './supabase';
import { formatCurrency } from './formatters';

export interface UnifiedAdditional {
  id: string;
  proposal_number?: number | string;
  title: string;
  budget_usd: number;
  description?: string;
  merged_at?: string;
}

export interface ParentProjectInfo {
  id: string;
  proposal_number?: number | string;
  title: string;
  budget_usd?: number;
}

export interface ProjectRelationInfo {
  isOriginalWithAdditionals: boolean;
  isAdditional: boolean;
  parentProject?: ParentProjectInfo | null;
  originalBudgetUsd: number;
  additionals: UnifiedAdditional[];
  totalAdditionalsBudget: number;
  combinedTotalBudget: number;
}

/**
 * Extrae y analiza la relación de un proyecto (si es Original con Adicionales, o un Adicional de otro).
 * Compatible tanto con columnas DB (parent_project_id, is_additional) como con metadatos embebidos.
 */
export function parseProjectRelation(project: any, allProjects: any[] = []): ProjectRelationInfo {
  if (!project) {
    return {
      isOriginalWithAdditionals: false,
      isAdditional: false,
      parentProject: null,
      originalBudgetUsd: 0,
      additionals: [],
      totalAdditionalsBudget: 0,
      combinedTotalBudget: 0
    };
  }

  const currentBudget = Number(project.budget_usd || 0);
  let isAdditional = Boolean(project.is_additional || project.status === 'merged_additional');
  let parentProject: ParentProjectInfo | null = null;
  let additionals: UnifiedAdditional[] = [];
  let originalBudget: number | null = null;

  const desc = project.description || '';

  // 1. Revisar si hay etiqueta de Adicionales Unificados: <!-- PP_UNIFIED_ADDITIONALS: [...] -->
  const additionalsMatch = desc.match(/<!--\s*PP_UNIFIED_ADDITIONALS:\s*(\[[\s\S]*?\])\s*-->/);
  if (additionalsMatch) {
    try {
      const parsed = JSON.parse(additionalsMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        additionals = parsed.map(a => ({
          ...a,
          budget_usd: Number(a.budget_usd || 0)
        }));
      }
    } catch (e) {
      console.warn('Error parsing PP_UNIFIED_ADDITIONALS tag:', e);
    }
  }

  // 2. Revisar si hay etiqueta de Presupuesto Original: <!-- PP_ORIGINAL_BUDGET: 1234.56 -->
  const origBudgetMatch = desc.match(/<!--\s*PP_ORIGINAL_BUDGET:\s*([\d\.]+)\s*-->/);
  if (origBudgetMatch) {
    const val = parseFloat(origBudgetMatch[1]);
    if (!isNaN(val)) {
      originalBudget = val;
    }
  }

  // 3. Revisar si hay etiqueta de Proyecto Padre: <!-- PP_PARENT_PROJECT: {...} -->
  const parentMatch = desc.match(/<!--\s*PP_PARENT_PROJECT:\s*(\{[\s\S]*?\})\s*-->/);
  if (parentMatch) {
    try {
      parentProject = JSON.parse(parentMatch[1]);
      isAdditional = true;
    } catch (e) {
      console.warn('Error parsing PP_PARENT_PROJECT tag:', e);
    }
  }

  // 4. Revisar columna parent_project_id si existe
  if (project.parent_project_id) {
    isAdditional = true;
    if (!parentProject) {
      const parent = allProjects.find(p => p.id === project.parent_project_id);
      if (parent) {
        parentProject = {
          id: parent.id,
          proposal_number: parent.proposal_number,
          title: parent.title,
          budget_usd: Number(parent.budget_usd || 0)
        };
      } else {
        parentProject = {
          id: project.parent_project_id,
          title: 'Proyecto Original',
          proposal_number: 'S/N'
        };
      }
    }
  }

  // 5. Fallback para proyectos unificados previamente con textos clásicos:
  // e.g. "--- [UNIFICACIÓN CON PROPUESTA 102] ---" o "PROYECTO ADICIONAL VINCULADO: #102"
  if (additionals.length === 0 && !isAdditional) {
    const legacyMergeMatch = desc.match(/---\s*\[UNIFICACI[OÓ]N CON PROPUESTA\s*(?:#?\s*([A-Za-z0-9\-_]+))?\]\s*---/i)
      || desc.match(/ALCANCE DE TRABAJO ADICIONAL VINCULADO[\s\S]*?Propuesta\s*(?:Nº|N°)?\s*#?([A-Za-z0-9\-_]+)/i);

    if (legacyMergeMatch) {
      const secondaryProposalNum = legacyMergeMatch[1] || '';
      const matchedSecondary = allProjects.find(p => 
        String(p.proposal_number) === String(secondaryProposalNum) && p.id !== project.id
      );

      // Intentar extraer el título y presupuesto del trabajo adicional directamente del texto
      let secondaryTitle = '';
      let secondaryBudget = 0;

      const splitSections = desc.split(/---\s*\[UNIFICACI[OÓ]N CON PROPUESTA\s*(?:#?\s*[A-Za-z0-9\-_]+)?\]\s*---/i);
      if (splitSections.length > 1) {
        const secondarySection = splitSections[1];
        const titleMatch = secondarySection.match(/Proyecto:\s*([^\n\r]+)/i)
          || secondarySection.match(/Propuesta\s*(?:Nº|N°)?\s*#?[A-Za-z0-9\-_]+:\*?\*?\s*([^\n\r]+)/i);
        if (titleMatch) {
          secondaryTitle = titleMatch[1].trim();
        }

        const budgetMatch = secondarySection.match(/INVERSI[OÓ]N TOTAL:\s*\$?([0-9\.,]+)/i)
          || secondarySection.match(/Presupuesto(?:[\s\S]*?):\s*\$?([0-9\.,]+)/i);
        if (budgetMatch) {
          const raw = budgetMatch[1].replace(/\./g, '').replace(',', '.');
          secondaryBudget = parseFloat(raw) || 0;
        }

        // Si la sección base tiene su propio monto:
        if (originalBudget === null) {
          const baseMatch = splitSections[0].match(/INVERSI[OÓ]N TOTAL:\s*\$?([0-9\.,]+)/i);
          if (baseMatch) {
            const rawBase = baseMatch[1].replace(/\./g, '').replace(',', '.');
            originalBudget = parseFloat(rawBase) || null;
          }
        }
      }

      if (matchedSecondary) {
        additionals.push({
          id: matchedSecondary.id,
          proposal_number: matchedSecondary.proposal_number,
          title: matchedSecondary.title || secondaryTitle,
          budget_usd: Number(matchedSecondary.budget_usd || secondaryBudget || 0)
        });
      } else {
        additionals.push({
          id: `legacy-${secondaryProposalNum}`,
          proposal_number: secondaryProposalNum || 'Adicional',
          title: secondaryTitle || `Trabajo Adicional (${secondaryProposalNum ? `Propuesta #${secondaryProposalNum}` : 'Unificada'})`,
          budget_usd: secondaryBudget
        });
      }
    }
  }

  // 6. Revisar si otros proyectos en la lista apuntan a este como parent
  if (allProjects.length > 0) {
    const childAdditionals = allProjects.filter(p => 
      p.id !== project.id && (p.parent_project_id === project.id || (p.is_additional && p.parent_id === project.id))
    );
    childAdditionals.forEach(ca => {
      if (!additionals.some(a => a.id === ca.id)) {
        additionals.push({
          id: ca.id,
          proposal_number: ca.proposal_number,
          title: ca.title,
          budget_usd: Number(ca.budget_usd || 0),
          merged_at: ca.created_at
        });
      }
    });
  }

  const totalAdditionalsBudget = additionals.reduce((sum, a) => sum + (Number(a.budget_usd) || 0), 0);
  const isOriginalWithAdditionals = additionals.length > 0;

  let calculatedOriginalBudget = originalBudget !== null 
    ? originalBudget 
    : (isOriginalWithAdditionals && totalAdditionalsBudget > 0 ? Math.max(0, currentBudget - totalAdditionalsBudget) : currentBudget);

  // Si originalBudget no fue explícito y sumaron budgets exactamente:
  if (originalBudget === null && isOriginalWithAdditionals && totalAdditionalsBudget >= currentBudget) {
    calculatedOriginalBudget = currentBudget;
  }

  const combinedTotalBudget = isOriginalWithAdditionals 
    ? (originalBudget !== null ? originalBudget + totalAdditionalsBudget : currentBudget)
    : currentBudget;

  return {
    isOriginalWithAdditionals,
    isAdditional,
    parentProject,
    originalBudgetUsd: calculatedOriginalBudget,
    additionals,
    totalAdditionalsBudget,
    combinedTotalBudget
  };
}

/**
 * Genera la descripción enriquecida del proyecto original unificado con uno o más adicionales.
 */
export function buildUnifiedProjectDescription(
  originalProject: any,
  additionalProjects: any[],
  originalBaseBudget?: number
): string {
  const baseDesc = (originalProject.description || '').trim();
  const baseBudget = originalBaseBudget !== undefined ? originalBaseBudget : Number(originalProject.budget_usd || 0);

  // Evitar duplicar etiquetas anteriores si ya existían
  const cleanBaseDesc = baseDesc
    .replace(/<!--\s*PP_UNIFIED_ADDITIONALS:[\s\S]*?-->/g, '')
    .replace(/<!--\s*PP_ORIGINAL_BUDGET:[\s\S]*?-->/g, '')
    .trim();

  // Lista de adicionales
  const additionalsData: UnifiedAdditional[] = additionalProjects.map(ap => ({
    id: ap.id,
    proposal_number: ap.proposal_number,
    title: ap.title,
    budget_usd: Number(ap.budget_usd || 0),
    merged_at: new Date().toISOString()
  }));

  const additionalsJson = JSON.stringify(additionalsData);
  const metadataComments = `<!-- PP_UNIFIED_ADDITIONALS: ${additionalsJson} -->\n<!-- PP_ORIGINAL_BUDGET: ${baseBudget} -->\n\n`;

  let unifiedSections = '';
  for (const ap of additionalProjects) {
    const apNum = ap.proposal_number ? `#${ap.proposal_number}` : 'S/N';
    const apBudget = Number(ap.budget_usd || 0);
    const apCleanDesc = (ap.description || '').replace(/<!--[\s\S]*?-->/g, '').trim();

    unifiedSections += `\n\n══════════════════════════════════════════════════════════════════\n` +
      `### ALCANCE DE TRABAJO ADICIONAL VINCULADO\n` +
      `**Propuesta Adicional Nº ${apNum}:** ${ap.title}\n` +
      `**Presupuesto Adicional Aprobado:** $${formatCurrency(apBudget)} USD\n` +
      `══════════════════════════════════════════════════════════════════\n\n` +
      `${apCleanDesc}`;
  }

  return `${metadataComments}${cleanBaseDesc}${unifiedSections}`.trim();
}

/**
 * Ejecuta la unificación completa entre un Proyecto Original y uno o más Proyectos Adicionales:
 * 1. Calcula presupuesto total combinado.
 * 2. Transfiere registros contables (pagos, costos, extras, compromisos, anticipos).
 * 3. Migra y vincula tareas de seguimiento (project_tasks) al proyecto original etiquetando la fase.
 * 4. Actualiza descripción y metadatos del proyecto original.
 * 5. Marca los proyectos adicionales como vinculados (status: 'merged_additional', parent_project_id).
 */
export async function executeProjectUnification({
  targetProjectId,
  sourceProjectIds,
  projectsList,
  onProgress
}: {
  targetProjectId: string;
  sourceProjectIds: string[];
  projectsList: any[];
  onProgress?: (msg: string) => void;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const targetProject = projectsList.find(p => p.id === targetProjectId);
    if (!targetProject) throw new Error('No se encontró el proyecto principal seleccionado.');

    const sourceProjects = sourceProjectIds.map(id => projectsList.find(p => p.id === id)).filter(Boolean);
    if (sourceProjects.length === 0) throw new Error('No se seleccionaron proyectos adicionales válidos.');

    onProgress?.('Preparando unificación y cálculo de presupuesto...');

    // Presupuesto base del original
    const targetRelation = parseProjectRelation(targetProject, projectsList);
    const originalBaseBudget = targetRelation.originalBudgetUsd;

    // Presupuesto total combinado
    const additionalBudgetsTotal = sourceProjects.reduce((sum, sp) => sum + Number(sp.budget_usd || 0), 0);
    const newCombinedBudget = originalBaseBudget + targetRelation.totalAdditionalsBudget + additionalBudgetsTotal;

    // Construir nueva descripción unificada
    const allAdditionals = [...targetRelation.additionals, ...sourceProjects.map(sp => ({
      id: sp.id,
      proposal_number: sp.proposal_number,
      title: sp.title,
      budget_usd: Number(sp.budget_usd || 0),
      description: sp.description,
      merged_at: new Date().toISOString()
    }))];

    const newDescription = buildUnifiedProjectDescription(targetProject, allAdditionals, originalBaseBudget);

    onProgress?.('Transfiriendo registros financieros...');

    // 1. Transferir registros contables
    for (const source of sourceProjects) {
      await supabase.from('project_payments').update({ project_id: targetProjectId }).eq('project_id', source.id);
      await supabase.from('project_costs').update({ project_id: targetProjectId }).eq('project_id', source.id);
      await supabase.from('project_extras').update({ project_id: targetProjectId }).eq('project_id', source.id);
      await supabase.from('project_commitments').update({ project_id: targetProjectId }).eq('project_id', source.id);
      await supabase.from('partner_advances').update({ project_id: targetProjectId }).eq('project_id', source.id);
      await supabase.from('payable_accounts').update({ project_id: targetProjectId }).eq('project_id', source.id);
    }

    onProgress?.('Migrando partidas de seguimiento al proyecto original...');

    // 2. Migrar tareas de seguimiento (project_tasks) para que el informe de obra las unifique
    for (const source of sourceProjects) {
      const { data: sourceTasks } = await supabase
        .from('project_tasks')
        .select('*')
        .eq('project_id', source.id);

      if (sourceTasks && sourceTasks.length > 0) {
        const prefix = `[Adicional #${source.proposal_number || 'S/N'}] `;
        const tasksToInsert = sourceTasks.map((st: any, idx: number) => ({
          project_id: targetProjectId,
          title: st.title,
          phase: st.phase ? `${prefix}${st.phase}` : `${prefix}General`,
          completed: st.completed || false,
          completed_at: st.completed_at || null,
          due_date: st.due_date || null,
          notes: st.notes || null,
          sort_order: 1000 + idx
        }));

        await supabase.from('project_tasks').insert(tasksToInsert);
      }
    }

    onProgress?.('Actualizando proyecto principal...');

    // 3. Actualizar el proyecto destino
    const updateTargetPayload: any = {
      budget_usd: newCombinedBudget,
      description: newDescription
    };

    // Intentar actualizar parent_project_id = null e is_additional = false si existen columnas
    try {
      updateTargetPayload.is_additional = false;
      updateTargetPayload.parent_project_id = null;
    } catch {
      // Ignorar si no soporta
    }

    const { error: targetUpdateErr } = await supabase
      .from('projects')
      .update(updateTargetPayload)
      .eq('id', targetProjectId);

    if (targetUpdateErr) {
      // Si falló por columnas desconocidas, reintentar solo con campos básicos
      const basicPayload = { budget_usd: newCombinedBudget, description: newDescription };
      const { error: retryErr } = await supabase.from('projects').update(basicPayload).eq('id', targetProjectId);
      if (retryErr) throw retryErr;
    }

    onProgress?.('Vinculando proyectos adicionales...');

    // 4. Actualizar proyectos secundarios (marcar como merged_additional)
    for (const source of sourceProjects) {
      const sourceParentTag = `<!-- PP_PARENT_PROJECT: ${JSON.stringify({
        id: targetProject.id,
        proposal_number: targetProject.proposal_number,
        title: targetProject.title
      })} -->\n\n`;

      const updatedSourceDesc = `${sourceParentTag}${source.description || ''}`;

      const updateSourcePayload: any = {
        status: 'merged_additional',
        archived_at: new Date().toISOString(),
        description: updatedSourceDesc
      };

      try {
        updateSourcePayload.parent_project_id = targetProjectId;
        updateSourcePayload.is_additional = true;
      } catch {
        // Ignorar
      }

      const { error: sourceUpdateErr } = await supabase
        .from('projects')
        .update(updateSourcePayload)
        .eq('id', source.id);

      if (sourceUpdateErr) {
        // Reintentar sin columnas opcionales si diera error
        await supabase
          .from('projects')
          .update({
            status: 'merged_additional',
            archived_at: new Date().toISOString(),
            description: updatedSourceDesc
          })
          .eq('id', source.id);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error en executeProjectUnification:', err);
    return { success: false, error: err.message || 'Error desconocido al unificar proyectos' };
  }
}
