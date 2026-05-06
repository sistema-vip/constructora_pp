import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Cliente admin para bypasear RLS al insertar (la política anon ya lo permite,
// pero usamos admin para validar duplicados sin restricciones de RLS en select)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const { name, email, message } = await req.json();

    if (!name || !email) {
      return NextResponse.json(
        { error: 'El nombre y el correo electrónico son requeridos.' },
        { status: 400 }
      );
    }

    // Validar formato de email básico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'El formato del correo electrónico no es válido.' },
        { status: 400 }
      );
    }

    // Verificar si ya existe una solicitud pendiente con ese email
    const { data: existingRequest } = await supabaseAdmin
      .from('access_requests')
      .select('id, status')
      .eq('email', email.toLowerCase().trim())
      .in('status', ['pending', 'approved'])
      .single();

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return NextResponse.json(
          { error: 'Ya tienes una solicitud pendiente con este correo. El administrador la revisará pronto.' },
          { status: 409 }
        );
      }
      if (existingRequest.status === 'approved') {
        return NextResponse.json(
          { error: 'Este correo ya tiene acceso aprobado al sistema. Intenta iniciar sesión.' },
          { status: 409 }
        );
      }
    }

    // Verificar si el email ya está registrado como usuario activo
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existingProfile) {
      return NextResponse.json(
        { error: 'Este correo ya tiene una cuenta activa. Intenta iniciar sesión.' },
        { status: 409 }
      );
    }

    // Insertar la solicitud de acceso
    const { error: insertError } = await supabaseAdmin
      .from('access_requests')
      .insert({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        message: message?.trim() || null,
        status: 'pending',
      });

    if (insertError) {
      console.error('[access-request/submit] Insert error:', insertError);
      return NextResponse.json(
        { error: 'No se pudo registrar la solicitud. Intenta de nuevo.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Solicitud enviada correctamente. El administrador la revisará pronto.',
    });
  } catch (error: any) {
    console.error('[access-request/submit] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Ocurrió un error inesperado. Intenta de nuevo.' },
      { status: 500 }
    );
  }
}
