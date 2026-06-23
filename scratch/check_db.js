const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://tyafjhkdxuygnbejbymp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5YWZqaGtkeHV5Z25iZWpieW1wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyMDUwNiwiZXhwIjoyMDkyODk2NTA2fQ.j5YZQVprCKUFncWpYuLJXQ1Vsw_afL0mzhGtyfr_Znw',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function check() {
  try {
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*, project_payments(*), project_costs(*), project_extras(*), project_commitments(*, payable_accounts(payable_payments(amount_usd))), partner_advances(*)')
      .eq('client_id', 'e0da6455-1c6c-4599-aa26-bc70b69ce6d7');

    console.log('--- PROYECTOS Y GASTOS RELACIONADOS ---');
    projects.forEach(p => {
      console.log(`Proyecto: ${p.title} (${p.status})`);
      console.log(`  Gastos (${p.project_costs.length}):`, JSON.stringify(p.project_costs, null, 2));
      console.log(`  Compromisos (${p.project_commitments.length}):`, JSON.stringify(p.project_commitments, null, 2));
    });
  } catch (err) {
    console.error('Error:', err.message);
  }
}

check();
