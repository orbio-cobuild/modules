/**
 * Reads the public run log (agent_runs, agent_state, agent_feed_stats) with any Supabase client.
 * Everything here is public data; nothing reads agent_run_private.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface FeedInput {
  id: string
  kind: string
  label: string
  ok: boolean
  summary: string
  costMicro: bigint
  estimated: boolean
}

export interface FeedRun {
  id: string
  status: 'running' | 'succeeded' | 'failed' | 'skipped'
  startedAt: string
  durationMs: number | null
  model: string | null
  reasoning: string | null
  decision: { action?: string; summary?: string; confidence?: number; [k: string]: unknown } | null
  action: { kind: string; summary: string } | null
  inputs: FeedInput[]
  inputCostMicro: bigint
  modelCostMicro: bigint
  totalCostMicro: bigint
  costEstimated: boolean
  error: string | null
  isSample: boolean
}

export interface FeedStats {
  spentTodayMicro: bigint
  runsToday: number
  avgDailySpendMicro: bigint
  windowDays: number
  lastRunAt: string | null
}

export interface FeedSummary extends FeedStats {
  dailyCapMicro: bigint | null
  budgetLeftTodayMicro: bigint | null
  treasuryMicro: bigint | null
  /** treasury / average daily spend, in days; null when either is unknown or spend is zero. */
  runwayDays: number | null
}

export interface AgentStateView {
  paused: boolean
  pausedReason: 'owner' | 'budget' | 'error' | null
}

export const RUN_COLUMNS =
  'id, status, started_at, duration_ms, model, public_reasoning, decision, action, inputs, input_cost_micro, model_cost_micro, total_cost_micro, cost_estimated, error, is_sample'

const big = (v: unknown): bigint => {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v))
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return BigInt(v)
  return 0n
}

export function mapRun(row: Record<string, unknown>): FeedRun {
  const inputs = Array.isArray(row.inputs) ? (row.inputs as Array<Record<string, unknown>>) : []
  return {
    id: String(row.id),
    status: row.status as FeedRun['status'],
    startedAt: String(row.started_at),
    durationMs: typeof row.duration_ms === 'number' ? row.duration_ms : null,
    model: (row.model as string | null) ?? null,
    reasoning: (row.public_reasoning as string | null) ?? null,
    decision: (row.decision as FeedRun['decision']) ?? null,
    action: (row.action as FeedRun['action']) ?? null,
    inputs: inputs.map((i) => ({
      id: String(i.id ?? ''),
      kind: String(i.kind ?? ''),
      label: String(i.label ?? ''),
      ok: i.ok !== false,
      summary: String(i.summary ?? ''),
      costMicro: big(i.costMicro),
      estimated: i.estimated === true,
    })),
    inputCostMicro: big(row.input_cost_micro),
    modelCostMicro: big(row.model_cost_micro),
    totalCostMicro: big(row.total_cost_micro),
    costEstimated: row.cost_estimated === true,
    error: (row.error as string | null) ?? null,
    isSample: row.is_sample === true,
  }
}

/** Newest first. `before` is an ISO time (exclusive) for the next page. */
export async function fetchFeed(
  db: SupabaseClient,
  opts: { agent: string; limit: number; before?: string | null },
): Promise<{ runs: FeedRun[]; nextBefore: string | null }> {
  let q = db
    .from('agent_runs')
    .select(RUN_COLUMNS)
    .eq('agent', opts.agent)
    .neq('status', 'skipped')
    .order('started_at', { ascending: false })
    .limit(opts.limit + 1)
  if (opts.before && !Number.isNaN(Date.parse(opts.before))) q = q.lt('started_at', new Date(opts.before).toISOString())
  const { data, error } = await q
  if (error) throw new Error(`agent_runs read failed: ${error.message}`)
  const rows = ((data ?? []) as Array<Record<string, unknown>>).map(mapRun)
  const more = rows.length > opts.limit
  const runs = rows.slice(0, opts.limit)
  return { runs, nextBefore: more ? (runs.at(-1)?.startedAt ?? null) : null }
}

export async function fetchStats(db: SupabaseClient, agent: string, windowDays: number): Promise<FeedStats> {
  const { data, error } = await db.rpc('agent_feed_stats', { p_agent: agent, p_days: windowDays })
  if (error) throw new Error(`agent_feed_stats failed: ${error.message}`)
  const s = (data ?? {}) as Record<string, unknown>
  return {
    spentTodayMicro: big(s.spentTodayMicro),
    runsToday: Number(s.runsToday ?? 0),
    avgDailySpendMicro: big(s.avgDailySpendMicro),
    windowDays: Number(s.windowDays ?? windowDays),
    lastRunAt: (s.lastRunAt as string | null) ?? null,
  }
}

export async function fetchAgentState(db: SupabaseClient, agent: string): Promise<AgentStateView | null> {
  const { data, error } = await db.from('agent_state').select('paused, paused_reason').eq('agent', agent).maybeSingle()
  if (error) throw new Error(`agent_state read failed: ${error.message}`)
  return data ? { paused: data.paused as boolean, pausedReason: (data.paused_reason as AgentStateView['pausedReason']) ?? null } : null
}

export function summarise(stats: FeedStats, opts: { dailyCapMicro?: bigint | null; treasuryMicro?: bigint | null }): FeedSummary {
  const cap = opts.dailyCapMicro ?? null
  const treasury = opts.treasuryMicro ?? null
  const left = cap === null ? null : cap > stats.spentTodayMicro ? cap - stats.spentTodayMicro : 0n
  const runwayDays =
    treasury !== null && stats.avgDailySpendMicro > 0n ? Number((treasury * 10n) / stats.avgDailySpendMicro) / 10 : null
  return { ...stats, dailyCapMicro: cap, budgetLeftTodayMicro: left, treasuryMicro: treasury, runwayDays }
}

/** JSON-safe copy (bigint as string) for API responses. */
export function toJsonSafe<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
}
