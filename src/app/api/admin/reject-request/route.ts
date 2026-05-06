import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const { requestId } = await req.json();

    if (!requestId) {
      return NextResponse.json({ error: 'ID de solicitud requerido.' }, { status: 400 });
    }

    // Verificar que la solicitud existe y está pendiente
    const { data: request, error: fetchError } = await supabaseAdmin
      .from('access_requests')
      .select('id, status, email, name')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single();

    if (fetchError || !request) {
      return NextResponse.json(
        { error: 'Solicitud no encontrada o ya fue procesada.' },
        { status: 404 }
      );
    }

    // Marcar como rechazada
    const { error: updateError } = await supabaseAdmin
      .from('access_requests')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('[reject-request] Update error:', updateError);
      return NextResponse.json(
        { error: 'No se pudo actualizar el estado de la solicitud.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Solicitud de ${request.name} (${request.email}) rechazada.`,
    });
  } catch (error: any) {
    console.error('[reject-request] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Ocurrió un error inesperado.' },
      { status: 500 }
    );
  }
}
