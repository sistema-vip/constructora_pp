import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateProposalPdfBuffer, ProposalData } from '@/lib/pdf/generateProposalPdf';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: 'ID de proyecto o propuesta requerido' }, { status: 400 });
    }

    // Consultar el proyecto y su cliente
    const isNumber = !isNaN(Number(id));
    let query = supabaseAdmin.from('projects').select('*, clients(*)');

    if (isNumber) {
      query = query.eq('proposal_number', Number(id));
    } else {
      query = query.eq('id', id);
    }

    const { data: projects, error } = await query;

    if (error || !projects || projects.length === 0) {
      return NextResponse.json({ error: 'Propuesta no encontrada' }, { status: 404 });
    }

    const project = projects[0];
    const client = project.clients || {};

    const proposalData: ProposalData = {
      proposal_number: project.proposal_number,
      date: project.start_date || (project.created_at ? project.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
      title: project.title,
      client_name: client.name || 'Cliente',
      client_tax_id: client.tax_id || '',
      client_phone: client.phone || '',
      client_email: client.email || '',
      client_address: client.address || '',
      budget_usd: project.budget_usd || 0,
      budget_ves: project.budget_ves || 0,
      description: project.description || ''
    };

    const pdfBuffer = await generateProposalPdfBuffer(proposalData);
    const fileName = `Propuesta_${project.proposal_number || 'draft'}_${(client.name || 'cliente').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    return new Response(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Content-Length': pdfBuffer.length.toString()
      }
    });
  } catch (err: any) {
    console.error('Error generando PDF de propuesta:', err);
    return NextResponse.json({ error: err.message || 'Error interno al generar el PDF' }, { status: 500 });
  }
}
