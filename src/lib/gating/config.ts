import raw from '@/config/gating.json'
import { configSchema, type Gate, type GatingConfig } from './config-schema'

let cached: GatingConfig | undefined

export function getGatingConfig(): GatingConfig {
  if (cached) return cached
  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`The token-gate settings are invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  }
  cached = parsed.data
  return cached
}

export function findGate(config: GatingConfig, id: string): Gate {
  const gate = config.gates.find((g) => g.id === id)
  if (!gate) throw new Error(`There is no token gate called "${id}".`)
  return gate
}
