import type { LaunchpadAgent } from '@/lib/token-page/launchpad'
import { treasurySummary } from '@/lib/token-page/treasury'

export function TreasuryPanel({ agent, sample = false }: { agent: LaunchpadAgent; sample?: boolean }) {
  const t = treasurySummary(agent)
  return (
    <section aria-labelledby="treasury-heading" className="rounded-lg border bg-card p-5 text-card-foreground">
      <div className="flex items-center justify-between gap-2">
        <h2 id="treasury-heading" className="text-lg font-semibold">
          Treasury
        </h2>
        {sample && <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">Sample</span>}
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {t.rows.map((r) => (
          <div key={r.id}>
            <dt className="text-sm text-muted-foreground">{r.label}</dt>
            <dd className="text-base font-medium tabular-nums">
              {r.value}
              {r.usd && <span className="ml-2 text-sm font-normal text-muted-foreground">{r.usd}</span>}
            </dd>
            {r.hint && <p className="mt-0.5 text-xs text-muted-foreground">{r.hint}</p>}
          </div>
        ))}
        <div>
          <dt className="text-sm text-muted-foreground">Owner’s stake lock</dt>
          <dd className="text-base font-medium">
            {t.cliff.locked === null ? '—' : t.cliff.locked ? `Locked until ${t.cliff.unlocks}` : 'Unlocked'}
          </dd>
        </div>
      </dl>
      {t.links.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-3 text-sm">
          {t.links.map((l) => (
            <li key={l.href}>
              <a className="underline underline-offset-4" href={l.href} rel="noopener noreferrer" target="_blank">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
