/** The agent-loop job: one agent run per cron slot. Only the latest slot matters, so no catch-up retries. */
import rawConfig from '@/config/modules/agent-loop.json'
import { agentConfigSchema } from '@/lib/agent-loop/config'
import { runAgentOnce } from '@/lib/agent-loop/runner'
import { agentDeps } from '@/lib/agent-loop/server'
import { defineJob } from '@/lib/jobs/define'

const config = agentConfigSchema.parse(rawConfig)

export const agentLoopJob = defineJob({
  name: 'agent-loop',
  schedule: config.schedule,
  description: 'Run the agent once',
  maxAttempts: 1,
  retryMissed: false,
  timeoutMs: config.timeoutSeconds * 1000,
  async run(ctx) {
    const outcome = await runAgentOnce(agentDeps({ config }), { slotKey: ctx.key, trigger: ctx.trigger, signal: ctx.signal })
    return { status: outcome.status, reason: outcome.reason, runId: outcome.runId ?? null, totalCostMicro: outcome.totalCostMicro }
  },
})
