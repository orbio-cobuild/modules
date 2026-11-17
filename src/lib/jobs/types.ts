export type JobTrigger = 'cron' | 'manual' | 'retry' | 'webhook' | 'check'

export interface JobLogger {
  info(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
}

export interface JobContext {
  /** The idempotency key of this run. Use it for any external call that must not repeat. */
  key: string
  attempt: number
  trigger: JobTrigger
  /** The cron slot this run belongs to. */
  scheduledFor: Date
  /** Aborts when the job's timeout passes. Pass it to fetch() and Orbio calls. */
  signal: AbortSignal
  log: JobLogger
}

export interface JobDefinition<Out = unknown> {
  /** lower-case-with-dashes; also the route: /api/jobs/<name> */
  name: string
  /** 5-field cron, UTC */
  schedule: string
  description?: string
  /** Total attempts per slot, first try included. Default 3. */
  maxAttempts: number
  /** How long a claimed run is protected from a second runner. Default 300 s. */
  leaseSeconds: number
  /** First retry delay; doubles each attempt, capped at 1 hour. Default 60 s. */
  retryBaseSeconds: number
  /** Abort signal fires after this long. Keep under the route's maxDuration. Default 50 s. */
  timeoutMs: number
  /** Retry earlier failed slots on each tick (default true). Set false when only the latest slot matters. */
  retryMissed: boolean
  /** Override the default key (`<name>:<slot ISO>`). */
  idempotencyKey?: (slot: Date) => string
  run(ctx: JobContext): Promise<Out>
}

export type JobInput<Out = unknown> = Pick<JobDefinition<Out>, 'name' | 'schedule' | 'run'> &
  Partial<Omit<JobDefinition<Out>, 'name' | 'schedule' | 'run'>>

export interface RunOutcome {
  job: string
  key: string
  status: 'succeeded' | 'failed' | 'dead' | 'skipped'
  /** new | retry | already_succeeded | running | retry_later | gave_up | stale */
  reason: string
  runId?: string
  attempt?: number
  output?: unknown
  error?: string
  durationMs?: number
}
