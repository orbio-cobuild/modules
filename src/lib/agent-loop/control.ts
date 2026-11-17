/** Pause, resume and status. Safe to call from server routes and server actions. */
import type { AgentConfig } from './config'
import type { AgentStore, PausedReason } from './store'

export interface AgentStatus {
  agent: string
  paused: boolean
  pausedReason: PausedReason | null
  /** Plain English, for the feed and the builder. */
  statusText: string
  schedule: string
  spentTodayMicro: string
  dailyCapMicro: string
  perRunCapMicro: string
}

const utcDayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

export async function pauseAgent(store: AgentStore, agent: string): Promise<void> {
  await store.setPaused(agent, true, 'owner')
}

/** Resumes an agent the owner paused. A budget pause lifts by itself when the next UTC day starts. */
export async function resumeAgent(store: AgentStore, agent: string): Promise<void> {
  await store.setPaused(agent, false, null)
}

export async function agentStatus(store: AgentStore, config: AgentConfig, now = new Date()): Promise<AgentStatus> {
  const state = (await store.getState(config.agent)) ?? { paused: config.paused, pausedReason: config.paused ? ('owner' as const) : null }
  const spent = await store.spentSince(config.agent, utcDayStart(now))
  const statusText = !state.paused
    ? 'Running on schedule'
    : state.pausedReason === 'budget'
      ? "Paused: today's budget is used up. It starts again tomorrow (UTC)."
      : state.pausedReason === 'error'
        ? 'Paused after repeated problems'
        : 'Paused by the owner'
  return {
    agent: config.agent,
    paused: state.paused,
    pausedReason: state.pausedReason,
    statusText,
    schedule: config.schedule,
    spentTodayMicro: spent.toString(),
    dailyCapMicro: config.budget.dailyMicro,
    perRunCapMicro: config.budget.perRunMicro,
  }
}
