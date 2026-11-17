/**
 * Runs a job once per slot. No timers: a run happens only when a request arrives
 * (Vercel cron, Supabase cron, our platform, or a manual POST). Retries happen on later ticks.
 */
import { previousRun } from './cron'
import { retryDelaySeconds } from './define'
import type { JobStore } from './store'
import type { JobDefinition, JobLogger, JobTrigger, RunOutcome } from './types'

export interface RunOptions {
  store: JobStore
  now?: Date
  trigger?: JobTrigger
  /** Use this key instead of the slot key (manual runs, retries). */
  key?: string
  log?: JobLogger
}

const consoleLog = (job: string): JobLogger => ({
  info: (m, d) => console.log(`[job:${job}] ${m}`, d ?? ''),
  error: (m, d) => console.error(`[job:${job}] ${m}`, d ?? ''),
})

export function slotKey(job: Pick<JobDefinition, 'name' | 'schedule' | 'idempotencyKey'>, now: Date): { key: string; slot: Date } {
  const slot = previousRun(job.schedule, now)
  return { slot, key: job.idempotencyKey ? job.idempotencyKey(slot) : `${job.name}:${slot.toISOString().slice(0, 16)}Z` }
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.name === 'TimeoutError' ? 'The job took too long and was stopped.' : err.message
  return String(err)
}

export async function runJob(job: JobDefinition, opts: RunOptions): Promise<RunOutcome> {
  const now = opts.now ?? new Date()
  const trigger = opts.trigger ?? 'cron'
  const log = opts.log ?? consoleLog(job.name)
  const { slot, key: slotK } = slotKey(job, now)
  const key = opts.key ?? slotK

  const claim = await opts.store.claim(job.name, key, job.maxAttempts, job.leaseSeconds, trigger)
  if (!claim.claimed) {
    return { job: job.name, key, status: 'skipped', reason: claim.reason, runId: claim.runId, attempt: claim.attempt }
  }

  const started = Date.now()
  try {
    const output = await job.run({ key, attempt: claim.attempt, trigger, scheduledFor: slot, signal: AbortSignal.timeout(job.timeoutMs), log })
    const status = await opts.store.finish(claim.runId, claim.attempt, true, output, null, 0)
    return {
      job: job.name,
      key,
      status: status === null ? 'skipped' : 'succeeded',
      reason: status === null ? 'stale' : claim.reason,
      runId: claim.runId,
      attempt: claim.attempt,
      output,
      durationMs: Date.now() - started,
    }
  } catch (err) {
    const error = errorText(err)
    log.error('failed', { key, attempt: claim.attempt, error })
    const status = await opts.store.finish(claim.runId, claim.attempt, false, null, error, retryDelaySeconds(job, claim.attempt))
    return {
      job: job.name,
      key,
      status: status === 'dead' ? 'dead' : status === null ? 'skipped' : 'failed',
      reason: status === null ? 'stale' : claim.reason,
      runId: claim.runId,
      attempt: claim.attempt,
      error,
      durationMs: Date.now() - started,
    }
  }
}

/** What a cron tick does: retry this job's due failures (if retryMissed), then run the current slot. */
export async function runScheduled(job: JobDefinition, opts: Omit<RunOptions, 'key' | 'trigger'>) {
  const retries: RunOutcome[] = []
  if (job.retryMissed) {
    const current = slotKey(job, opts.now ?? new Date()).key
    for (const due of await opts.store.dueRetries(job.name, 3)) {
      if (due.key === current) continue
      retries.push(await runJob(job, { ...opts, key: due.key, trigger: 'retry' }))
    }
  }
  const current = await runJob(job, { ...opts, trigger: 'cron' })
  return { current, retries }
}
