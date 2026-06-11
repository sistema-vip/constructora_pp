const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://tyafjhkdxuygnbejbymp.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5YWZqaGtkeHV5Z25iZWpieW1wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyMDUwNiwiZXhwIjoyMDkyODk2NTA2fQ.j5YZQVprCKUFncWpYuLJXQ1Vsw_afL0mzhGtyfr_Znw';

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('Querying pg_policies...');
  const { data, error } = await supabase.rpc('exec', {
    sql: `
      SELECT tablename, policyname, cmd, qual, with_check 
      FROM pg_policies 
      WHERE schemaname = 'public' 
      ORDER BY tablename, policyname;
    `
  });
  if (error) {
    console.error('Error running RPC:', error);
  } else {
    console.log('Policies:');
    console.log(JSON.stringify(data, null, 2));
  }
  
  console.log('\nChecking RLS status on tables:');
  const { data: rlsStatus, error: rlsError } = await supabase.rpc('exec', {
    sql: `
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename;
    `
  });
  if (rlsError) {
    console.error('Error running RLS status query:', rlsError);
  } else {
    console.log(JSON.stringify(rlsStatus, null, 2));
  }
}

main().catch(console.error);
