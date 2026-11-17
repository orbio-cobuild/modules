import raw from '@/config/auth-orbio.json'
import { configSchema, type AuthOrbioConfig } from './config-schema'

let cached: AuthOrbioConfig | undefined

export function getAuthOrbioConfig(): AuthOrbioConfig {
  if (cached) return cached
  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`The Orbio sign-in settings are invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  }
  cached = parsed.data
  return cached
}

/** Orbio's OAuth endpoints, from https://www.orbio.so/developers/docs.md */
export function endpoints(issuer: string) {
  const base = issuer.replace(/\/$/, '')
  return {
    authorize: `${base}/oauth/authorize`,
    token: `${base}/api/oauth/token`,
    revoke: `${base}/api/oauth/revoke`,
    jwks: `${base}/api/oauth/jwks`,
    userinfo: `${base}/api/oauth/userinfo`,
  }
}

/** ORBIO_CLIENT_ID is required. ORBIO_CLIENT_SECRET is set for a server app and absent for a public app. */
export function clientCredentials(): { clientId: string; clientSecret: string | null } {
  const clientId = process.env.ORBIO_CLIENT_ID
  if (!clientId) throw new Error('Sign in with Orbio is not set up yet (ORBIO_CLIENT_ID is missing).')
  return { clientId, clientSecret: process.env.ORBIO_CLIENT_SECRET || null }
}
