import { supabaseAdmin } from './supabase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// ─────────────────────────────────────────────────────────────────────────────
// 1. CONSULTAS DE KPIS Y FINANZAS
// ─────────────────────────────────────────────────────────────────────────────

export async function getSystemKpis(projectId?: string): Promise<any> {
  if (projectId) {
    const { data: project, error: projErr } = await supabaseAdmin
      .from('projects')
      .select('id, title, status, budget_usd, client_id, clients(name), project_payments(amount_usd), project_costs(total_usd, quantity, unit_price_usd), project_extras(amount_usd)')
      .eq('id', projectId)
      .single();

    if (projErr || !project) {
      throw new Error(projErr ? projErr.message : `Proyecto con ID "${projectId}" no encontrado`);
    }

    const baseBudget = Number(project.budget_usd) || 0;
    const extrasTotal = (project.project_extras || []).reduce((sum: number, e: any) => sum + (Number(e.amount_usd) || 0), 0);
    const budgetUsd = baseBudget + extrasTotal;

    const totalCollectedUsd = (project.project_payments || []).reduce((sum: number, p: any) => sum + (Number(p.amount_usd) || 0), 0);
    const totalSpentUsd = (project.project_costs || []).reduce((sum: number, c: any) => {
      const lineTotal = c.total_usd !== null && c.total_usd !== undefined ? Number(c.total_usd) : (Number(c.quantity || 1) * Number(c.unit_price_usd || 0));
      return sum + (lineTotal || 0);
    }, 0);

    const remainingBalanceUsd = budgetUsd - totalCollectedUsd;
    const marginPercentage = budgetUsd > 0 ? Number((((budgetUsd - totalSpentUsd) / budgetUsd) * 100).toFixed(2)) : 0;

    return {
      project_id: project.id,
      title: project.title,
      client_name: (project.clients as any)?.name || 'Cliente no asignado',
      budget_usd: budgetUsd,
      total_collected_usd: totalCollectedUsd,
      total_spent_usd: totalSpentUsd,
      remaining_balance_usd: remainingBalanceUsd,
      margin_percentage: marginPercentage,
      status: project.status
    };
  }

  // Global KPIs
  const [paymentsRes, costsRes, projectsRes, pendingRes] = await Promise.all([
    supabaseAdmin.from('project_payments').select('amount_usd'),
    supabaseAdmin.from('project_costs').select('total_usd, quantity, unit_price_usd'),
    supabaseAdmin.from('projects').select('id, status'),
    supabaseAdmin.from('telegram_pending_entries').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  ]);

  if (paymentsRes.error) throw new Error(`Error en pagos: ${paymentsRes.error.message}`);
  if (costsRes.error) throw new Error(`Error en costos: ${costsRes.error.message}`);
  if (projectsRes.error) throw new Error(`Error en proyectos: ${projectsRes.error.message}`);

  const totalIncomeUsd = (paymentsRes.data || []).reduce((sum: number, p: any) => sum + (Number(p.amount_usd) || 0), 0);
  const totalCostsUsd = (costsRes.data || []).reduce((sum: number, c: any) => {
    const lineTotal = c.total_usd !== null && c.total_usd !== undefined ? Number(c.total_usd) : (Number(c.quantity || 1) * Number(c.unit_price_usd || 0));
    return sum + (lineTotal || 0);
  }, 0);
  const remainingBalanceUsd = totalIncomeUsd - totalCostsUsd;
  const activeProjectsCount = (projectsRes.data || []).filter((p: any) => p.status === 'in_progress').length;
  const pendingDraftsCount = pendingRes.count || 0;

  return {
    total_income_usd: totalIncomeUsd,
    total_costs_usd: totalCostsUsd,
    remaining_balance_usd: remainingBalanceUsd,
    active_projects_count: activeProjectsCount,
    pending_drafts_count: pendingDraftsCount
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CONSULTAS DE LISTADOS (ENTITIES)
// ─────────────────────────────────────────────────────────────────────────────

export async function listCoreEntities(entityType: string): Promise<any[]> {
  if (entityType === 'clients') {
    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('id, name, company_name, email, phone')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message);
    return data || [];
  }

  if (entityType === 'projects') {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('id, title, description, budget_usd, status, client_id, created_at, clients(name), project_payments(amount_usd), project_costs(total_usd, quantity, unit_price_usd), project_extras(amount_usd)')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message);

    return (data || []).map((row: any) => {
      const baseBudget = Number(row.budget_usd) || 0;
      const extrasTotal = (row.project_extras || []).reduce((sum: number, e: any) => sum + (Number(e.amount_usd) || 0), 0);
      const totalBudget = baseBudget + extrasTotal;

      const totalCollected = (row.project_payments || []).reduce((sum: number, p: any) => sum + (Number(p.amount_usd) || 0), 0);
      const totalSpent = (row.project_costs || []).reduce((sum: number, c: any) => {
        const lineTotal = c.total_usd !== null && c.total_usd !== undefined ? Number(c.total_usd) : (Number(c.quantity || 1) * Number(c.unit_price_usd || 0));
        return sum + (lineTotal || 0);
      }, 0);

      return {
        id: row.id,
        title: row.title,
        description: row.description || '',
        budget_usd: totalBudget,
        currency: 'USD',
        status: row.status,
        client_id: row.client_id,
        client_name: row.clients?.name || 'Cliente no asignado',
        total_collected_usd: totalCollected,
        total_spent_usd: totalSpent
      };
    });
  }

  if (entityType === 'payables') {
    const { data, error } = await supabaseAdmin
      .from('payable_accounts')
      .select('id, name, description, total_amount_usd, status, created_at, project:projects(title)')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message);

    return (data || []).map((row: any) => ({
      id: row.id,
      supplier_name: row.name || 'Sin Proveedor',
      description: row.description || '',
      amount: Number(row.total_amount_usd) || 0,
      currency: 'USD',
      due_date: row.created_at ? row.created_at.split('T')[0] : null,
      status: row.status || 'active',
      project_title: row.project?.title || 'Sin Proyecto'
    }));
  }

  throw new Error(`Tipo de entidad inválido: "${entityType}". Válidos: 'clients', 'projects', 'payables'.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CREACIÓN Y ASENTAMIENTO DIRECTO (CREATE RECORD)
// ─────────────────────────────────────────────────────────────────────────────

export async function createRecord(args: any): Promise<any> {
  const isVes = args.currency === 'VES';
  const amountNum = Math.abs(Number(args.amount) || 0);
  const mode = (args.mode || 'direct').toLowerCase();
  const entryType = args.entry_type || 'cost';
  const description = args.description || '';
  const projectId = args.project_id || null;
  const provider = args.provider || '';
  const category = args.category || 'materials';
  const partnerName = args.partner_name || 'Socio';
  const recordDate = args.date || new Date().toISOString().split('T')[0];

  // ── CLIENT ──
  if (entryType === 'client') {
    const clientName = args.client_name || args.name || description;
    if (!clientName) throw new Error('Se requiere el nombre del cliente (client_name).');

    const { data: newClient, error: clientErr } = await supabaseAdmin
      .from('clients')
      .insert({
        id: crypto.randomUUID(),
        name: clientName,
        company_name: args.company_name || '',
        email: args.email || '',
        phone: args.phone || '',
        address: args.address || ''
      })
      .select('id, name')
      .single();

    if (clientErr) throw new Error(`Error al crear cliente: ${clientErr.message}`);

    return {
      success: true,
      entity: 'client',
      message: `✅ Cliente "${newClient.name}" registrado exitosamente con ID: ${newClient.id}`,
      recordId: newClient.id
    };
  }

  // ── PROJECT / PROPUESTA ──
  if (entryType === 'project') {
    const title = args.title || description || 'Nueva Obra';
    const { data: newProj, error: projErr } = await supabaseAdmin
      .from('projects')
      .insert({
        title,
        description: description || title,
        budget_usd: isVes ? 0 : amountNum,
        client_id: args.client_id || null,
        status: args.status || 'proposal'
      })
      .select('id, title, status, budget_usd')
      .single();

    if (projErr) throw new Error(`Error al crear proyecto: ${projErr.message}`);

    return {
      success: true,
      entity: 'project',
      message: `✅ Obra/Propuesta "${newProj.title}" creada exitosamente con estatus "${newProj.status}" y presupuesto $${newProj.budget_usd}.`,
      recordId: newProj.id
    };
  }

  // ── ABONO A CUENTA POR PAGAR (PAYABLE PAYMENT) ──
  if (entryType === 'payable_payment') {
    const payableId = args.payable_account_id || args.recordId;
    if (!payableId) throw new Error('Se requiere el ID de la cuenta por pagar (payable_account_id).');

    const { data: newPayablePay, error: pErr } = await supabaseAdmin
      .from('payable_payments')
      .insert({
        payable_account_id: payableId,
        amount_usd: isVes ? 0 : amountNum,
        description: description || 'Abono registrado vía IA',
        reference: args.reference || 'Transferencia',
        date: recordDate
      })
      .select('id')
      .single();

    if (pErr) throw new Error(`Error al registrar pago a proveedor: ${pErr.message}`);

    return {
      success: true,
      entity: 'payable_payment',
      message: `✅ Abono de $${amountNum.toFixed(2)} registrado exitosamente en Cuentas por Pagar.`,
      recordId: newPayablePay.id,
      payableAccountId: payableId
    };
  }

  // ── MODO BORRADOR (DRAFT) ──
  if (mode === 'draft' || mode === 'pending') {
    const { data, error } = await supabaseAdmin.from('telegram_pending_entries').insert({
      description: description || 'Movimiento sin descripción',
      amount_usd: isVes ? 0 : amountNum,
      entry_type: entryType,
      project_id: projectId,
      category,
      provider,
      partner_name: partnerName,
      date: recordDate,
      status: 'pending',
      telegram_user_name: args.telegram_user_name || 'AI_Agent',
      telegram_chat_id: args.telegram_chat_id || 0,
      raw_message: `Creado vía AI (${mode}): ${description}`,
      ai_parsed_data: {
        original_currency: args.currency || 'USD',
        original_amount: isVes ? args.amount : amountNum
      }
    }).select('id').single();

    if (error) throw new Error(`Error al crear borrador: ${error.message}`);

    return {
      success: true,
      mode: 'draft',
      message: "Borrador creado exitosamente y disponible en la Bandeja de Pendientes para aprobación humana.",
      recordId: data.id,
      projectId: projectId
    };
  }

  // ── MODO DIRECTO: COSTO ──
  if (entryType === 'cost') {
    const { data: newCost, error: costErr } = await supabaseAdmin
      .from('project_costs')
      .insert({
        project_id: projectId,
        description: description || 'Gasto registrado vía IA',
        category,
        quantity: 1,
        unit_price_usd: isVes ? 0 : amountNum,
        total_usd: isVes ? 0 : amountNum,
        provider,
        date: recordDate
      })
      .select('id')
      .single();

    if (costErr) throw new Error(`Error al asentar costo: ${costErr.message}`);

    return {
      success: true,
      mode: 'direct',
      entry_type: 'cost',
      message: `✅ Gasto de ${isVes ? 'Bs ' + amountNum : '$' + amountNum.toFixed(2)} asentado directamente en la obra.`,
      recordId: newCost.id,
      projectId: projectId
    };
  }

  // ── MODO DIRECTO: COMPROMISO (CON SYNC EN CUENTAS POR PAGAR) ──
  if (entryType === 'commitment') {
    const { data: newCommitment, error: comErr } = await supabaseAdmin
      .from('project_commitments')
      .insert({
        project_id: projectId,
        description: description || 'Compromiso registrado vía IA',
        amount_usd: isVes ? 0 : amountNum,
        unit_price_usd: isVes ? 0 : amountNum,
        quantity: 1,
        provider: provider || 'Proveedor',
        category,
        date: recordDate
      })
      .select('id')
      .single();

    if (comErr) throw new Error(`Error al asentar compromiso: ${comErr.message}`);

    let payableType = 'otro';
    if (category === 'materials') payableType = 'proveedor';
    else if (category === 'labor') payableType = 'obrero';
    else if (category === 'equipment') payableType = 'alquiler';
    else if (category === 'subcontract') payableType = 'subcontratista';

    const { data: newPayable, error: payErr } = await supabaseAdmin
      .from('payable_accounts')
      .insert({
        name: provider || 'Proveedor sin nombre',
        type: payableType,
        total_amount_usd: isVes ? 0 : amountNum,
        project_id: projectId,
        commitment_id: newCommitment.id,
        description: description || 'Compromiso registrado vía IA',
        status: 'active'
      })
      .select('id')
      .single();

    if (payErr) {
      console.error('Error creating payable account:', payErr);
    }

    return {
      success: true,
      mode: 'direct',
      entry_type: 'commitment',
      message: `✅ Compromiso de ${isVes ? 'Bs ' + amountNum : '$' + amountNum.toFixed(2)} registrado y sincronizado en Cuentas por Pagar.`,
      commitmentId: newCommitment.id,
      payableId: newPayable?.id,
      projectId: projectId
    };
  }

  // ── MODO DIRECTO: COBRO DE CLIENTE ──
  if (entryType === 'client_payment') {
    const { data: newPayment, error: payErr } = await supabaseAdmin
      .from('project_payments')
      .insert({
        project_id: projectId,
        amount_usd: isVes ? 0 : amountNum,
        description: description || 'Cobro registrado vía IA',
        reference: args.reference || 'IA Agent',
        date: recordDate
      })
      .select('id')
      .single();

    if (payErr) throw new Error(`Error al asentar pago de cliente: ${payErr.message}`);

    return {
      success: true,
      mode: 'direct',
      entry_type: 'client_payment',
      message: `✅ Cobro de ${isVes ? 'Bs ' + amountNum : '$' + amountNum.toFixed(2)} asentado directamente en la obra.`,
      recordId: newPayment.id,
      projectId: projectId
    };
  }

  // ── MODO DIRECTO: RETIRO DE SOCIO ──
  if (entryType === 'partner_advance') {
    const { data: newAdvance, error: advErr } = await supabaseAdmin
      .from('partner_advances')
      .insert({
        project_id: projectId,
        partner_name: partnerName,
        amount_usd: isVes ? 0 : amountNum,
        description: description || 'Retiro de socio registrado vía IA',
        date: recordDate
      })
      .select('id')
      .single();

    if (advErr) throw new Error(`Error al asentar retiro de socio: ${advErr.message}`);

    return {
      success: true,
      mode: 'direct',
      entry_type: 'partner_advance',
      message: `✅ Retiro/Anticipo de socio (${isVes ? 'Bs ' + amountNum : '$' + amountNum.toFixed(2)}) asentado directamente.`,
      recordId: newAdvance.id,
      projectId: projectId
    };
  }

  throw new Error(`Tipo de movimiento no soportado: "${entryType}".`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ACTUALIZACIÓN (UPDATE RECORD)
// ─────────────────────────────────────────────────────────────────────────────

export async function updateRecord(entityType: string, recordId: string, data: any): Promise<any> {
  if (!recordId) throw new Error('Se requiere el recordId a actualizar.');
  if (!data || typeof data !== 'object') throw new Error('Se requiere el objeto "data".');

  let table = '';
  if (entityType === 'project') table = 'projects';
  else if (entityType === 'client') table = 'clients';
  else if (entityType === 'cost') table = 'project_costs';
  else if (entityType === 'commitment') table = 'project_commitments';
  else if (entityType === 'payable') table = 'payable_accounts';
  else if (entityType === 'client_payment') table = 'project_payments';
  else if (entityType === 'pending_entry') table = 'telegram_pending_entries';
  else throw new Error(`Tipo de entidad a actualizar inválido: "${entityType}".`);

  const { data: updatedRecord, error } = await supabaseAdmin
    .from(table)
    .update(data)
    .eq('id', recordId)
    .select()
    .single();

  if (error) throw new Error(`Error al actualizar ${entityType}: ${error.message}`);

  if (entityType === 'commitment' && (data.amount_usd || data.provider || data.description)) {
    await supabaseAdmin.from('payable_accounts').update({
      name: data.provider,
      total_amount_usd: data.amount_usd,
      description: data.description
    }).eq('commitment_id', recordId);
  }

  return {
    success: true,
    entityType,
    recordId,
    message: `✅ ${entityType.toUpperCase()} actualizado exitosamente.`,
    updated: updatedRecord
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ELIMINACIÓN (DELETE RECORD)
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteRecord(entityType: string, recordId: string): Promise<any> {
  if (!recordId) throw new Error('Se requiere el recordId a eliminar.');

  let table = '';
  if (entityType === 'cost') table = 'project_costs';
  else if (entityType === 'commitment') table = 'project_commitments';
  else if (entityType === 'client_payment') table = 'project_payments';
  else if (entityType === 'partner_advance') table = 'partner_advances';
  else if (entityType === 'client') table = 'clients';
  else if (entityType === 'project') table = 'projects';
  else if (entityType === 'payable') table = 'payable_accounts';
  else if (entityType === 'pending_entry') table = 'telegram_pending_entries';
  else throw new Error(`Tipo de entidad a eliminar inválido: "${entityType}".`);

  if (entityType === 'commitment') {
    await supabaseAdmin.from('payable_accounts').delete().eq('commitment_id', recordId);
  }

  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq('id', recordId);

  if (error) throw new Error(`Error al eliminar ${entityType}: ${error.message}`);

  return {
    success: true,
    entityType,
    recordId,
    message: `✅ Registro de ${entityType.toUpperCase()} (ID: ${recordId}) eliminado permanentemente.`
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. REDACCIÓN Y ANÁLISIS TÉCNICO DE PROPUESTAS
// ─────────────────────────────────────────────────────────────────────────────

export async function generateTechnicalProposal(topic: string, clientName?: string, details?: string): Promise<string> {
  if (!genAI) throw new Error('GEMINI_API_KEY no configurada');

  const prompt = `
Eres el redactor técnico jefe de P&P CONSTRUYE.
Genera una propuesta técnica y económica formal para el siguiente trabajo:
- Tema / Proyecto: ${topic}
- Cliente: ${clientName || 'Por Definir'}
- Detalles / Alcance: ${details || 'Estándar según buenas prácticas de construcción'}

Estructura de salida OBLIGATORIA:
Proyecto: [Nombre descriptivo]
Fecha: [Fecha de hoy]
Para: [Nombre del cliente]

Objetivo del Proyecto
[Descripción técnica y formal del alcance de la obra, 1-2 párrafos]

Fases del Trabajo (Alcance Técnico)
Fase 1: Preparación y replanteo
Fase 2: Ejecución principal
Fase 3: Acabados y entrega

Tiempo de Ejecución y Entrega
[Días hábiles estimados]

Presupuesto de Inversión (A Todo Costo)
[Detalle de materiales, herramientas y mano de obra calificada]
INVERSIÓN TOTAL: $[Monto estimado en USD]

Condiciones de Pago: 60% anticipo / 40% al finalizar.
`;

  const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
  const res = await model.generateContent(prompt);
  return res.response.text();
}
