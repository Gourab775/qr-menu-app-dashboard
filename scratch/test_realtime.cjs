const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yskezogjwmkmgvpstnmd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlza2V6b2dqd21rbWd2cHN0bm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTQ0MjgsImV4cCI6MjA4OTA5MDQyOH0.5gpkFVMftIJnDw5EbDVtWb1bpGy4MU_IHzyvlsi2piE';
const restaurantId = 'f9324acc-ea1e-47ae-9ebc-9a66c61cd53b';
const tableId = '2d51aab8-2cd6-4b7b-8716-0cf315cf6fd0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Starting Supabase Realtime subscription test for waiter_calls...');

  const channel = supabase.channel('test-waiter-calls')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'waiter_calls' }, (payload) => {
      console.log('REALTIME EVENT RECEIVED:', payload);
    })
    .subscribe((status, err) => {
      console.log('Subscription status:', status, err || '');
      if (status === 'SUBSCRIBED') {
        console.log('Successfully subscribed! Now inserting a test waiter call...');
        
        // Insert a call after 2 seconds to ensure subscription is active
        setTimeout(async () => {
          console.log('Inserting call...');
          const { data, error } = await supabase
            .from('waiter_calls')
            .insert({
              restaurant_id: restaurantId,
              table_id: tableId,
              status: 'pending',
              order_code: 'TEST-1234',
              session_order_id: 'test_session_id'
            })
            .select();

          if (error) {
            console.error('Insert failed:', error);
          } else {
            console.log('Insert succeeded:', data);
          }
        }, 2000);
      }
    });

  // Keep process running for 10 seconds to wait for events
  setTimeout(() => {
    console.log('Cleaning up subscription and exiting.');
    supabase.removeChannel(channel);
    process.exit(0);
  }, 10000);
}

run();
