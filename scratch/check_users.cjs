const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yskezogjwmkmgvpstnmd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlza2V6b2dqd21rbWd2cHN0bm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTQ0MjgsImV4cCI6MjA4OTA5MDQyOH0.5gpkFVMftIJnDw5EbDVtWb1bpGy4MU_IHzyvlsi2piE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('--- USERS & RESTAURANTS DIAGNOSTICS ---');
  try {
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('*');

    if (profErr) {
      console.error('Error profiles:', profErr);
    } else {
      console.log('Profiles:', profiles);
    }

    const { data: restaurants, error: restErr } = await supabase
      .from('restaurants')
      .select('*');

    if (restErr) {
      console.error('Error restaurants:', restErr);
    } else {
      console.log('Restaurants:', restaurants);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

run();
