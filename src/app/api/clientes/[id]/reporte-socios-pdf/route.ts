import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generatePartnerReportHtml, PartnerReportData } from '@/lib/pdf/generatePartnerReportHtml';
import { generatePartnerReportPdfBuffer } from '@/lib/pdf/generatePartnerReportPuppeteer';

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
    const activeProjects = allProjects.filter(p => p.status === 'in_progress' || p.status === 'completed');

    // Filtrar por proyecto si se especificó
    const printProjects = projectId
      ? allProjects.filter(p => p.id === projectId)
      : (activeProjects.length > 0 ? activeProjects : allProjects);

    // Cálculos idénticos a src/app/clientes/[id]/page.tsx
    const printPayments = printProjects.flatMap(p => (p.project_payments || []).map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
    const printCosts = printProjects.flatMap(p => (p.project_costs || []).map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
    const printExtras = printProjects.flatMap(p => (p.project_extras || []).map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
    
    const printCommitments = printProjects.flatMap(p => 
      (p.project_commitments || []).map((x: any) => {
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
      })
    ).filter((c: any) => c.balance > 0.01);

    const printAdvances = printProjects.flatMap(p => (p.partner_advances || []).map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
    
    const printTotalContracted = printProjects.reduce((s: number, p: any) => s + Number(p.budget_usd), 0) + printExtras.reduce((s: number, e: any) => s + Number(e.amount_usd), 0);
    const printTotalPaid = printPayments.reduce((s: number, p: any) => s + Number(p.amount_usd), 0);
    const printTotalCostsValue = printCosts.reduce((s: number, c: any) => s + (Number(c.quantity) * Number(c.unit_price_usd)), 0);
    const printTotalCommitted = printCommitments.reduce((s: number, c: any) => s + c.balance, 0);
    const printTotalAdvances = printAdvances.reduce((s: number, a: any) => s + Number(a.amount_usd), 0);
    const printBalanceDue = printTotalContracted - printTotalPaid;
    const printEstimatedProfit = printTotalContracted - printTotalCostsValue - printTotalCommitted;
    const printNetProfit = printEstimatedProfit - printTotalAdvances;

    const henryAdvances = printAdvances.filter((a: any) => a.partner_name === 'Henry Peraza').reduce((s: number, a: any) => s + Number(a.amount_usd), 0);
    const losbersAdvances = printAdvances.filter((a: any) => a.partner_name === 'Losbers Perez').reduce((s: number, a: any) => s + Number(a.amount_usd), 0);

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

    if (format === 'pdf') {
      const pdfBuffer = await generatePartnerReportPdfBuffer(reportData);
      const safeClientName = (client.name || 'cliente').replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `Reporte_Socios_${safeClientName}.pdf`;

      return new Response(pdfBuffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${fileName}"`,
          'Content-Length': pdfBuffer.length.toString()
        }
      });
    }

    const html = generatePartnerReportHtml(reportData);

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      }
    });
  } catch (err: any) {
    console.error('Error generando reporte de socios:', err);
    return NextResponse.json({ error: err.message || 'Error interno al generar el reporte' }, { status: 500 });
  }
}
