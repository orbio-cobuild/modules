/** Plain-English formatting for the feed. */
export { formatUsd } from '@/lib/agent-loop/money'

export function timeAgo(iso: string, now: Date = new Date()): string {
  const secs = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function runwayText(days: number | null): string {
  if (days === null) return '—'
  if (days >= 365) return 'Over a year'
  if (days >= 1) return `${days >= 10 ? Math.round(days) : days.toFixed(1)} days`
  return 'Under a day'
}

export function confidenceText(c: unknown): string | null {
  return typeof c === 'number' && c >= 0 && c <= 1 ? `${Math.round(c * 100)}% sure` : null
}

export const STATUS_LABEL: Record<string, string> = {
  running: 'Thinking…',
  succeeded: 'Decided',
  failed: 'Problem',
  skipped: 'Skipped',
}

export const ACTION_LABEL: Record<string, string> = {
  none: 'No action',
  done: 'Done',
  awaiting_approval: 'Waiting for the owner',
  blocked: 'Blocked',
  failed: "Didn't complete",
}

export function pausedText(state: { paused: boolean; pausedReason: string | null } | null): string {
  if (!state || !state.paused) return 'Running'
  if (state.pausedReason === 'budget') return "Paused until tomorrow: today's budget is used up"
  if (state.pausedReason === 'error') return 'Paused after repeated problems'
  return 'Paused by the owner'
}
