const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yskezogjwmkmgvpstnmd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlza2V6b2dqd21rbWd2cHN0bm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTQ0MjgsImV4cCI6MjA4OTA5MDQyOH0.5gpkFVMftIJnDw5EbDVtWb1bpGy4MU_IHzyvlsi2piE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Testing delete permission on waiter_calls...');
  try {
    // First, let's fetch a pending waiter call
    const { data: calls, error: fetchErr } = await supabase
      .from('waiter_calls')
      .select('id')
      .limit(1);

    if (fetchErr) {
      console.error('Fetch error:', fetchErr);
      return;
    }

    if (!calls || calls.length === 0) {
      console.log('No waiter calls to delete.');
      return;
    }

    const callId = calls[0].id;
    console.log(`Attempting to delete waiter call with ID: ${callId}...`);

    const { data, error: deleteErr } = await supabase
      .from('waiter_calls')
      .delete()
      .eq('id', callId)
      .select();

    if (deleteErr) {
      console.error('Delete failed:', deleteErr);
    } else {
      console.log('Delete succeeded! Deleted rows:', data);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

run();
