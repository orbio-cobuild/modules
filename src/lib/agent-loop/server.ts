/**
 * Server wiring for the generated app: config, store, Orbio client, model, action hook, approvals.
 * Server-only (reads ORBIO_API_KEY and uses the server db client).
 */
import 'server-only'
import rawConfig from '@/config/modules/agent-loop.json'
import { approvals as projectApprovals, onDecision } from '@/app/(project)/_agent/actions'
import { createServerDb } from '@/lib/db/server'
import { outboxApprovals } from './approvals'
import { agentConfigSchema, type AgentConfig } from './config'
import { createGatewayModel } from './gateway-model'
import { createOrbioToolClient } from './orbio-http'
import type { AgentDeps } from './runner'
import { supabaseAgentStore, type AgentStore } from './store'

let cached: AgentConfig | undefined
export function agentConfig(): AgentConfig {
  cached ??= agentConfigSchema.parse(rawConfig)
  return cached
}

export function agentStore(): AgentStore {
  return supabaseAgentStore(createServerDb())
}

export function agentDeps(overrides: Partial<AgentDeps> = {}): AgentDeps {
  const config = overrides.config ?? agentConfig()
  const apiKey = process.env.ORBIO_API_KEY ?? ''
  const db = createServerDb()
  return {
    config,
    store: supabaseAgentStore(db),
    orbio: createOrbioToolClient({ apiKey }),
    model: createGatewayModel({ apiKey, model: config.model.name, maxTokens: config.model.maxTokens }),
    onDecision,
    approvals: projectApprovals ?? outboxApprovals(db),
    projectId: process.env.COFOUNDER_PROJECT_ID ?? 'project',
    ...overrides,
  }
}
