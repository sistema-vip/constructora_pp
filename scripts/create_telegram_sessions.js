const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://tyafjhkdxuygnbejbymp.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5YWZqaGtkeHV5Z25iZWpieW1wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyMDUwNiwiZXhwIjoyMDkyODk2NTA2fQ.j5YZQVprCKUFncWpYuLJXQ1Vsw_afL0mzhGtyfr_Znw';

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function createTelegramSessionsTable() {
  console.log('🚀 Creando tabla telegram_sessions...\n');

  // Verificar si ya existe intentando leer un registro
  const { error: checkError } = await supabase
    .from('telegram_sessions')
    .select('id')
    .limit(1);

  if (!checkError) {
    console.log('✅ La tabla telegram_sessions YA EXISTE. No es necesario crearla.');
    return;
  }

  if (!checkError.message.includes('not found') && !checkError.message.includes('does not exist') && !checkError.message.includes('42P01')) {
    console.log('⚠️ Error inesperado al verificar:', checkError.message);
  }

  console.log('📋 La tabla no existe. Creándola...');

  // Usar fetch para ejecutar SQL a través del endpoint de Postgres de Supabase
  // (el service_role key permite esto)
  const sql = `
    CREATE TABLE IF NOT EXISTS public.telegram_sessions (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      telegram_chat_id  BIGINT      NOT NULL UNIQUE,
      state             TEXT        NOT NULL DEFAULT 'idle',
      amount            NUMERIC(14,4),
      currency          TEXT        NOT NULL DEFAULT 'USD',
      description       TEXT,
      provider          TEXT,
      payment_reference TEXT,
      category          TEXT        NOT NULL DEFAULT 'materials',
      project_id        UUID        REFERENCES public.projects(id) ON DELETE SET NULL,
      client_name       TEXT,
      project_options   JSONB,
      telegram_user_name TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes')
    );

    CREATE INDEX IF NOT EXISTS idx_telegram_sessions_chat_id
      ON public.telegram_sessions (telegram_chat_id);

    ALTER TABLE public.telegram_sessions ENABLE ROW LEVEL SECURITY;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'telegram_sessions'
        AND policyname = 'Service role manages telegram sessions'
      ) THEN
        CREATE POLICY "Service role manages telegram sessions"
          ON public.telegram_sessions FOR ALL
          TO service_role
          USING (true)
          WITH CHECK (true);
      END IF;
    END $$;
  `;

  // Usar el endpoint de la Supabase Management API para ejecutar SQL
  const response = await fetch(
    `https://tyafjhkdxuygnbejbymp.supabase.co/rest/v1/rpc/exec_sql`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ query: sql })
    }
  );

  if (response.ok) {
    console.log('✅ Tabla creada via RPC!');
    return;
  }

  console.log('⚠️ RPC falló, intentando método alternativo...');
  console.log('Status:', response.status);
  const body = await response.text();
  console.log('Body:', body);
  
  // Método alternativo: insertar directamente y ver qué pasa
  // Si la tabla no existe, Supabase devuelve un error específico
  // que podemos usar para diagnosticar
  console.log('\n📌 ACCIÓN REQUERIDA:');
  console.log('Por favor ejecuta manualmente el siguiente SQL en el Dashboard de Supabase:');
  console.log('https://supabase.com/dashboard/project/tyafjhkdxuygnbejbymp/sql/new');
  console.log('\n--- COPIAR DESDE AQUÍ ---');
  console.log(sql);
  console.log('--- HASTA AQUÍ ---');
}

createTelegramSessionsTable().catch(console.error);
