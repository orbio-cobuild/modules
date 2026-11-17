/**
 * Minimal 5-field cron (UTC), the dialect Vercel accepts: numbers, `*`, `a-b`, `a,b`, `*\/n`, `a-b/n`.
 * No names (MON, JAN) and no seconds field.
 */
export interface CronSpec {
  minute: Set<number>
  hour: Set<number>
  dom: Set<number>
  month: Set<number>
  dow: Set<number>
  domAny: boolean
  dowAny: boolean
}

const FIELDS: Array<[name: string, min: number, max: number]> = [
  ['minute', 0, 59],
  ['hour', 0, 23],
  ['day of month', 1, 31],
  ['month', 1, 12],
  ['day of week', 0, 6],
]

function parseField(text: string, [name, min, max]: [string, number, number]): Set<number> {
  const out = new Set<number>()
  for (const part of text.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part)
    if (!m) throw new Error(`The ${name} part "${part}" of the schedule isn't valid.`)
    const step = m[4] ? Number(m[4]) : 1
    let lo = min
    let hi = max
    if (m[1] !== '*') {
      lo = Number(m[2])
      hi = m[3] !== undefined ? Number(m[3]) : m[4] ? max : lo
    }
    if (step < 1 || lo < min || hi > max || lo > hi) {
      throw new Error(`The ${name} part "${part}" of the schedule is out of range (${min}-${max}).`)
    }
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out
}

export function parseCron(expr: string): CronSpec {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error(`A schedule needs 5 parts (minute hour day month weekday), got "${expr}".`)
  const [mi, h, dom, mo, dow] = parts.map((p, i) => parseField(p, FIELDS[i]!))
  return { minute: mi!, hour: h!, dom: dom!, month: mo!, dow: dow!, domAny: parts[2] === '*', dowAny: parts[4] === '*' }
}

export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr)
    return true
  } catch {
    return false
  }
}

function dayMatches(s: CronSpec, d: Date): boolean {
  const domOk = s.dom.has(d.getUTCDate())
  const dowOk = s.dow.has(d.getUTCDay())
  // Standard cron: when both are restricted, either may match.
  if (s.domAny && s.dowAny) return true
  if (s.domAny) return dowOk
  if (s.dowAny) return domOk
  return domOk || dowOk
}

export function cronMatches(expr: string | CronSpec, at: Date): boolean {
  const s = typeof expr === 'string' ? parseCron(expr) : expr
  return (
    s.minute.has(at.getUTCMinutes()) && s.hour.has(at.getUTCHours()) && s.month.has(at.getUTCMonth() + 1) && dayMatches(s, at)
  )
}

/** The most recent scheduled minute at or before `now` (UTC). Used as the run's idempotency slot. */
export function previousRun(expr: string | CronSpec, now: Date): Date {
  const s = typeof expr === 'string' ? parseCron(expr) : expr
  const t = new Date(now)
  t.setUTCSeconds(0, 0)
  const limit = now.getTime() - 366 * 24 * 3600 * 1000
  while (t.getTime() >= limit) {
    if (!s.month.has(t.getUTCMonth() + 1)) {
      t.setUTCDate(1)
      t.setUTCHours(0, 0, 0, 0)
      t.setTime(t.getTime() - 60_000) // last minute of previous month
      continue
    }
    if (!dayMatches(s, t)) {
      t.setUTCHours(0, 0, 0, 0)
      t.setTime(t.getTime() - 60_000)
      continue
    }
    if (!s.hour.has(t.getUTCHours())) {
      t.setUTCMinutes(0)
      t.setTime(t.getTime() - 60_000)
      continue
    }
    if (s.minute.has(t.getUTCMinutes())) return t
    t.setTime(t.getTime() - 60_000)
  }
  throw new Error(`The schedule "${typeof expr === 'string' ? expr : 'given'}" never runs.`)
}

/** Smallest gap between two runs, in minutes, looking at one week. Vercel Hobby only allows daily crons. */
export function minIntervalMinutes(expr: string): number {
  const s = parseCron(expr)
  const start = Date.UTC(2026, 0, 5) // a Monday
  let prev: number | undefined
  let min = Infinity
  for (let m = 0; m < 8 * 24 * 60; m++) {
    const at = new Date(start + m * 60_000)
    if (cronMatches(s, at)) {
      if (prev !== undefined) min = Math.min(min, m - prev)
      prev = m
    }
  }
  return min
}
