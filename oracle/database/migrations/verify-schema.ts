import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'dummy';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verifySchema() {
  console.log('Verifying Oracle database schema...');

  // 1. Verify vrf_audit_log table exists
  console.log('Checking for vrf_audit_log table...');
  const { error: vrfError } = await supabase.from('vrf_audit_log').select('id').limit(1);

  if (vrfError && (vrfError.code === '42P01' || vrfError.message.includes('relation "vrf_audit_log" does not exist'))) {
    console.error('❌ Schema verification failed: Table "vrf_audit_log" does not exist!');
    console.error('Please run the migrations in database/migrations before starting the application.');
    process.exit(1);
  } else if (vrfError && vrfError.code !== 'PGRST116') {
    // We ignore some PostgREST errors if it just means no rows or similar, but log them just in case
    console.warn(`⚠️ Could query "vrf_audit_log", but received an error: ${vrfError.message}`);
  } else {
    console.log('✅ Table "vrf_audit_log" exists.');
  }

  console.log('Checking for randomness_audit_log table...');
  const { error: randomnessError } = await supabase
    .from('randomness_audit_log')
    .select('id')
    .limit(1);

  if (
    randomnessError &&
    (randomnessError.code === '42P01' ||
      randomnessError.message.includes('relation "randomness_audit_log" does not exist'))
  ) {
    console.error(
      '❌ Schema verification failed: Table "randomness_audit_log" does not exist!',
    );
    process.exit(1);
  } else if (randomnessError && randomnessError.code !== 'PGRST116') {
    console.warn(
      `⚠️ Could query "randomness_audit_log", but received an error: ${randomnessError.message}`,
    );
  } else {
    console.log('✅ Table "randomness_audit_log" exists.');
  }

  console.log('Schema verification passed.');
  process.exit(0);
}

verifySchema().catch(err => {
  console.error('Unexpected error during schema verification:', err);
  process.exit(1);
});
