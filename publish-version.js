import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'))

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const appName = process.env.APP_NAME || 'dashboard'
const message = process.env.UPDATE_MESSAGE || ''
const updateUrl = process.env.UPDATE_URL || ''
const forceUpdate = false

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const { data, error } = await supabase
  .from('app_versions')
  .insert({
    app_name: appName,
    version: pkg.version,
    message,
    update_url: updateUrl,
    force_update: forceUpdate,
  })
  .select()

if (error) {
  console.error('Failed to publish version:', error.message)
  process.exit(1)
}

console.log(`Version ${pkg.version} published successfully:`, JSON.stringify(data))
