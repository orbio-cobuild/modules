/** The whole feed, given its data. Pure, so it renders the same on the server, in tests and in previews. */
import type { MindFeedConfig } from '@/lib/mind-feed/config'
import type { AgentStateView, FeedRun, FeedSummary } from '@/lib/mind-feed/data'
import { FeedItem } from './FeedItem'
import { StatsBar } from './StatsBar'

export interface MindFeedViewProps {
  config: MindFeedConfig
  runs: FeedRun[]
  summary: FeedSummary
  state: AgentStateView | null
  nextBefore: string | null
  /** Base path for "Older runs" links. */
  basePath?: string
  now?: Date
}

export function MindFeedView({ config, runs, summary, state, nextBefore, basePath = '/agent', now }: MindFeedViewProps) {
  return (
    <div data-mind-feed={config.agent} className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{config.title}</h1>
        <p className="text-muted-foreground">{config.description}</p>
      </header>
      <StatsBar summary={summary} state={state} treasuryLabel={config.treasury.label} treasuryNote={config.treasury.note} now={now} />
      {runs.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No runs yet. The first one will show up here as soon as the agent thinks.
        </p>
      ) : (
        <ol className="space-y-3">
          {runs.map((run) => (
            <li key={run.id}>
              <FeedItem run={run} showInputs={config.showInputs} showCosts={config.showCosts} now={now} />
            </li>
          ))}
        </ol>
      )}
      {nextBefore && (
        <nav className="text-center">
          <a className="text-sm underline underline-offset-4" href={`${basePath}?before=${encodeURIComponent(nextBefore)}`}>
            Older runs
          </a>
        </nav>
      )}
      {config.showCosts && (
        <p className="text-xs text-muted-foreground">Costs are in US dollars (1 CREDIT = $1). “Estimate” means the provider didn’t report the exact charge, so the cap is shown.</p>
      )}
    </div>
  )
}
