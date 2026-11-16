import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const configuredUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
// "same-origin" is for local development behind a tunnel or cloud preview: the
// dev server forwards Supabase calls (see vite.config.ts).
const url = configuredUrl === 'same-origin' ? window.location.origin : configuredUrl
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill it in.',
  )
}

// Only the anon (publishable) key is used here. Row level security in the
// database decides what each signed-in user can see and do.
export const supabase = createClient<Database>(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
