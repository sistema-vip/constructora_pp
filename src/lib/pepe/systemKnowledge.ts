import { supabaseAdmin } from '@/lib/supabase-admin';

// In-memory cache to avoid repeated DB roundtrips on rapid chat messages
let cachedKnowledge: string | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 20_000; // 20 segundos de caché en memoria

export async function getPepeSystemKnowledge(forceRefresh: boolean = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedKnowledge && (now - lastCacheTime < CACHE_TTL_MS)) {
    return cachedKnowledge;
  }

  try {
    const [clientsRes, projectsRes, paymentsRes, costsRes, extrasRes, payablesRes, materialsRes] = await Promise.all([
      supabaseAdmin.from('clients').select('id, name, company_name, phone, email, address, notes').order('name'),
      supabaseAdmin.from('projects').select('id, proposal_number, title, status, budget_usd, client_id, description, progress_pct, is_additional').order('proposal_number', { ascending: false }),
      supabaseAdmin.from('project_payments').select('project_id, amount_usd, reference, description, date'),
      supabaseAdmin.from('project_costs').select('project_id, total_usd, unit_price_usd, quantity, description, provider, category'),
      supabaseAdmin.from('project_extras').select('project_id, description, amount_usd'),
      supabaseAdmin.from('payable_accounts').select('name, type, total_amount_usd, status, description, project_id'),
      supabaseAdmin.from('materials').select('name, unit, price_usd')
    ]);

    const clients = clientsRes.data || [];
    const projects = projectsRes.data || [];
    const payments = paymentsRes.data || [];
    const costs = costsRes.data || [];
    const extras = extrasRes.data || [];
    const payables = payablesRes.data || [];
    const materials = materialsRes.data || [];

    // Map financial numbers per project
    const projectMap: Record<string, any> = {};
    for (const p of projects) {
      projectMap[p.id] = {
        ...p,
        extrasTotal: 0,
        collected: 0,
        spent: 0,
        extrasList: [] as { desc: string; amt: number }[]
      };
    }

    for (const e of extras) {
      if (projectMap[e.project_id]) {
        const amt = Number(e.amount_usd) || 0;
        projectMap[e.project_id].extrasTotal += amt;
        projectMap[e.project_id].extrasList.push({ desc: e.description, amt });
      }
    }

    for (const pay of payments) {
      if (projectMap[pay.project_id]) {
        projectMap[pay.project_id].collected += Number(pay.amount_usd) || 0;
      }
    }

    for (const c of costs) {
      if (projectMap[c.project_id]) {
        const amt = c.total_usd != null ? Number(c.total_usd) : (Number(c.quantity || 1) * Number(c.unit_price_usd || 0));
        projectMap[c.project_id].spent += amt;
      }
    }

    // Totales globales
    let totalProjectsActive = 0;
    let totalProjectsProposal = 0;
    let totalReceivable = 0;
    let totalPayable = 0;

    for (const p of Object.values(projectMap)) {
      const b = (Number(p.budget_usd) || 0) + p.extrasTotal;
      const pend = Math.max(0, b - p.collected);
      if (p.status === 'in_progress') {
        totalProjectsActive++;
        totalReceivable += pend;
      } else if (p.status === 'proposal') {
        totalProjectsProposal++;
      }
    }

    const activePayables = payables.filter(pa => pa.status === 'active');
    for (const pa of activePayables) {
      totalPayable += Number(pa.total_amount_usd) || 0;
    }

    const fechaHoy = new Date().toLocaleDateString('es-VE', {
      timeZone: 'America/Caracas',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let k = `=== RECONOCIMIENTO GLOBAL DEL SISTEMA P&P CONSTRUYE ===\n`;
    k += `Fecha del sistema: ${fechaHoy} (Zona Horaria: Venezuela)\n\n`;

    k += `RESUMEN GENERAL DE LA EMPRESA:\n`;
    k += `- Obras activas en ejecución: ${totalProjectsActive}\n`;
    k += `- Propuestas pendientes de aprobación: ${totalProjectsProposal}\n`;
    k += `- Total por cobrar en obras activas: $${totalReceivable.toFixed(2)}\n`;
    k += `- Total cuentas por pagar a proveedores/obreros: $${totalPayable.toFixed(2)}\n\n`;

    k += `DIRECTORIO DE ALIAS Y CLIENTES HABITUALES (MUY IMPORTANTE):\n`;
    k += `- "Suli", "Sulim", "Zully" o "TH-25" / "TH-26" = Se refiere SIEMPRE a la clienta ZULLY MARRERO (Townhouse 25 / 26 en Urb. Villas de la Lagunita). Tiene 4 obras activas y 6 propuestas.\n`;
    k += `- "Jesús", "Irausquin" = Se refiere a JESUS IRAUSQUIN.\n`;
    k += `- "Wilson", "TH-69" = Se refiere a WILSON GONZALEZ.\n`;
    k += `- "Agustino" = AGUSTINO FRUGGEIRO.\n`;
    k += `- "Angel", "Funtes" = ANGEL FUNTES.\n`;
    k += `- "Rafael", "Sibila" = RAFAEL SIBILA.\n\n`;

    k += `DIRECTORIO COMPLETO DE CLIENTES Y SUS OBRAS:\n`;
    for (const c of clients) {
      const pList = Object.values(projectMap).filter(p => p.client_id === c.id);
      const inProg = pList.filter(p => p.status === 'in_progress');
      const props = pList.filter(p => p.status === 'proposal');
      const comps = pList.filter(p => p.status === 'completed');

      let clientReceivable = 0;
      for (const p of inProg) {
        const b = (Number(p.budget_usd) || 0) + p.extrasTotal;
        clientReceivable += Math.max(0, b - p.collected);
      }

      k += `\n👤 CLIENTE: ${c.name}${c.company_name ? ' (' + c.company_name + ')' : ''}\n`;
      if (c.address) k += `   Ubicación / Propiedad: ${c.address}\n`;
      if (c.phone) k += `   Teléfono: ${c.phone}\n`;
      k += `   Resumen: ${pList.length} obras registradas (${inProg.length} activas en ejecución, ${props.length} en propuesta, ${comps.length} completadas)\n`;
      k += `   Saldo total pendiente por cobrar en obras activas: $${clientReceivable.toFixed(2)}\n`;

      if (pList.length === 0) {
        k += `   (Sin obras registradas aún)\n`;
      } else {
        for (const p of pList) {
          const totalBudget = (Number(p.budget_usd) || 0) + p.extrasTotal;
          const pending = totalBudget - p.collected;
          let statusText = '⚪ OTRO';
          if (p.status === 'in_progress') statusText = '🟢 ACTIVA (EN PROGRESO)';
          else if (p.status === 'proposal') statusText = '🟡 EN PROPUESTA / EVALUACIÓN';
          else if (p.status === 'completed') statusText = '🔵 COMPLETADA / ENTREGADA';
          else if (p.status === 'cancelled') statusText = '🔴 CANCELADA';

          k += `   • ${p.proposal_number ? '#' + p.proposal_number + ': ' : ''}"${p.title}"\n`;
          k += `     - Estado: ${statusText}\n`;
          k += `     - Presupuesto Total: $${totalBudget.toFixed(2)} | Cobrado: $${p.collected.toFixed(2)} | Saldo por Cobrar: $${pending.toFixed(2)} | Gastos Obra: $${p.spent.toFixed(2)}\n`;
          
          if (p.extrasList.length > 0) {
            k += `     - Partidas Adicionales Aprobadas (${p.extrasList.length}):\n`;
            for (const ex of p.extrasList) {
              k += `       * ${ex.desc}: $${ex.amt.toFixed(2)}\n`;
            }
          }
        }
      }
    }

    // Obras sin cliente asignado
    const unassigned = Object.values(projectMap).filter(p => !p.client_id);
    if (unassigned.length > 0) {
      k += `\n📁 OBRAS SIN CLIENTE ASIGNADO DIRECTAMENTE:\n`;
      for (const p of unassigned) {
        const totalBudget = (Number(p.budget_usd) || 0) + p.extrasTotal;
        k += `   • ${p.proposal_number ? '#' + p.proposal_number + ': ' : ''}"${p.title}" (Estado: ${p.status}, Presupuesto: $${totalBudget.toFixed(2)})\n`;
      }
    }

    // Cuentas por pagar
    k += `\n💳 CUENTAS POR PAGAR ACTIVAS (COMPROMISOS CON PROVEEDORES Y OBREROS):\n`;
    if (activePayables.length === 0) {
      k += `   No hay cuentas por pagar activas.\n`;
    } else {
      for (const pa of activePayables) {
        k += `   • ${pa.name} (${pa.type || 'proveedor'}): $${(Number(pa.total_amount_usd) || 0).toFixed(2)} - Concepto: ${pa.description || 'Sin detalle'}\n`;
      }
    }

    // Materiales
    if (materials.length > 0) {
      k += `\n🧱 CATÁLOGO DE MATERIALES DE REFERENCIA:\n`;
      for (const m of materials) {
        k += `   • ${m.name} (${m.unit || 'unidad'}): $${(Number(m.price_usd) || 0).toFixed(2)}\n`;
      }
    }

    k += `\nINSTRUCCIONES CLAVE DE RESPUESTA PARA PEPE:
1. Conoces y manejas de memoria toda esta información en tiempo real. Cuando el usuario te pregunte por cualquier cliente, proyecto, saldo, deuda o material, responde de inmediato con los datos exactos del sistema.
2. Si el usuario te pregunta por "Suli", "Sulim" o "Zully", sabes que es la clienta ZULLY MARRERO (TH-25).
3. Si te preguntan por "los proyectos activos de Suli", lista sus 4 obras activas en progreso con su número de propuesta, título y monto exacto.
4. Si te preguntan por deudas o cobros, calcula con exactitud las sumas o saldos individuales usando los datos de arriba.
5. Mantén tus respuestas claras, amables, profesionales, sin rodeos y adaptadas a la construcción en Venezuela.
==================================================\n`;

    cachedKnowledge = k;
    lastCacheTime = now;
    return k;
  } catch (err: any) {
    console.error('Error generando conocimiento del sistema para Pepe:', err);
    return cachedKnowledge || '=== ASISTENTE TÉCNICO P&P CONSTRUYE ===\n';
  }
}
