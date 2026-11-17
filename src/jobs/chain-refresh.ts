/** Built-in job (when snapshots are enabled): refreshes chain_snapshots on the configured schedule. */
import config from '@/config/modules/chain.json'
import { createChainReader } from '@/lib/chain/client'
import { refreshSnapshots, type Watch } from '@/lib/chain/snapshots'
import { createServerDb } from '@/lib/db/server'
import { defineJob } from '@/lib/jobs/define'

const snapshots = (config as { snapshots?: { schedule?: string; watch?: Watch[] } }).snapshots ?? {}

export const chainRefresh = defineJob({
  name: 'chain-refresh',
  schedule: snapshots.schedule ?? '*/10 * * * *',
  description: 'Refresh cached chain values',
  retryMissed: false, // only the latest values matter
  maxAttempts: 2,
  async run() {
    return refreshSnapshots(createChainReader(), snapshots.watch ?? [], createServerDb())
  },
})
