/** One run on the public timeline. Pure: safe in server and client components. */
import type { FeedRun } from '@/lib/mind-feed/data'
import { ACTION_LABEL, confidenceText, formatUsd, STATUS_LABEL, timeAgo } from '@/lib/mind-feed/format'

export interface FeedItemProps {
  run: FeedRun
  showInputs?: boolean
  showCosts?: boolean
  now?: Date
}

const statusTone: Record<string, string> = {
  succeeded: 'bg-primary/10 text-primary',
  running: 'bg-muted text-muted-foreground',
  failed: 'bg-destructive/10 text-destructive',
  skipped: 'bg-muted text-muted-foreground',
}

export function FeedItem({ run, showInputs = true, showCosts = true, now }: FeedItemProps) {
  const confidence = confidenceText(run.decision?.confidence)
  return (
    <article id={`run-${run.id}`} data-run-id={run.id} className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      <header className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className={`rounded px-2 py-0.5 font-medium ${statusTone[run.status] ?? ''}`}>{STATUS_LABEL[run.status] ?? run.status}</span>
        <time dateTime={run.startedAt} title={new Date(run.startedAt).toUTCString()}>
          {timeAgo(run.startedAt, now)}
        </time>
        {run.decision?.action && <span className="rounded border px-2 py-0.5 font-mono">{run.decision.action}</span>}
        {confidence && <span>{confidence}</span>}
        {run.isSample && <span className="rounded bg-muted px-2 py-0.5">Sample</span>}
        {showCosts && (
          <span className="ml-auto tabular-nums" title={`Inputs ${formatUsd(run.inputCostMicro)} · Model ${formatUsd(run.modelCostMicro)}`}>
            {formatUsd(run.totalCostMicro)}
            {run.costEstimated && ' (estimate)'}
          </span>
        )}
      </header>

      {run.decision?.summary && <h3 className="mt-2 font-medium">{run.decision.summary}</h3>}
      {run.error ? (
        <p className="mt-2 text-sm text-destructive">{run.error}</p>
      ) : (
        run.reasoning && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{run.reasoning}</p>
      )}

      {run.action && run.action.kind !== 'none' && (
        <p className="mt-2 text-sm">
          <span className="font-medium">{ACTION_LABEL[run.action.kind] ?? 'Action'}:</span> {run.action.summary}
        </p>
      )}

      {showInputs && run.inputs.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">What it looked at ({run.inputs.length})</summary>
          <ul className="mt-2 space-y-1">
            {run.inputs.map((i) => (
              <li key={i.id} className="flex gap-2">
                <span className={i.ok ? '' : 'text-muted-foreground line-through'}>{i.label}</span>
                <span className="text-muted-foreground">{i.summary}</span>
                {showCosts && (
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {formatUsd(i.costMicro)}
                    {i.estimated && '*'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  )
}
