/** Server-only token gating for Server Components, Server Actions and route handlers. */
import { redirect } from 'next/navigation'
import type { Address } from 'viem'
import { getWalletSession, getWalletSessionFromRequest } from '@/lib/auth-wallet/server'
import { getChainId, getPublicClient } from './chain'
import { checkGate, comingSoonText, deniedText, gateLaunched, type CheckDeps, type GateResult } from './check'
import { findGate, getGatingConfig } from './config'
import type { GatingConfig } from './config-schema'

export interface GateOptions {
  fresh?: boolean
  deps?: CheckDeps
  config?: GatingConfig
}

export type GateStatus =
  | { status: 'signedOut' | 'comingSoon'; gateId: string; message: string }
  | (Exclude<GateResult, { status: 'comingSoon' }> & { address: Address; message: string })

function defaultDeps(config: GatingConfig): CheckDeps {
  return { publicClient: getPublicClient(), chainId: getChainId(), cacheSeconds: config.cacheSeconds }
}

async function statusFor(gateId: string, address: Address | null, opts: GateOptions): Promise<GateStatus> {
  const config = opts.config ?? getGatingConfig()
  const gate = findGate(config, gateId)
  const deps = opts.deps ?? defaultDeps(config)
  const fresh = opts.fresh
  // The token isn't launched yet (D252): say so before asking anyone to sign in, and let nobody through.
  if (!gateLaunched(gate, deps.chainId)) return { status: 'comingSoon', gateId, message: comingSoonText(gate) }
  if (!address) return { status: 'signedOut', gateId, message: `Sign in with your wallet to check access to ${gate.name}.` }
  const r = await checkGate(gate, address, deps, { fresh })
  if (r.status === 'comingSoon') return { status: 'comingSoon', gateId, message: r.message }
  if (r.status === 'error') return { ...r, address }
  return { ...r, address, message: r.status === 'allowed' ? `Welcome to ${gate.name}.` : deniedText(gate) }
}

/** The current visitor's status for a gate (uses the auth-wallet session). */
export async function getGateStatus(gateId: string, opts: GateOptions = {}): Promise<GateStatus> {
  const session = await getWalletSession()
  return statusFor(gateId, session?.address ?? null, opts)
}

/** Same, for a route handler's Request. */
export async function getGateStatusForRequest(req: Request, gateId: string, opts: GateOptions = {}): Promise<GateStatus> {
  const session = await getWalletSessionFromRequest(req)
  return statusFor(gateId, session?.address ?? null, opts)
}

/** For pages: redirect people who don't qualify (default: to `/gate/<id>`, which explains how to get in). */
export async function requireGate(gateId: string, redirectTo = `/gate/${gateId}`): Promise<GateStatus & { status: 'allowed' }> {
  const s = await getGateStatus(gateId)
  if (s.status !== 'allowed') redirect(`${redirectTo}${redirectTo.includes('?') ? '&' : '?'}from=gated`)
  return s as GateStatus & { status: 'allowed' }
}

/**
 * For API routes: 401 when signed out, 403 when the balance is too low or the token isn't launched yet, 503 when the chain can't be read.
 *   export const GET = withGate('holders', async (req, gate) => Response.json({ secret: '…' }))
 */
export function withGate<Ctx = unknown>(
  gateId: string,
  handler: (req: Request, gate: GateStatus & { status: 'allowed' }, ctx: Ctx) => Promise<Response> | Response,
  opts: Omit<GateOptions, 'fresh'> = {},
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    const s = await getGateStatusForRequest(req, gateId, opts)
    if (s.status === 'allowed') return handler(req, s as GateStatus & { status: 'allowed' }, ctx)
    const status = s.status === 'signedOut' ? 401 : s.status === 'denied' || s.status === 'comingSoon' ? 403 : 503
    return new Response(JSON.stringify({ code: `gate_${s.status}`, error: s.message }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  }
}
