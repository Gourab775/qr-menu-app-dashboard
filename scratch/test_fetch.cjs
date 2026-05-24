const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yskezogjwmkmgvpstnmd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlza2V6b2dqd21rbWd2cHN0bm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTQ0MjgsImV4cCI6MjA4OTA5MDQyOH0.5gpkFVMftIJnDw5EbDVtWb1bpGy4MU_IHzyvlsi2piE';
const AUTH_RID = 'f9324acc-ea1e-47ae-9ebc-9a66c61cd53b';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchPending() {
  try {
    console.log('[Waiter] 🔍 Fetching pending calls for restaurant:', AUTH_RID);
    const { data, error } = await supabase
      .from('waiter_calls')
      .select('id, restaurant_id, table_id, order_code, session_order_id, status, created_at')
      .eq('restaurant_id', AUTH_RID)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    console.log('[Waiter] 📦 Fetch result:', {
      count: data?.length,
      error: error?.message || null,
      code: error?.code || null,
      filters: { restaurant_id: AUTH_RID, status: 'pending' }
    });

    if (error) throw error;

    if (data) {
      const tableIds = [...new Set(data.filter(c => c.table_id).map(c => c.table_id))];
      console.log('Unique table IDs:', tableIds);

      if (tableIds.length > 0) {
        const { data: tables, error: tablesErr } = await supabase
          .from('restaurant_tables')
          .select('id, table_number')
          .in('id', tableIds);

        if (tablesErr) {
          console.error('Error fetching tables:', tablesErr);
        } else {
          console.log('Fetched tables mapping:', tables);
          const tMap = {};
          tables.forEach(t => { tMap[t.id] = t.table_number; });
          data.forEach(c => {
            if (c.table_id && tMap[c.table_id]) {
              c.restaurant_tables = { table_number: tMap[c.table_id] };
            }
          });
        }
      }

      console.log('Final Mapped Data:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('[Waiter] ❌ Fetch error:', err.message || err);
  }
}

fetchPending();
