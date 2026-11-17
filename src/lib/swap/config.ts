import raw from '@/config/swap.json'
import { configSchema, type SwapConfig } from './config-schema'

let cached: SwapConfig | undefined

export function getSwapConfig(): SwapConfig {
  if (cached) return cached
  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`The swap settings are invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  }
  cached = parsed.data
  return cached
}
