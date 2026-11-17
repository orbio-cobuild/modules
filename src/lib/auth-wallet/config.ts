import raw from '@/config/auth-wallet.json'
import { configSchema, type AuthWalletConfig } from './config-schema'

let cached: AuthWalletConfig | undefined

/** The project's validated auth-wallet config. Throws a plain-English error if the file is invalid. */
export function getAuthWalletConfig(): AuthWalletConfig {
  if (cached) return cached
  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`The wallet sign-in settings are invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  }
  cached = parsed.data
  return cached
}
