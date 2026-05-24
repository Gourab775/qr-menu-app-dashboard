const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yskezogjwmkmgvpstnmd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlza2V6b2dqd21rbWd2cHN0bm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTQ0MjgsImV4cCI6MjA4OTA5MDQyOH0.5gpkFVMftIJnDw5EbDVtWb1bpGy4MU_IHzyvlsi2piE';
const restaurantId = 'f9324acc-ea1e-47ae-9ebc-9a66c61cd53b';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('--- DIAGNOSTICS ---');
  try {
    const { data: tables, error: tablesErr } = await supabase
      .from('restaurant_tables')
      .select('id, table_number')
      .eq('restaurant_id', restaurantId);

    if (tablesErr) {
      console.error('Error fetching tables:', tablesErr);
    } else {
      console.log('Tables found:', tables);
    }

    const { data: calls, error: callsErr } = await supabase
      .from('waiter_calls')
      .select('*')
      .limit(10);

    if (callsErr) {
      console.error('Error fetching waiter_calls:', callsErr);
    } else {
      console.log('Waiter calls found (limit 10):', calls);
    }

    const { data: pendingCalls, error: pendingCallsErr } = await supabase
      .from('waiter_calls')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'pending');

    if (pendingCallsErr) {
      console.error('Error fetching pending waiter_calls for restaurant:', pendingCallsErr);
    } else {
      console.log(`Pending waiter calls for restaurant ${restaurantId}:`, pendingCalls);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

run();
