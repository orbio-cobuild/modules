/** Where runs and pause state are kept. supabaseAgentStore is the real one; memoryAgentStore is for tests and previews. */
import type { SupabaseClient } from '@supabase/supabase-js'

export type PausedReason = 'owner' | 'budget' | 'error'
export interface AgentState {
  paused: boolean
  pausedReason: PausedReason | null
}

export interface PublicInput {
  id: string
  kind: string
  label: string
  ok: boolean
  summary: string
  costMicro: string
  estimated: boolean
}

export interface RunPatch {
  status: 'succeeded' | 'failed' | 'skipped'
  finishedAt: Date
  durationMs: number
  model: string | null
  inputs: PublicInput[]
  publicReasoning: string | null
  decision: Record<string, unknown> | null
  action: { kind: 'none' | 'done' | 'awaiting_approval' | 'blocked' | 'failed'; summary: string } | null
  claimsFlags: string[]
  inputCostMicro: bigint
  modelCostMicro: bigint
  totalCostMicro: bigint
  costEstimated: boolean
  error: string | null
}

export interface RunPrivate {
  rawReasoning: string | null
  rawDecision: unknown
  rawInputs: unknown
}

export interface AgentStore {
  /** null when the agent has no state row yet (the config's `paused` applies). */
  getState(agent: string): Promise<AgentState | null>
  setPaused(agent: string, paused: boolean, reason: PausedReason | null): Promise<void>
  /** Real (non-sample) spend since `since`. */
  spentSince(agent: string, since: Date): Promise<bigint>
  /** Returns the new run id, or null when this slot already has a run. */
  startRun(run: { agent: string; slotKey: string; trigger: string; startedAt: Date }): Promise<string | null>
  finishRun(id: string, patch: RunPatch, priv: RunPrivate): Promise<void>
}

const jsonSafe = (v: unknown) => JSON.parse(JSON.stringify(v ?? null, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)))

export function supabaseAgentStore(db: SupabaseClient): AgentStore {
  return {
    async getState(agent) {
      const { data, error } = await db.from('agent_state').select('paused, paused_reason').eq('agent', agent).maybeSingle()
      if (error) throw new Error(`agent_state read failed: ${error.message}`)
      return data ? { paused: data.paused as boolean, pausedReason: (data.paused_reason as PausedReason | null) ?? null } : null
    },
    async setPaused(agent, paused, reason) {
      const { error } = await db
        .from('agent_state')
        .upsert({ agent, paused, paused_reason: paused ? reason : null, paused_at: paused ? new Date().toISOString() : null }, { onConflict: 'agent' })
      if (error) throw new Error(`agent_state write failed: ${error.message}`)
    },
    async spentSince(agent, since) {
      const { data, error } = await db.rpc('agent_spent_since', { p_agent: agent, p_since: since.toISOString() })
      if (error) throw new Error(`agent_spent_since failed: ${error.message}`)
      return BigInt(String(data ?? 0))
    },
    async startRun(run) {
      const { data, error } = await db
        .from('agent_runs')
        .insert({ agent: run.agent, slot_key: run.slotKey, status: 'running', trigger: run.trigger, started_at: run.startedAt.toISOString() })
        .select('id')
        .single()
      if (error?.code === '23505') return null
      if (error) throw new Error(`agent_runs insert failed: ${error.message}`)
      return data.id as string
    },
    async finishRun(id, p, priv) {
      const { error } = await db
        .from('agent_runs')
        .update({
          status: p.status,
          finished_at: p.finishedAt.toISOString(),
          duration_ms: p.durationMs,
          model: p.model,
          inputs: p.inputs,
          public_reasoning: p.publicReasoning,
          decision: jsonSafe(p.decision),
          action: p.action,
          claims_flags: p.claimsFlags,
          input_cost_micro: p.inputCostMicro.toString(),
          model_cost_micro: p.modelCostMicro.toString(),
          total_cost_micro: p.totalCostMicro.toString(),
          cost_estimated: p.costEstimated,
          error: p.error,
        })
        .eq('id', id)
      if (error) throw new Error(`agent_runs update failed: ${error.message}`)
      const { error: e2 } = await db
        .from('agent_run_private')
        .upsert({ run_id: id, raw_reasoning: priv.rawReasoning, raw_decision: jsonSafe(priv.rawDecision), raw_inputs: jsonSafe(priv.rawInputs) })
      if (e2) throw new Error(`agent_run_private write failed: ${e2.message}`)
    },
  }
}

export interface MemoryRun extends Partial<Omit<RunPatch, 'status'>> {
  id: string
  agent: string
  slotKey: string
  trigger: string
  startedAt: Date
  status: 'running' | RunPatch['status']
  private?: RunPrivate
}

export function memoryAgentStore() {
  const runs: MemoryRun[] = []
  const states = new Map<string, AgentState>()
  let seq = 0
  const store: AgentStore & { runs: MemoryRun[]; states: Map<string, AgentState> } = {
    runs,
    states,
    async getState(agent) {
      return states.get(agent) ?? null
    },
    async setPaused(agent, paused, reason) {
      states.set(agent, { paused, pausedReason: paused ? reason : null })
    },
    async spentSince(agent, since) {
      return runs.filter((r) => r.agent === agent && r.startedAt >= since).reduce((s, r) => s + (r.totalCostMicro ?? 0n), 0n)
    },
    async startRun(run) {
      if (runs.some((r) => r.agent === run.agent && r.slotKey === run.slotKey)) return null
      const id = `run-${++seq}`
      runs.push({ id, ...run, status: 'running' })
      return id
    },
    async finishRun(id, patch, priv) {
      const r = runs.find((x) => x.id === id)
      if (r) Object.assign(r, patch, { private: priv })
    },
  }
  return store
}
