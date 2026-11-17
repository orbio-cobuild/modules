import raw from '@/config/fair-verify.json'
import { configSchema, type FairVerifyConfig } from './config-schema'

let cached: FairVerifyConfig | undefined

/** Safe on the client: this config holds only public addresses and labels. */
export function getFairVerifyConfig(): FairVerifyConfig {
  if (cached) return cached
  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) throw new Error(`The fairness-check settings are invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  cached = parsed.data
  return cached
}
