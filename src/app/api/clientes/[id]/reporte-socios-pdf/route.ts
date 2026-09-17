import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generatePartnerReportHtml, PartnerReportData } from '@/lib/pdf/generatePartnerReportHtml';
import { generatePartnerReportPdfKit } from '@/lib/pdf/generatePartnerReportPdfKit';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await context.params;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');
    const format = searchParams.get('format'); // 'pdf' | 'html'

    if (!clientId) {
      return NextResponse.json({ error: 'ID de cliente requerido' }, { status: 400 });
    }

    // 1. Obtener datos del cliente
    const { data: client, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (clientErr || !client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // 2. Obtener proyectos y sus detalles relacionados
    const { data: projects, error: projectsErr } = await supabaseAdmin
      .from('projects')
      .select('*, project_payments(*), project_costs(*), project_extras(*), project_commitments(*, payable_accounts(id, status, payable_payments(amount_usd))), partner_advances(*)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (projectsErr) {
      return NextResponse.json({ error: projectsErr.message }, { status: 500 });
    }

    const allProjects = projects || [];
    const activeProjects = allProjects.filter(p => 
      p.status === 'in_progress' || 
      p.status === 'completed' || 
      (p.project_payments && p.project_payments.length > 0) || 
      (p.project_extras && p.project_extras.length > 0)
    );

    // Filtrar por proyecto si se especificó
    const printProjects = projectId
      ? allProjects.filter(p => p.id === projectId)
      : (activeProjects.length > 0 ? activeProjects : allProjects);

    const printPayments = printProjects
      .flatMap(p => (p.project_payments || []).map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })))
      .sort((a: any, b: any) => {
        const dateA = new Date(a.date || a.created_at).getTime();
        const dateB = new Date(b.date || b.created_at).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
    const printCosts = printProjects
      .flatMap(p => (p.project_costs || []).map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })))
      .sort((a: any, b: any) => {
        const dateA = new Date(a.date || a.created_at).getTime();
        const dateB = new Date(b.date || b.created_at).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
    const printExtras = printProjects.flatMap(p => (p.project_extras || []).map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
    
    // 3. Obtener cuentas por pagar directamente de la tabla payable_accounts para proyectos seleccionados
    const printProjectIds = printProjects.map(p => p.id);
    let directPayables: any[] = [];
    if (printProjectIds.length > 0) {
      const { data: paData } = await supabaseAdmin
        .from('payable_accounts')
        .select('*, payable_payments(amount_usd), project:projects(title, proposal_number)')
        .in('project_id', printProjectIds);
      directPayables = paData || [];
    }

    const seenCommitmentIds = new Set(
      directPayables.map((a: any) => a.commitment_id).filter(Boolean)
    );

    const accountsCommitments: any[] = directPayables.map((a: any) => {
      const isPaidOrCancelled = a.status === 'paid' || a.status === 'cancelled';
      const paid = a.payable_payments?.reduce((s: any, pm: any) => s + Number(pm.amount_usd || 0), 0) || 0;
      const total = Number(a.total_amount_usd || 0);
      const balance = isPaidOrCancelled || paid >= total - 0.01 ? 0 : Math.max(0, total - paid);
      return {
        id: a.id,
        date: a.created_at,
        provider: a.name,
        description: a.description || 'Cuenta por pagar',
        project_title: a.project?.title || 'General',
        proposal_number: a.project?.proposal_number,
        total_amount: total,
        paid_amount: paid,
        balance
      };
    });

    const legacyCommitments = printProjects.flatMap(p => 
      (p.project_commitments || []).map((x: any) => {
        if (seenCommitmentIds.has(x.id)) return null;
        const status = x.payable_accounts?.[0]?.status;
        const isPaidOrCancelled = status === 'paid' || status === 'cancelled';
        const paid = x.payable_accounts?.[0]?.payable_payments?.reduce((s: any, pm: any) => s + Number(pm.amount_usd), 0) || 0;
        const total = Number(x.amount_usd || (x.quantity * x.unit_price_usd));
        const balance = isPaidOrCancelled || paid >= total - 0.01 ? 0 : Math.max(0, total - paid);
        return {
          ...x,
          project_title: p.title,
          proposal_number: p.proposal_number,
          total_amount: total,
          paid_amount: paid,
          balance
        };
      }).filter(Boolean)
    );

    const printCommitments = [...accountsCommitments, ...legacyCommitments].filter((c: any) => c.balance > 0.01);

    const printAdvances = printProjects.flatMap(p => (p.partner_advances || []).map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
    
    const printTotalContracted = printProjects.reduce((s: number, p: any) => s + Number(p.budget_usd), 0) + printExtras.reduce((s: number, e: any) => s + Number(e.amount_usd), 0);
    const printTotalPaid = printPayments.reduce((s: number, p: any) => s + Number(p.amount_usd), 0);
    const printTotalCostsValue = printCosts.reduce((s: number, c: any) => s + (Number(c.quantity) * Number(c.unit_price_usd)), 0);
    const printTotalCommitted = printCommitments.reduce((s: number, c: any) => s + c.balance, 0);
    const printTotalAdvances = printAdvances.reduce((s: number, a: any) => s + Number(a.amount_usd), 0);
    const printBalanceDue = printTotalContracted - printTotalPaid;
    const printEstimatedProfit = printTotalContracted - printTotalCostsValue - printTotalCommitted;
    const printNetProfit = printEstimatedProfit - printTotalAdvances;

    const henryAdvances = printAdvances.filter((a: any) => /henry/i.test(a.partner_name || '')).reduce((s: number, a: any) => s + Number(a.amount_usd || 0), 0);
    const losbersAdvances = printAdvances.filter((a: any) => /losber/i.test(a.partner_name || '')).reduce((s: number, a: any) => s + Number(a.amount_usd || 0), 0);

    const reportData: PartnerReportData = {
      client,
      clientNotes: client.notes || '',
      activeProjectsCount: activeProjects.length,
      printProjects,
      printPayments,
      printCosts,
      printExtras,
      printCommitments,
      printAdvances,
      printTotalContracted,
      printTotalPaid,
      printTotalCostsValue,
      printTotalCommitted,
      printTotalAdvances,
      printBalanceDue,
      printEstimatedProfit,
      printNetProfit,
      henryAdvances,
      losbersAdvances
    };

    if (format === 'html') {
      const html = generatePartnerReportHtml(reportData);
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        }
      });
    }

    const pdfBuffer = await generatePartnerReportPdfKit(reportData);
    const safeClientName = (client.name || 'cliente').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Reporte_Socios_${safeClientName}.pdf`;
    const isDownload = searchParams.get('download') === '1';
    const disposition = isDownload ? 'attachment' : 'inline';

    return new Response(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${fileName}"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (err: any) {
    console.error('Error generando reporte de socios:', err);
    return NextResponse.json({ error: err.message || 'Error interno al generar el reporte' }, { status: 500 });
  }
}
