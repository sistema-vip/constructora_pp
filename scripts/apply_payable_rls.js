const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tyafjhkdxuygnbejbymp.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5YWZqaGtkeHV5Z25iZWpieW1wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyMDUwNiwiZXhwIjoyMDkyODk2NTA2fQ.j5YZQVprCKUFncWpYuLJXQ1Vsw_afL0mzhGtyfr_Znw';

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function applyPayableRLS() {
  console.log('🔒 Configurando RLS para cuentas por pagar y abonos...\n');

  try {
    const migrationPath = path.join(__dirname, '../supabase/migrations/20260607_add_rls_payable_accounts.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Dado que no podemos usar .rpc('exec') libremente sin asegurarnos de que la funcion exista
    // Utilizaremos la misma estrategia temporal de query directa o si falla indicaremos al usuario 
    // Que ejecute el script en el entorno de Supabase, pero vamos a intentar hacerlo mas manual si es posible.

    console.log('📝 Aplicando políticas de seguridad (RLS)...');
    
    // Trataremos de usar .rpc('exec') como en setup-observer-rls.ts
    const statements = sql.split(';').filter(s => s.trim().length > 0);
    
    for (const statement of statements) {
       console.log(`Ejecutando: ${statement.trim().substring(0, 50)}...`);
       try {
         const { error } = await supabase.rpc('exec', { sql: statement + ';' });
         if (error) {
           if (error.code === 'PGRST202') {
             throw new Error('La función RPC "exec" no existe en la base de datos (PGRST202). Debes ejecutar el script SQL manualmente.');
           }
           console.error('❌ Error parcial:', error.message);
         }
       } catch (e) {
         console.error('❌ Error en ejecución RPC:', e.message);
       }
    }

    console.log('\n✅ Proceso completado exitosamente.');
    
    // Verificando politicas aplicadas
    const { data: policies } = await supabase.rpc('sql', { query: `SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('payable_accounts', 'payable_payments')` }).catch(() => ({ data: null }));
    if (policies) {
        console.log('Políticas actuales:', policies);
    }
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.log('\n💡 Como alternativa, copia el contenido del archivo `supabase/migrations/20260607_add_rls_payable_accounts.sql`');
    console.log('   y ejecútalo directamente en la consola SQL de Supabase:');
    console.log('   https://app.supabase.com/project/tyafjhkdxuygnbejbymp/sql');
  }
}

applyPayableRLS();
