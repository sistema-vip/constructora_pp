import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateClientStatementPdfKit, ClientStatementData } from '@/lib/pdf/generateClientStatementPdfKit';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await context.params;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');
    const projectsFilter = searchParams.get('projects'); // Comma-separated project IDs

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
      .select('*, project_payments(*), project_extras(*)')
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

    // Filtrar según project_id o lista de proyectos seleccionados
    let printProjects = activeProjects.length > 0 ? activeProjects : allProjects;

    if (projectId) {
      printProjects = allProjects.filter(p => p.id === projectId);
    } else if (projectsFilter) {
      const allowedIds = new Set(projectsFilter.split(',').map(s => s.trim()).filter(Boolean));
      if (allowedIds.size > 0) {
        printProjects = allProjects.filter(p => allowedIds.has(p.id));
      }
    }

    const printPayments = printProjects.flatMap(p => 
      (p.project_payments || []).map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number }))
    ).sort((a: any, b: any) => {
      const dateA = new Date(a.date || a.created_at).getTime();
      const dateB = new Date(b.date || b.created_at).getTime();
      if (dateB !== dateA) return dateB - dateA;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    const printExtras = printProjects.flatMap(p => 
      (p.project_extras || []).map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number }))
    );

    const printTotalContracted = printProjects.reduce((s: number, p: any) => s + Number(p.budget_usd || 0), 0) + 
      printExtras.reduce((s: number, e: any) => s + Number(e.amount_usd || 0), 0);
    const printTotalPaid = printPayments.reduce((s: number, p: any) => s + Number(p.amount_usd || 0), 0);
    const printBalanceDue = Math.max(0, printTotalContracted - printTotalPaid);

    const statementData: ClientStatementData = {
      client,
      dateStr: new Date().toLocaleDateString('es-VE'),
      activeProjectsCount: activeProjects.length,
      printProjects,
      printPayments,
      printExtras,
      printTotalContracted,
      printTotalPaid,
      printBalanceDue
    };

    const pdfBuffer = await generateClientStatementPdfKit(statementData);
    const safeClientName = (client.name || 'cliente').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Estado_de_Cuenta_${safeClientName}.pdf`;
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
    console.error('Error generando estado de cuenta en PDF:', err);
    return NextResponse.json({ error: err.message || 'Error interno al generar el estado de cuenta' }, { status: 500 });
  }
}
