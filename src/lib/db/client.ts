/**
 * Browser-side Supabase client. Uses only the publishable key, so every read and write is
 * limited by row-level security. Safe to import from client components.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { publicDbEnv } from './env'

let browserDb: SupabaseClient | undefined

export function getBrowserDb(): SupabaseClient {
  if (!browserDb) {
    const { url, publishableKey } = publicDbEnv()
    browserDb = createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }
  return browserDb
}
