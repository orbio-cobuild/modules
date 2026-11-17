import { parseCron } from './cron'
import type { JobDefinition, JobInput } from './types'

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/

/** Declare a job. Validates the name and schedule up front so mistakes fail at build time. */
export function defineJob<Out>(input: JobInput<Out>): JobDefinition<Out> {
  if (!NAME.test(input.name)) throw new Error(`Job name "${input.name}" must be lower-case letters, numbers and dashes.`)
  parseCron(input.schedule)
  const job: JobDefinition<Out> = {
    maxAttempts: 3,
    leaseSeconds: 300,
    retryBaseSeconds: 60,
    timeoutMs: 50_000,
    retryMissed: true,
    ...input,
  }
  if (job.maxAttempts < 1 || job.maxAttempts > 20) throw new Error('maxAttempts must be between 1 and 20.')
  if (job.timeoutMs / 1000 >= job.leaseSeconds) throw new Error('timeoutMs must be shorter than leaseSeconds.')
  return job
}

export function retryDelaySeconds(job: Pick<JobDefinition, 'retryBaseSeconds'>, attempt: number): number {
  return Math.min(job.retryBaseSeconds * 2 ** Math.max(attempt - 1, 0), 3600)
}
