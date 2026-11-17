/**
 * Gathers a run's inputs. Paid reads go through OrbioClient.tool (chain.read, social.x.posts,
 * social.x.profile, web.search); prices come from free public JSON. Each input has its own cost cap,
 * and an input that would push the run over its per-run budget is skipped, not called.
 */
import { defaultNetwork, type AgentInput } from './config'
import { formatUsd } from './money'
import type { OrbioClient, ToolEnvelope } from './types'

export interface InputResult {
  id: string
  kind: AgentInput['kind']
  label: string
  ok: boolean
  /** One plain-English line for the public feed. */
  summary: string
  /** Trimmed data for the model prompt (not shown publicly). */
  data: unknown
  costMicro: bigint
  /** True when the gateway did not report the charge and the cap was recorded instead. */
  estimated: boolean
}

export interface GatherDeps {
  orbio: OrbioClient
  projectId: string
  jobId?: string
  /** What this run may still spend on inputs. */
  budgetLeftMicro: bigint
  fetch?: typeof fetch
  signal?: AbortSignal
  launchpadBaseUrl?: string
}

const isEnvelope = (v: unknown): v is ToolEnvelope =>
  typeof v === 'object' && v !== null && 'result' in v && 'chargedMicroUsd' in v

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function weiToEth(hex: string): string {
  const wei = BigInt(hex)
  const whole = wei / 10n ** 18n
  const frac = ((wei % 10n ** 18n) / 10n ** 14n).toString().padStart(4, '0').replace(/0+$/, '')
  return `${whole}${frac ? `.${frac}` : ''} ETH`
}

function toolCall(input: AgentInput): { name: string; args: Record<string, unknown> } | null {
  switch (input.kind) {
    case 'chain':
      return { name: 'chain.read', args: { method: input.method, params: input.params, network: input.network ?? defaultNetwork() } }
    case 'x':
      return {
        name: 'social.x.posts',
        args: {
          ...(input.query ? { query: input.query } : {}),
          ...(input.handle ? { handle: input.handle } : {}),
          ...(input.mentionsOf ? { mentions_of: input.mentionsOf } : {}),
          limit: input.limit,
        },
      }
    case 'x-profile':
      return { name: 'social.x.profile', args: { handles: input.handles } }
    case 'web':
      return { name: 'web.search', args: { query: input.query, limit: input.limit } }
    default:
      return null
  }
}

function summarise(input: AgentInput, result: unknown): { summary: string; data: unknown } {
  const r = (result ?? {}) as Record<string, unknown>
  switch (input.kind) {
    case 'chain': {
      const value = r.result
      if (input.method === 'eth_getBalance' && typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) {
        return { summary: weiToEth(value), data: { wei: BigInt(value).toString() } }
      }
      if (input.method === 'eth_blockNumber' && typeof value === 'string') return { summary: `Block ${BigInt(value)}`, data: value }
      return { summary: clip(JSON.stringify(value) ?? 'No data', 120), data: clip(JSON.stringify(value) ?? '', 4000) }
    }
    case 'x': {
      const tweets = Array.isArray(r.tweets) ? (r.tweets as Array<Record<string, unknown>>) : []
      const data = tweets.slice(0, input.limit).map((t) => ({
        text: clip(String(t.full_text ?? ''), 280),
        author: (t.user as { screen_name?: string } | undefined)?.screen_name,
        likes: t.favorite_count ?? t.likes,
        at: t.tweet_created_at,
      }))
      return { summary: typeof r.error === 'string' ? 'X would not show these posts' : `${data.length} posts`, data }
    }
    case 'x-profile': {
      const profiles = Array.isArray(r.profiles) ? (r.profiles as Array<Record<string, unknown>>) : []
      const data = profiles.map((p) => ({ handle: p.screen_name, followers: p.followers_count, bio: clip(String(p.description ?? ''), 200) }))
      return { summary: `${data.length} profiles`, data }
    }
    case 'web': {
      const results = Array.isArray(r.results) ? (r.results as Array<Record<string, unknown>>) : []
      const data = results.map((x) => ({ title: clip(String(x.title ?? ''), 140), url: x.url, description: clip(String(x.description ?? ''), 300) }))
      return { summary: `${data.length} results${data[0] ? `: ${clip(String(data[0].title), 60)}` : ''}`, data }
    }
    default:
      return { summary: 'No data', data: null }
  }
}

