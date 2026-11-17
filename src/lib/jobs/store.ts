/**
 * Where job runs and webhook events are recorded. supabaseJobStore() is the real one; it calls the
 * SQL functions from migrations/0001_jobs.sql, which do the claiming atomically.
 * memoryJobStore() has the same rules, for tests and for previews without a database.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { JobTrigger } from './types'

export interface Claim {
  runId: string
  claimed: boolean
  status: 'running' | 'succeeded' | 'failed' | 'dead'
  attempt: number
  reason: 'new' | 'retry' | 'already_succeeded' | 'running' | 'retry_later' | 'gave_up'
}

export interface JobStore {
  claim(job: string, key: string, maxAttempts: number, leaseSeconds: number, trigger: JobTrigger): Promise<Claim>
  /** Returns the new status, or null when this attempt no longer owns the run. */
  finish(runId: string, attempt: number, ok: boolean, output: unknown, error: string | null, retryDelaySeconds: number): Promise<string | null>
  dueRetries(job: string, limit: number): Promise<Array<{ key: string; attempt: number }>>
  webhookClaim(source: string, eventId: string, payloadSha256?: string): Promise<{ claimed: boolean; reason: 'new' | 'retry' | 'duplicate' | 'in_progress' }>
  webhookFinish(source: string, eventId: string, ok: boolean, error?: string): Promise<void>
}

