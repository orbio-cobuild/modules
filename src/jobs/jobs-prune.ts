/** Built-in job: deletes finished job runs and processed webhook events older than config.keepDays. */
import config from '@/config/modules/jobs.json'
import { createServerDb } from '@/lib/db/server'
import { defineJob } from '@/lib/jobs/define'

export const jobsPrune = defineJob({
  name: 'jobs-prune',
  schedule: '17 3 * * *',
  description: 'Delete old job runs and webhook events',
  retryMissed: false,
  async run() {
    const keepDays = Math.max(1, Math.min(365, Number(config.keepDays) || 30))
    const { data, error } = await createServerDb().rpc('job_runs_prune', { p_keep_days: keepDays })
    if (error) throw new Error(`Prune failed: ${error.message}`)
    return { deleted: Number(data ?? 0), keepDays }
  },
})