function pick(obj: unknown, path: string): unknown {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)
}

async function readPrice(input: Extract<AgentInput, { kind: 'price' }>, deps: GatherDeps): Promise<{ summary: string; data: unknown }> {
  const f = deps.fetch ?? fetch
  if (input.source === 'orbio-launchpad') {
    if (!input.agentId) throw new Error('No launchpad agent id set')
    const base = (deps.launchpadBaseUrl ?? 'https://www.orbio.so').replace(/\/+$/, '')
    const res = await f(`${base}/api/protocol/agents/${input.agentId}`, { signal: deps.signal, headers: { accept: 'application/json' } })
    if (res.status === 404) return { summary: 'Token not launched yet', data: null }
    if (!res.ok) throw new Error(`launchpad answered ${res.status}`)
    const a = (await res.json()) as { symbol?: string; price?: { priceMicroUsd?: string | null; marketCapMicroUsd?: string | null } }
    const price = a.price?.priceMicroUsd
    const cap = a.price?.marketCapMicroUsd
    return {
      summary: price ? `${a.symbol ?? 'Token'} price ${formatUsd(BigInt(price))}${cap ? `, market cap ${formatUsd(BigInt(cap))}` : ''}` : 'No price yet',
      data: { symbol: a.symbol, priceMicroUsd: price ?? null, marketCapMicroUsd: cap ?? null },
    }
  }
  if (!input.url || !input.field) throw new Error('A url price input needs url and field')
  const res = await f(input.url, { signal: deps.signal, headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`price source answered ${res.status}`)
  const value = pick(await res.json(), input.field)
  return { summary: `${input.label}: ${clip(String(value ?? '—'), 60)}`, data: value ?? null }
}

export async function gatherInputs(inputs: AgentInput[], deps: GatherDeps): Promise<{ results: InputResult[]; costMicro: bigint; estimated: boolean }> {
  const results: InputResult[] = []
  let left = deps.budgetLeftMicro
  let total = 0n
  let estimated = false

  for (const input of inputs) {
    const base = { id: input.id, kind: input.kind, label: input.label }
    if (input.kind === 'price') {
      try {
        results.push({ ...base, ok: true, ...(await readPrice(input, deps)), costMicro: 0n, estimated: false })
      } catch (err) {
        results.push({ ...base, ok: false, summary: "Couldn't read the price", data: null, costMicro: 0n, estimated: false })
        console.error(`[agent-loop] input ${input.id}`, err)
      }
      continue
    }
    const cap = BigInt(input.maxCostMicro)
    if (cap > left) {
      results.push({ ...base, ok: false, summary: "Skipped: it would go over this run's budget", data: null, costMicro: 0n, estimated: false })
      continue
    }
    const call = toolCall(input)!
    try {
      const raw = await deps.orbio.tool<unknown>(call.name, call.args, { maxCostMicro: cap, projectId: deps.projectId, ...(deps.jobId ? { jobId: deps.jobId } : {}) })
      const env = isEnvelope(raw) ? raw : null
      const charged = env?.chargedMicroUsd ?? null
      const cost = charged ?? cap
      if (charged === null) estimated = true
      total += cost
      left -= cost
      results.push({ ...base, ok: true, ...summarise(input, env ? env.result : raw), costMicro: cost, estimated: charged === null })
    } catch (err) {
      // We can't know whether a failed paid call was charged, so the cap counts against the budget.
      total += cap
      left -= cap
      estimated = true
      results.push({ ...base, ok: false, summary: `${input.label} didn't answer`, data: null, costMicro: cap, estimated: true })
      console.error(`[agent-loop] input ${input.id}`, err)
    }
  }
  return { results, costMicro: total, estimated }
}
