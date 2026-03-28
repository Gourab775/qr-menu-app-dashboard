import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yskezogjwmkmgvpstnmd.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlza2V6b2dqd21rbWd2cHN0bm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTQ0MjgsImV4cCI6MjA4OTA5MDQyOH0.5gpkFVMftIJnDw5EbDVtWb1bpGy4MU_IHzyvlsi2piE'

const RESTAURANT_ID = 'f9324acc-ea1e-47ae-9ebc-9a66c61cd53b'

export const supabase = createClient(supabaseUrl, supabaseKey)
export { RESTAURANT_ID }
