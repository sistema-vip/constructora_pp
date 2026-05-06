import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual env parsing since dotenv might not be in the root node_modules
const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length === 2) {
    env[parts[0].trim()] = parts[1].trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTable() {
  try {
    const { data, error } = await supabase
      .from('access_requests')
      .select('*')
      .limit(1);

    if (error) {
      console.log('RESULT: ERROR: ' + error.message);
    } else {
      console.log('RESULT: SUCCESS');
    }
  } catch (err) {
    console.log('RESULT: EXCEPTION: ' + err.message);
  }
}

checkTable();
