import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export async function POST(req: NextRequest) {
  try {
    const { requestId, role } = await req.json();

    if (!requestId) {
      return NextResponse.json({ error: 'ID de solicitud requerido.' }, { status: 400 });
    }

    const userRole = role === 'admin' ? 'admin' : 'viewer';

    // 1. Obtener la solicitud de acceso
    const { data: request, error: fetchError } = await supabaseAdmin
      .from('access_requests')
      .select('*')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single();

    if (fetchError || !request) {
      return NextResponse.json(
        { error: 'Solicitud no encontrada o ya fue procesada.' },
        { status: 404 }
      );
    }

    // 2. Verificar que el email no tenga ya una cuenta
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const emailAlreadyExists = existingUsers?.users.some(
      (u) => u.email?.toLowerCase() === request.email.toLowerCase()
    );

    if (emailAlreadyExists) {
      // Marcar la solicitud como aprobada sin crear usuario duplicado
      await supabaseAdmin
        .from('access_requests')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', requestId);

      return NextResponse.json({
        success: true,
        warning: 'El email ya tenía una cuenta registrada. Solicitud marcada como aprobada.',
        tempPassword: null,
      });
    }

    // 3. Generar contraseña temporal
    const tempPassword = generateTemporaryPassword();

    // 4. Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: request.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: request.name },
    });

    if (authError) {
      console.error('[approve-request] Auth error:', authError);
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const userId = authData.user.id;

    // 5. Crear perfil con rol asignado
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({ id: userId, name: request.name, role: userRole });

    if (profileError) {
      console.error('[approve-request] Profile error:', profileError);
      // Revertir: eliminar el usuario de auth
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: 'Error al crear el perfil. El usuario no fue creado.' },
        { status: 500 }
      );
    }

    // 6. Marcar solicitud como aprobada
    await supabaseAdmin
      .from('access_requests')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    return NextResponse.json({
      success: true,
      userId,
      email: request.email,
      name: request.name,
      role: userRole,
      tempPassword,
    });
  } catch (error: any) {
    console.error('[approve-request] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Ocurrió un error inesperado.' },
      { status: 500 }
    );
  }
}
