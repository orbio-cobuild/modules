/** Wires the agent API to this project's config, operations, authorize hook and database. */
import 'server-only'
import { authorize } from '@/app/(project)/_agent-api/authorize'
import { operations } from '@/app/(project)/_agent-api/operations'
import config from '@/config/modules/agent-api.json'
import { createServerDb } from '@/lib/db/server'
import { supabaseKeyStore, supabaseRateLimiter, supabaseRequestLogger } from './stores'
import type { AgentApiDeps, AgentApiSettings } from './types'

const DEFAULTS = {
  defaultRateLimit: { limit: 60, windowSeconds: 60 },
  anonymousRateLimit: { limit: 20, windowSeconds: 60 },
  selfRegistration: { enabled: false, scopes: ['read'], perHour: 5 },
  logRequests: true,
}

/** Config as written by the platform (already validated); defaults filled in defensively. */
export function settings(): AgentApiSettings {
  const c = config as unknown as Partial<AgentApiSettings> & Pick<AgentApiSettings, 'name' | 'description' | 'operations'>
  return {
    ...DEFAULTS,
    ...c,
    operations: c.operations.map((o) => ({ ...o, public: o.public ?? false, input: o.input ?? { type: 'object', properties: {} } })),
    selfRegistration: { ...DEFAULTS.selfRegistration, ...(c.selfRegistration ?? {}) },
  }
}

export function agentApiDeps(): AgentApiDeps {
  const db = createServerDb()
  return {
    settings: settings(),
    handlers: operations,
    keys: supabaseKeyStore(db),
    rate: supabaseRateLimiter(db),
    logger: supabaseRequestLogger(db),
    authorize,
  }
}
