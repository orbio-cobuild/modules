import raw from '@/config/payments.json'
import { configSchema, type PaymentsConfig } from './config-schema'

let cached: PaymentsConfig | undefined

export function getPaymentsConfig(): PaymentsConfig {
  if (cached) return cached
  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`The payment settings are invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  }
  cached = parsed.data
  return cached
}
