/**
 * Client for Orbio's public launchpad API: GET https://www.orbio.so/api/protocol/agents/{id}.
 * Free, no key. Every field is optional/nullable here because the API changes weekly and some agents
 * (e.g. "listed" tokens) carry fewer fields. Missing values render as a dash, never as zero.
 */
import { z } from 'zod'

const num = z.string().regex(/^-?\d+$/)
const big = num.nullish()
const addr = z.string().nullish()

export const launchpadAgentSchema = z.looseObject({
  kind: z.string().nullish(),
  agentId: z.string().nullish(),
  token: addr,
  name: z.string().nullish(),
  symbol: z.string().nullish(),
  logo: z.string().nullish(),
  description: z.string().nullish(),
  decimals: z.number().int().nullish(),
  totalSupply: big,
  owner: addr,
  agentWallet: addr,
  receiver: addr,
  feeBps: z.number().nullish(),
  launchedAt: big,
  launchTx: z.string().nullish(),
  launchBlock: big,
  /** Price of one ORBIO in micro-USD, used to value ORBIO amounts. */
  orbioMicroUsd: big,
  price: z
    .looseObject({ source: z.string().nullish(), graduated: z.boolean().nullish(), priceMicroUsd: big, marketCapMicroUsd: big })
    .nullish(),
  curve: z.looseObject({ graduated: z.boolean().nullish(), progressBps: z.number().nullish() }).nullish(),
  stake: z
    .looseObject({ orbioWei: big, claimedFeesWei: big, protocolFeeWei: big, stakedWei: big, withdrawnWei: big })
    .nullish(),
  credit: z.looseObject({ owedAtoms: big, claimedAtoms: big, activatedAtoms: big, mintedAtoms: big }).nullish(),
  converted: z.looseObject({ orbioWei: big, usdgAtoms: big, pendingOrbioWei: big }).nullish(),
  cliff: z.looseObject({ unlocksAt: big, locked: z.boolean().nullish() }).nullish(),
  links: z.record(z.string(), z.string().nullish()).nullish(),
  socials: z.record(z.string(), z.string().nullish()).nullish(),
})

export type LaunchpadAgent = z.infer<typeof launchpadAgentSchema>

export type AgentResult =
  | { status: 'ok'; agent: LaunchpadAgent }
  | { status: 'not_found' }
  | { status: 'not_configured' }
  | { status: 'unavailable'; reason: string }

export const DEFAULT_LAUNCHPAD_BASE = 'https://www.orbio.so'

export interface FetchAgentOptions {
  baseUrl?: string
  /** Seconds Next.js may cache the response (default 60). */
  revalidate?: number
  fetch?: typeof fetch
}

/** An agent id is a decimal number. Placeholders and blanks count as "not launched yet". */
export function normaliseAgentId(id: unknown): string | null {
  if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) return String(id)
  if (typeof id === 'string' && /^\d{1,12}$/.test(id.trim()) && Number(id) > 0) return id.trim()
  return null
}

export async function fetchLaunchpadAgent(agentId: unknown, opts: FetchAgentOptions = {}): Promise<AgentResult> {
  const id = normaliseAgentId(agentId)
  if (!id) return { status: 'not_configured' }
  const base = (opts.baseUrl ?? DEFAULT_LAUNCHPAD_BASE).replace(/\/+$/, '')
  const doFetch = opts.fetch ?? fetch
  let res: Response
  try {
    res = await doFetch(`${base}/api/protocol/agents/${id}`, {
      headers: { accept: 'application/json' },
      next: { revalidate: opts.revalidate ?? 60 },
    })
  } catch {
    return { status: 'unavailable', reason: "We couldn't reach the launchpad just now." }
  }
  if (res.status === 404) return { status: 'not_found' }
  if (!res.ok) return { status: 'unavailable', reason: `The launchpad answered with an error (${res.status}).` }
  const parsed = launchpadAgentSchema.safeParse(await res.json().catch(() => null))
  if (!parsed.success) return { status: 'unavailable', reason: 'The launchpad sent data we could not read.' }
  return { status: 'ok', agent: parsed.data }
}
