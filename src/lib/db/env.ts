/**
 * Environment for the db module. Only the URL and the *publishable* key are public.
 * APP_SERVER_KEY is server-only: it proves a request comes from this app's own server routes.
 */

// Next.js inlines NEXT_PUBLIC_* only when referenced literally, so keep these as written.
export function publicDbEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) {
    throw new Error('The database is not connected yet. Ask the builder to connect it, then try again.')
  }
  return { url, publishableKey }
}

export function serverKey(): string {
  const key = process.env.APP_SERVER_KEY
  if (!key) {
    throw new Error('The app server is missing its database key. Ask the builder to reconnect the database.')
  }
  return key
}
