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

export interface SystemActivityItem {
  id: string;
  type: 'cost' | 'commitment' | 'payment' | 'advance' | 'pending';
  typeLabel: string;
  description: string;
  amount_usd: number;
  project_title?: string;
  client_name?: string;
  provider_or_partner?: string;
  status?: string;
  created_at: string;
}

export async function getRecentSystemActivity(limit: number = 8): Promise<SystemActivityItem[]> {
  try {
    const [costsRes, commitmentsRes, paymentsRes, advancesRes, pendingRes] = await Promise.allSettled([
      supabaseAdmin
        .from('project_costs')
        .select('id, description, total_usd, quantity, unit_price_usd, provider, created_at, project:projects(title, clients(name))')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from('project_commitments')
        .select('id, description, amount_usd, provider, created_at, project:projects(title, clients(name))')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from('project_payments')
        .select('id, description, amount_usd, reference, created_at, project:projects(title, clients(name))')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from('partner_advances')
        .select('id, description, amount_usd, partner_name, created_at, project:projects(title, clients(name))')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from('telegram_pending_entries')
        .select('id, description, amount_usd, entry_type, status, provider, partner_name, created_at, project:projects(title, clients(name))')
        .order('created_at', { ascending: false })
        .limit(limit)
    ]);

    const items: SystemActivityItem[] = [];

    if (costsRes.status === 'fulfilled' && costsRes.value.data) {
      costsRes.value.data.forEach((c: any) => {
        const amt = c.total_usd ?? (Number(c.quantity || 1) * Number(c.unit_price_usd || 0));
        items.push({
          id: c.id,
          type: 'cost',
          typeLabel: 'Gasto Asentado',
          description: c.description || 'Gasto',
          amount_usd: Number(amt) || 0,
          project_title: c.project?.title || 'Sin Obra',
          client_name: (c.project?.clients as any)?.name || 'Particular',
          provider_or_partner: c.provider || undefined,
          created_at: c.created_at
        });
      });
    }

    if (commitmentsRes.status === 'fulfilled' && commitmentsRes.value.data) {
      commitmentsRes.value.data.forEach((c: any) => {
        items.push({
          id: c.id,
          type: 'commitment',
          typeLabel: 'Compromiso / CxP',
          description: c.description || 'Compromiso',
          amount_usd: Number(c.amount_usd) || 0,
          project_title: c.project?.title || 'Sin Obra',
          client_name: (c.project?.clients as any)?.name || 'Particular',
          provider_or_partner: c.provider || undefined,
          created_at: c.created_at
        });
      });
    }

    if (paymentsRes.status === 'fulfilled' && paymentsRes.value.data) {
      paymentsRes.value.data.forEach((p: any) => {
        items.push({
          id: p.id,
          type: 'payment',
          typeLabel: 'Cobro / Abono Cliente',
          description: p.description || 'Cobro de cliente',
          amount_usd: Number(p.amount_usd) || 0,
          project_title: p.project?.title || 'Sin Obra',
          client_name: (p.project?.clients as any)?.name || 'Particular',
          created_at: p.created_at
        });
      });
    }

    if (advancesRes.status === 'fulfilled' && advancesRes.value.data) {
      advancesRes.value.data.forEach((a: any) => {
        items.push({
          id: a.id,
          type: 'advance',
          typeLabel: 'Retiro de Socio',
          description: a.description || 'Retiro de socio',
          amount_usd: Number(a.amount_usd) || 0,
          project_title: a.project?.title || 'General',
          provider_or_partner: a.partner_name || undefined,
          created_at: a.created_at
        });
      });
    }

    if (pendingRes.status === 'fulfilled' && pendingRes.value.data) {
      pendingRes.value.data.forEach((pe: any) => {
        items.push({
          id: pe.id,
          type: 'pending',
          typeLabel: `Borrador Telegram (${pe.status || 'pendiente'})`,
          description: pe.description || 'Borrador',
          amount_usd: Number(pe.amount_usd) || 0,
          project_title: pe.project?.title || 'Por asignar',
          client_name: (pe.project?.clients as any)?.name || undefined,
          provider_or_partner: pe.provider || pe.partner_name || undefined,
          status: pe.status,
          created_at: pe.created_at
        });
      });
    }

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return items.slice(0, limit);
  } catch (err: any) {
    console.error('Error fetching recent system activity:', err);
    return [];
  }
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
// 2b. INSPECCIÓN FINANCIERA DETALLADA POR OBRA Y BÚSQUEDA DE GASTOS
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectCostItem {
  id: string;
  date: string;
  provider: string;
  description: string;
  category: string;
  quantity: number;
  unit_price_usd: number;
  total_usd: number;
}

export interface ProjectCommitmentItem {
  id: string;
  date: string;
  provider: string;
  description: string;
  category: string;
  amount_usd: number;
}

export interface ProjectPaymentItem {
  id: string;
  date: string;
  amount_usd: number;
  description: string;
  reference?: string;
}

export interface ProjectDetailedFinancials {
  projectId: string;
  title: string;
  clientName: string;
  clientId?: string;
  status: string;
  budgetUsd: number;
  totalCostsUsd: number;
  totalCommitmentsUsd: number;
  totalCollectedUsd: number;
  remainingBalanceUsd: number;
  estimatedProfitUsd: number;
  marginPercentage: number;
  costs: ProjectCostItem[];
  commitments: ProjectCommitmentItem[];
  payments: ProjectPaymentItem[];
  costCategoryTotals: Record<string, number>;
}

export async function getProjectDetailedFinancials(projectId: string): Promise<ProjectDetailedFinancials> {
  const { data: project, error: projErr } = await supabaseAdmin
    .from('projects')
    .select(`
      id,
      title,
      status,
      budget_usd,
      client_id,
      clients (
        id,
        name
      ),
      project_extras (
        amount_usd
      ),
      project_costs (
        id,
        date,
        provider,
        description,
        category,
        quantity,
        unit_price_usd,
        total_usd,
        created_at
      ),
      project_commitments (
        id,
        date,
        provider,
        description,
        category,
        amount_usd,
        created_at
      ),
      project_payments (
        id,
        date,
        amount_usd,
        description,
        reference,
        created_at
      )
    `)
    .eq('id', projectId)
    .single();

  if (projErr || !project) {
    throw new Error(projErr ? projErr.message : `Obra con ID "${projectId}" no encontrada`);
  }

  const baseBudget = Number(project.budget_usd) || 0;
  const extrasTotal = (project.project_extras || []).reduce((sum: number, e: any) => sum + (Number(e.amount_usd) || 0), 0);
  const budgetUsd = baseBudget + extrasTotal;

  const costCategoryTotals: Record<string, number> = {};
  const costs: ProjectCostItem[] = (project.project_costs || []).map((c: any) => {
    const total = c.total_usd !== null && c.total_usd !== undefined ? Number(c.total_usd) : (Number(c.quantity || 1) * Number(c.unit_price_usd || 0));
    const cat = c.category || 'materials';
    costCategoryTotals[cat] = (costCategoryTotals[cat] || 0) + (Number(total) || 0);

    return {
      id: c.id,
      date: c.date || (c.created_at ? c.created_at.split('T')[0] : 'N/A'),
      provider: c.provider || 'Sin Proveedor',
      description: c.description || 'Gasto',
      category: cat,
      quantity: Number(c.quantity) || 1,
      unit_price_usd: Number(c.unit_price_usd) || 0,
      total_usd: Number(total) || 0
    };
  });

  costs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const commitments: ProjectCommitmentItem[] = (project.project_commitments || []).map((com: any) => ({
    id: com.id,
    date: com.date || (com.created_at ? com.created_at.split('T')[0] : 'N/A'),
    provider: com.provider || 'Proveedor',
    description: com.description || 'Compromiso',
    category: com.category || 'materials',
    amount_usd: Number(com.amount_usd) || 0
  }));
  commitments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const payments: ProjectPaymentItem[] = (project.project_payments || []).map((p: any) => ({
    id: p.id,
    date: p.date || (p.created_at ? p.created_at.split('T')[0] : 'N/A'),
    amount_usd: Number(p.amount_usd) || 0,
    description: p.description || 'Cobro de cliente',
    reference: p.reference || undefined
  }));
  payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalCostsUsd = costs.reduce((sum, c) => sum + c.total_usd, 0);
  const totalCommitmentsUsd = commitments.reduce((sum, com) => sum + com.amount_usd, 0);
  const totalCollectedUsd = payments.reduce((sum, p) => sum + p.amount_usd, 0);
  const remainingBalanceUsd = budgetUsd - totalCollectedUsd;
  const estimatedProfitUsd = budgetUsd - totalCostsUsd;
  const marginPercentage = budgetUsd > 0 ? Number(((estimatedProfitUsd / budgetUsd) * 100).toFixed(2)) : 0;

  return {
    projectId: project.id,
    title: project.title,
    clientName: (project.clients as any)?.name || 'Cliente no asignado',
    clientId: project.client_id,
    status: project.status,
    budgetUsd,
    totalCostsUsd,
    totalCommitmentsUsd,
    totalCollectedUsd,
    remainingBalanceUsd,
    estimatedProfitUsd,
    marginPercentage,
    costs,
    commitments,
    payments,
    costCategoryTotals
  };
}

export async function searchDetailedExpenses(filters: {
  projectId?: string;
  clientName?: string;
  category?: string;
  query?: string;
  provider?: string;
  limit?: number;
}): Promise<any[]> {
  let query = supabaseAdmin
    .from('project_costs')
    .select(`
      id,
      date,
      provider,
      description,
      category,
      quantity,
      unit_price_usd,
      total_usd,
      created_at,
      project:projects (
        id,
        title,
        status,
        clients (
          id,
          name
        )
      )
    `)
    .order('created_at', { ascending: false });

  if (filters.projectId) {
    query = query.eq('project_id', filters.projectId);
  }
  if (filters.category) {
    query = query.eq('category', filters.category);
  }
  if (filters.provider) {
    query = query.ilike('provider', `%${filters.provider}%`);
  }
  if (filters.query) {
    query = query.or(`description.ilike.%${filters.query}%,provider.ilike.%${filters.query}%`);
  }

  const { data, error } = await query.limit(filters.limit || 20);
  if (error) throw new Error(`Error en búsqueda de gastos: ${error.message}`);

  let results = (data || []).map((c: any) => {
    const total = c.total_usd !== null && c.total_usd !== undefined ? Number(c.total_usd) : (Number(c.quantity || 1) * Number(c.unit_price_usd || 0));
    return {
      id: c.id,
      date: c.date || (c.created_at ? c.created_at.split('T')[0] : 'N/A'),
      provider: c.provider || 'Sin Proveedor',
      description: c.description || 'Gasto',
      category: c.category || 'materials',
      quantity: Number(c.quantity) || 1,
      unit_price_usd: Number(c.unit_price_usd) || 0,
      total_usd: Number(total) || 0,
      project_id: c.project?.id,
      project_title: c.project?.title || 'Sin Obra',
      client_name: (c.project?.clients as any)?.name || 'Particular'
    };
  });

  if (filters.clientName) {
    const clientTerm = filters.clientName.toLowerCase();
    results = results.filter(r => r.client_name.toLowerCase().includes(clientTerm));
  }

  return results;
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

  const fallbackModels = [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.7-flash',
    'gemini-flash-lite-latest'
  ];
  let lastErr: any;

  for (const modelName of fallbackModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const res = await model.generateContent(prompt);
        return res.response.text();
      } catch (err: any) {
        lastErr = err;
        const msg = err?.message || String(err);
        if ((msg.includes('503') || msg.includes('429')) && attempt === 0) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        break;
      }
    }
  }

  throw lastErr || new Error('No se pudo generar la propuesta técnica con ningún modelo de Gemini.');
}
