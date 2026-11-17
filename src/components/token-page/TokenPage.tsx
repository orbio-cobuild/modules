/**
 * The token page: market facts + treasury from the launchpad, "Coming soon" before launch,
 * dashes for anything the API doesn't give us. Server component.
 */
import config from '@/config/modules/token-page.json'
import { fetchLaunchpadAgent, type AgentResult, type LaunchpadAgent } from '@/lib/token-page/launchpad'
import { DASH, formatPriceMicro, formatUsdMicro, formatWei, shortAddress } from '@/lib/token-page/format'
import { isPreviewBuild } from '@/lib/token-page/sample'
import { marketFacts } from '@/lib/token-page/treasury'
import { ComingSoon } from './ComingSoon'
import { LaunchTerms } from './LaunchTerms'
import { TreasuryPanel } from './TreasuryPanel'

interface Cfg {
  agentId?: string | null
  tokenName?: string
  tokenSymbol?: string
  about?: string
  comingSoonMessage?: string
  showMarket?: boolean
  revalidateSeconds?: number
  launchpadBaseUrl?: string
  disclaimer?: string
}

const DEFAULT_MESSAGE = 'The token hasn’t launched yet. This page will show its treasury once it does.'
const DEFAULT_DISCLAIMER =
  'This page shows public on-chain data for information only. It is not financial advice or an offer, and token prices can go down as well as up.'

export interface TokenPageProps {
  /** Overrides for tests and examples; normally the module config is used. */
  config?: Cfg
  /** Inject a result instead of fetching (tests). */
  result?: AgentResult
  fetch?: typeof fetch
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function Market({ agent }: { agent: LaunchpadAgent }) {
  const m = marketFacts(agent)
  return (
    <section aria-label="Market facts" className="grid gap-3 sm:grid-cols-4">
      <Fact label="Price" value={formatPriceMicro(m.price)} />
      <Fact label="Market cap" value={formatUsdMicro(m.marketCap)} />
      <Fact label="Supply" value={m.totalSupply === null ? DASH : formatWei(m.totalSupply, 0)} />
      <Fact label="Stage" value={m.stage} />
    </section>
  )
}

export async function TokenPage(props: TokenPageProps = {}) {
  const cfg: Cfg = { ...(config as Cfg), ...(props.config ?? {}) }
  const result =
    props.result ??
    (await fetchLaunchpadAgent(cfg.agentId, { baseUrl: cfg.launchpadBaseUrl, revalidate: cfg.revalidateSeconds ?? 60, fetch: props.fetch }))

  const agent: LaunchpadAgent | null = result.status === 'ok' ? result.agent : null
  // Before the launch there are no figures to show, and none are made up (D255): the page says
  // "coming after launch" under the project's own token name. A preview adds a labelled note.
  const previewNote = !agent && result.status === 'not_configured' && isPreviewBuild()

  const name = agent?.name ?? cfg.tokenName
  const symbol = agent?.symbol ?? cfg.tokenSymbol

  return (
    <section className="mx-auto max-w-4xl space-y-6 px-4 py-16 sm:px-6">
      <header className="flex items-center gap-4">
        {agent?.logo && /^https:\/\//.test(agent.logo) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="h-14 w-14 rounded-full border" height={56} src={agent.logo} width={56} />
        )}
        <div>
          <h1 className="text-3xl font-semibold">
            {name ?? 'Token'}
            {symbol && <span className="ml-2 text-muted-foreground">${symbol}</span>}
          </h1>
          {agent?.token && <p className="text-sm text-muted-foreground">Contract {shortAddress(agent.token)}</p>}
        </div>
      </header>

      {(cfg.about || agent?.description) && <p className="max-w-2xl text-muted-foreground">{cfg.about ?? agent?.description}</p>}

      {!agent && result.status === 'unavailable' && (
        <p className="rounded-lg border bg-card p-4 text-card-foreground">{result.reason} Please try again in a minute.</p>
      )}
      {!agent && (result.status === 'not_configured' || result.status === 'not_found') && (
        <ComingSoon message={cfg.comingSoonMessage ?? DEFAULT_MESSAGE} name={cfg.tokenName} symbol={cfg.tokenSymbol} />
      )}
      {!agent && result.status !== 'unavailable' && props.result === undefined && <LaunchTerms baseUrl={cfg.launchpadBaseUrl} />}

      {agent && (cfg.showMarket ?? true) && <Market agent={agent} />}
      {agent && <TreasuryPanel agent={agent} />}
      {previewNote && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-preview-note="token">
          <span className="mr-2 rounded bg-muted px-2 py-0.5 text-xs font-medium">Preview</span>
          Price, market cap and treasury appear here after the token launches; until then this page shows no figures. You can rehearse
          the launch on your test chain from the builder.
        </p>
      )}

      <p className="text-xs text-muted-foreground">{cfg.disclaimer ?? DEFAULT_DISCLAIMER}</p>
    </section>
  )
}
