/**
 * How launchpad fees are split, from Orbio's live terms (cached hourly), with the
 * 6 Nov 2026 snapshot as a fallback. Shown before launch. Ported from the M1
 * template's token page during integration, so there is one token page.
 * Facts only: no price, return or profit statements.
 */
const SNAPSHOT = { feeBps: 1000, creditBps: 3000, gatewayBps: 1000, readAt: '2026-11-06' }

interface Terms {
  feeBps: number
  creditBps: number
  gatewayBps: number
  live: boolean
}

async function liveTerms(baseUrl: string): Promise<Terms> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/protocol/agents/terms`, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(String(res.status))
    const t = (await res.json()) as Partial<Terms>
    if (typeof t.feeBps !== 'number' || typeof t.creditBps !== 'number' || typeof t.gatewayBps !== 'number') throw new Error('shape')
    return { feeBps: t.feeBps, creditBps: t.creditBps, gatewayBps: t.gatewayBps, live: true }
  } catch {
    return { ...SNAPSHOT, live: false }
  }
}

const pct = (bps: number) => `${bps / 100}%`

export async function LaunchTerms({ baseUrl = 'https://www.orbio.so', terms }: { baseUrl?: string; terms?: Terms }) {
  const t = terms ?? (await liveTerms(baseUrl))
  const staked = Math.max(0, 10000 - t.feeBps - t.creditBps - t.gatewayBps)
  const rows: [string, string][] = [
    ['Project treasury', pct(t.feeBps)],
    ['Paid out as CREDIT', pct(t.creditBps)],
    ['Gateway balance for the project’s agents', pct(t.gatewayBps)],
    ['Staked', pct(staked)],
  ]
  return (
    <section aria-label="Launch fee split" className="rounded-lg border bg-card p-6 text-card-foreground">
      <h2 className="text-xl font-semibold">How launch fees are split</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        From the Orbio launchpad’s {t.live ? 'current' : 'last known'} terms. These are protocol settings and can change.
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
