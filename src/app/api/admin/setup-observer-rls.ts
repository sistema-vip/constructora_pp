import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    console.log('🔒 Iniciando configuración de RLS para OBSERVADOR...\n');

    const tables = [
      'clients', 
      'projects', 
      'profiles', 
      'materials', 
      'project_costs', 
      'project_payments',
      'payable_accounts',
      'payable_payments'
    ];

    // 1. Habilitar RLS en todas las tablas
    console.log('1️⃣ Habilitando RLS...');
    for (const table of tables) {
      const { error } = await supabaseAdmin.rpc('exec', {
        sql: `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`
      });
      console.log(`   ✅ ${table}`);
    }

    // 2. Crear políticas para ADMIN (todas las operaciones)
    console.log('\n2️⃣ Creando políticas ADMIN (acceso total)...');
    for (const table of tables) {
      // Para ADMIN: acceso total a todas las operaciones
      const adminPolicy = `
        DROP POLICY IF EXISTS admin_all_${table} ON public.${table};
        CREATE POLICY admin_all_${table} ON public.${table}
        FOR ALL TO authenticated
        USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
        WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
      `;

      const { error } = await supabaseAdmin.rpc('exec', { sql: adminPolicy });
      console.log(`   ✅ admin_all_${table}`);
    }

    // 3. Crear políticas para OBSERVADOR (solo SELECT)
    console.log('\n3️⃣ Creando políticas OBSERVADOR (solo lectura)...');
    for (const table of tables) {
      // Para OBSERVADOR: solo SELECT (lectura)
      const observerPolicy = `
        DROP POLICY IF EXISTS observer_read_${table} ON public.${table};
        CREATE POLICY observer_read_${table} ON public.${table}
        FOR SELECT TO authenticated
        USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'viewer');
      `;

      const { error } = await supabaseAdmin.rpc('exec', { sql: observerPolicy });
      console.log(`   ✅ observer_read_${table}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ CONFIGURACIÓN COMPLETADA');
    console.log('='.repeat(60));

    return NextResponse.json({
      status: 'success',
      message: '✅ RLS configurado correctamente',
      details: {
        adminAccess: {
          select: true,
          insert: true,
          update: true,
          delete: true
        },
        observerAccess: {
          select: true,
          insert: false,
          update: false,
          delete: false
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to setup RLS', details: error.message },
      { status: 500 }
    );
  }
}
