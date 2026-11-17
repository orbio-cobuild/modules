/** Loads everything the feed page and API need, as a visitor would see it (publishable key only). */
import 'server-only'
import agentLoopConfig from '@/config/modules/agent-loop.json'
import rawConfig from '@/config/modules/mind-feed.json'
import { createPublicDb } from '@/lib/db/server'
import { mindFeedConfigSchema, type MindFeedConfig } from './config'
import { fetchAgentState, fetchFeed, fetchStats, summarise, type AgentStateView, type FeedRun, type FeedSummary } from './data'

let cached: MindFeedConfig | undefined
export function mindFeedConfig(): MindFeedConfig {
  cached ??= mindFeedConfigSchema.parse(rawConfig)
  return cached
}

export interface FeedPageData {
  config: MindFeedConfig
  runs: FeedRun[]
  nextBefore: string | null
  summary: FeedSummary
  state: AgentStateView | null
}

export async function loadFeed(opts: { before?: string | null; limit?: number } = {}): Promise<FeedPageData> {
  const config = mindFeedConfig()
  const db = createPublicDb()
  const daily = (agentLoopConfig as { budget?: { dailyMicro?: string } }).budget?.dailyMicro
  const [{ runs, nextBefore }, stats, state] = await Promise.all([
    fetchFeed(db, { agent: config.agent, limit: Math.min(opts.limit ?? config.pageSize, 50), before: opts.before ?? null }),
    fetchStats(db, config.agent, config.statsWindowDays),
    fetchAgentState(db, config.agent),
  ])
  const summary = summarise(stats, {
    dailyCapMicro: daily ? BigInt(daily) : null,
    treasuryMicro: config.treasury.micro ? BigInt(config.treasury.micro) : null,
  })
  return { config, runs, nextBefore, summary, state }
}
