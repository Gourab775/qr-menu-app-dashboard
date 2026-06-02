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

// --- Diagnostics ---
console.log('=== Deployment Diagnostics ===')
console.log(`Node version: ${process.version}`)
console.log(`App name: ${appName}`)
console.log(`Version to publish: ${pkg.version}`)
console.log(`Supabase URL configured: ${!!supabaseUrl}`)
console.log(`Supabase Key configured: ${!!supabaseKey}`)

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_KEY')
  process.exit(1)
}

const baseUrl = supabaseUrl.replace(/\/+$/, '')
const endpoint = `${baseUrl}/rest/v1/app_versions`

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Prefer': 'return=representation'
  },
  body: JSON.stringify({
    app_name: appName,
    version: pkg.version,
    message,
    update_url: updateUrl,
    force_update: forceUpdate
  })
})

if (!response.ok) {
  const errBody = await response.text()
  console.error('Failed to publish version:', response.status, response.statusText, errBody)
  process.exit(1)
}

const data = await response.json()
console.log(`Version ${pkg.version} published successfully:`, JSON.stringify(data))