/** JSON-safe output: bigint becomes a string, everything else must already be JSON. */
export function toJson(value: unknown): unknown {
  if (value === undefined) return null
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} failed: ${res.error.message}`)
  return res.data as T
}

export function supabaseJobStore(db: SupabaseClient): JobStore {
  return {
    async claim(job, key, maxAttempts, leaseSeconds, trigger) {
      const rows = must(
        await db.rpc('job_claim', { p_job_name: job, p_key: key, p_max_attempts: maxAttempts, p_lease_seconds: leaseSeconds, p_trigger: trigger }),
        'job_claim',
      ) as Array<{ run_id: string; claimed: boolean; status: Claim['status']; attempt: number; reason: Claim['reason'] }>
      const r = rows[0]
      if (!r) throw new Error('job_claim returned nothing')
      return { runId: r.run_id, claimed: r.claimed, status: r.status, attempt: r.attempt, reason: r.reason }
    },
    async finish(runId, attempt, ok, output, error, retryDelaySeconds) {
      return must(
        await db.rpc('job_finish', {
          p_run_id: runId,
          p_attempt: attempt,
          p_ok: ok,
          p_output: toJson(output),
          p_error: error,
          p_retry_delay_seconds: retryDelaySeconds,
        }),
        'job_finish',
      ) as string | null
    },
    async dueRetries(job, limit) {
      const rows = must(await db.rpc('job_due_retries', { p_job_name: job, p_limit: limit }), 'job_due_retries') as Array<{
        idempotency_key: string
        attempt: number
      }>
      return rows.map((r) => ({ key: r.idempotency_key, attempt: r.attempt }))
    },
    async webhookClaim(source, eventId, payloadSha256) {
      const rows = must(
        await db.rpc('webhook_claim', { p_source: source, p_event_id: eventId, p_payload_sha256: payloadSha256 ?? null }),
        'webhook_claim',
      ) as Array<{ claimed: boolean; reason: 'new' | 'retry' | 'duplicate' | 'in_progress' }>
      return rows[0] ?? { claimed: false, reason: 'in_progress' }
    },
    async webhookFinish(source, eventId, ok, error) {
      must(await db.rpc('webhook_finish', { p_source: source, p_event_id: eventId, p_ok: ok, p_error: error ?? null }), 'webhook_finish')
    },
  }
}

interface MemRun {
  id: string
  job: string
  key: string
  status: Claim['status']
  attempt: number
  maxAttempts: number
  lockedUntil: number | null
  nextAttemptAt: number | null
  startedAt: number
  output?: unknown
  error?: string | null
}

/** Same rules as the SQL functions, kept in memory. `now` is injectable for tests. */
export function memoryJobStore(now: () => number = Date.now) {
  const runs = new Map<string, MemRun>()
  const hooks = new Map<string, { status: 'processing' | 'processed' | 'failed'; lockedUntil: number | null }>()
  let seq = 0
  const store: JobStore & { runs: Map<string, MemRun> } = {
    runs,
    async claim(job, key, maxAttempts, leaseSeconds, _trigger) {
      const id = `${job}\u0000${key}`
      const t = now()
      const r = runs.get(id)
      if (!r) {
        const run: MemRun = { id: `run-${++seq}`, job, key, status: 'running', attempt: 1, maxAttempts, lockedUntil: t + leaseSeconds * 1000, nextAttemptAt: null, startedAt: t }
        runs.set(id, run)
        return { runId: run.id, claimed: true, status: 'running', attempt: 1, reason: 'new' }
      }
      const base = { runId: r.id, attempt: r.attempt }
      if (r.status === 'succeeded') return { ...base, claimed: false, status: r.status, reason: 'already_succeeded' }
      if (r.status === 'dead') return { ...base, claimed: false, status: r.status, reason: 'gave_up' }
      if (r.status === 'running' && (r.lockedUntil ?? 0) > t) return { ...base, claimed: false, status: r.status, reason: 'running' }
      if (r.status === 'failed' && (r.nextAttemptAt ?? 0) > t) return { ...base, claimed: false, status: r.status, reason: 'retry_later' }
      if (r.attempt >= r.maxAttempts) {
        r.status = 'dead'
        r.lockedUntil = null
        return { ...base, claimed: false, status: 'dead', reason: 'gave_up' }
      }
      r.status = 'running'
      r.attempt += 1
      r.lockedUntil = t + leaseSeconds * 1000
      r.nextAttemptAt = null
      r.startedAt = t
      return { runId: r.id, claimed: true, status: 'running', attempt: r.attempt, reason: 'retry' }
    },
    async finish(runId, attempt, ok, output, error, retryDelaySeconds) {
      const r = [...runs.values()].find((x) => x.id === runId)
      if (!r || r.attempt !== attempt || r.status !== 'running') return null
      r.status = ok ? 'succeeded' : r.attempt >= r.maxAttempts ? 'dead' : 'failed'
      r.output = toJson(output)
      r.error = ok ? null : (error ?? 'Failed').slice(0, 2000)
      r.lockedUntil = null
      r.nextAttemptAt = r.status === 'failed' ? now() + Math.max(retryDelaySeconds, 0) * 1000 : null
      return r.status
    },
    async dueRetries(job, limit) {
      const t = now()
      return [...runs.values()]
        .filter((r) => r.job === job && ((r.status === 'failed' && (r.nextAttemptAt ?? 0) <= t) || (r.status === 'running' && (r.lockedUntil ?? 0) <= t)))
        .sort((a, b) => a.startedAt - b.startedAt)
        .slice(0, Math.max(Math.min(limit, 50), 0))
        .map((r) => ({ key: r.key, attempt: r.attempt }))
    },
    async webhookClaim(source, eventId) {
      const id = `${source}\u0000${eventId}`
      const t = now()
      const h = hooks.get(id)
      if (!h) {
        hooks.set(id, { status: 'processing', lockedUntil: t + 120_000 })
        return { claimed: true, reason: 'new' }
      }
      if (h.status === 'processed') return { claimed: false, reason: 'duplicate' }
      if (h.status === 'processing' && (h.lockedUntil ?? 0) > t) return { claimed: false, reason: 'in_progress' }
      h.status = 'processing'
      h.lockedUntil = t + 120_000
      return { claimed: true, reason: 'retry' }
    },
    async webhookFinish(source, eventId, ok) {
      const h = hooks.get(`${source}\u0000${eventId}`)
      if (h) {
        h.status = ok ? 'processed' : 'failed'
        h.lockedUntil = null
      }
    },
  }
  return store
}
