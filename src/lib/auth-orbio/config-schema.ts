import { z } from 'zod'

const SCOPES = ['openid', 'profile', 'email', 'wallet', 'balance', 'inference', 'tools', 'social', 'infra', 'offline_access'] as const

/** Config for the auth-orbio module. The pipeline writes the validated value to `src/config/auth-orbio.json`. */
export const configSchema = z.object({
  /** Scopes to ask for. People approve all or nothing, so ask only for what the app uses. `openid` is required. */
  scopes: z
    .array(z.enum(SCOPES))
    .min(1)
    .default(['openid', 'profile'])
    .refine((s) => s.includes('openid'), { message: 'scopes must include openid (the app needs to know who signed in)' })
    .refine((s) => !s.includes('infra'), { message: "generated apps must not ask for infra; that is the platform's scope" }),
  /** Orbio's issuer. Only change for testing. */
  issuer: z.string().url().default('https://www.orbio.so'),
  /** Orbio's API host for gateway and tool calls made with the person's token. */
  apiBase: z.string().url().default('https://api.orbio.so'),
  /** Where Orbio sends people back. Must be registered exactly at orbio.so/developers/apps. */
  callbackPath: z.string().startsWith('/').default('/api/auth/orbio/callback'),
  /** Where to send people after signing in, when the sign-in link has no returnTo. */
  afterSignInPath: z.string().startsWith('/').default('/'),
  /** How long the app session lasts, in seconds (Orbio's own tokens refresh underneath). */
  sessionTtlSeconds: z.number().int().min(300).max(60 * 60 * 24 * 30).default(60 * 60 * 24 * 7),
  /** `none` signs returning people straight back in; `consent` always shows Orbio's screen. */
  prompt: z.enum(['none', 'consent']).nullable().default(null),
})

export type AuthOrbioConfig = z.infer<typeof configSchema>
