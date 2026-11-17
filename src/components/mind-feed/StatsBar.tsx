/** Header numbers: spend today, budget left, average per day, treasury and runway. Pure. */
import type { AgentStateView, FeedSummary } from '@/lib/mind-feed/data'
import { formatUsd, pausedText, runwayText, timeAgo } from '@/lib/mind-feed/format'

export interface StatsBarProps {
  summary: FeedSummary
  state: AgentStateView | null
  treasuryLabel?: string
  treasuryNote?: string
  now?: Date
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-card-foreground">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

export function StatsBar({ summary, state, treasuryLabel = 'Treasury', treasuryNote, now }: StatsBarProps) {
  const dash = '—'
  return (
    <section aria-label="Agent stats" className="space-y-3">
      <p className="text-sm">
        <span className={`mr-2 inline-block h-2 w-2 rounded-full ${state?.paused ? 'bg-muted-foreground' : 'bg-primary'}`} />
        {pausedText(state)}
        {summary.lastRunAt && <span className="text-muted-foreground"> · last run {timeAgo(summary.lastRunAt, now)}</span>}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Spent today" value={formatUsd(summary.spentTodayMicro)} hint={`${summary.runsToday} run${summary.runsToday === 1 ? '' : 's'}`} />
        <Stat
          label="Budget left today"
          value={summary.budgetLeftTodayMicro === null ? dash : formatUsd(summary.budgetLeftTodayMicro)}
          hint={summary.dailyCapMicro === null ? undefined : `of ${formatUsd(summary.dailyCapMicro)}`}
        />
        <Stat label="Average per day" value={formatUsd(summary.avgDailySpendMicro)} hint={`last ${summary.windowDays} day${summary.windowDays === 1 ? '' : 's'}`} />
        <Stat
          label={summary.treasuryMicro === null ? 'Runway' : `${treasuryLabel} · runway`}
          value={summary.treasuryMicro === null ? dash : `${formatUsd(summary.treasuryMicro)} · ${runwayText(summary.runwayDays)}`}
          hint={summary.treasuryMicro === null ? 'No treasury figure set' : treasuryNote}
        />
      </div>
    </section>
  )
}
