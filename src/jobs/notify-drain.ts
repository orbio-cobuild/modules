/** Sends approved messages from the outbox and chases approvals. Only the latest slot matters. */
import config from '@/config/modules/notify.json'
import { defineJob } from '@/lib/jobs/define'
import { drainOutbox } from '@/lib/notify/outbox'
import { notifyDeps } from '@/lib/notify/server'

export const notifyDrain = defineJob({
  name: 'notify-drain',
  schedule: config.drainSchedule ?? '*/5 * * * *',
  description: 'Send approved notifications',
  maxAttempts: 1,
  retryMissed: false,
  async run() {
    return drainOutbox(notifyDeps())
  },
})
