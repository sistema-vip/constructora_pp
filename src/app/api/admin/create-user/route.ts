import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, role } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Email, contraseña y nombre son requeridos.' }, { status: 400 });
    }

    // 1. Crear usuario en Supabase Auth con privilegios de admin
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (authError) {
      console.error('[create-user] Auth error:', authError);
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const userId = authData.user.id;
    const userRole = role === 'admin' ? 'admin' : role === 'sales' ? 'sales' : 'viewer';

    // 2. Crear perfil en la tabla profiles
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({ 
        id: userId, 
        name, 
        role: userRole 
      });

    if (profileError) {
      console.error('[create-user] Profile error:', profileError);
      // Intentamos borrar el usuario de auth si falló el perfil para mantener consistencia
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: 'Error al asignar el perfil de usuario.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, userId });
  } catch (error: any) {
    console.error('[create-user] Unexpected error:', error);
    return NextResponse.json({ error: 'Ocurrió un error inesperado al crear el usuario.' }, { status: 500 });
  }
}
