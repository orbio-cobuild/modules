import { getAddress, isAddressEqual, recoverMessageAddress, type Hex, type PublicClient } from 'viem'
import { generateSiweNonce, parseSiweMessage, validateSiweMessage } from 'viem/siwe'
import { z } from 'zod'
import { getChainId, getPublicClient } from './chain'
import { getAuthWalletConfig } from './config'
import type { AuthWalletConfig } from './config-schema'
import { clearCookie, readCookie, serializeCookie } from './cookies'
import { getWalletSessionFromRequest, NONCE_COOKIE, SESSION_COOKIE, signNonce, signSession, verifyNonce } from './session'
import { supabaseWalletUserStore, type WalletUserStore } from './store'

export interface HandlerDeps {
  config?: AuthWalletConfig
  /** Used for smart-contract wallets (ERC-1271 / ERC-6492). EOAs are checked without the network. */
  publicClient?: Pick<PublicClient, 'verifyMessage'> | null
  store?: WalletUserStore
  now?: () => Date
}

const json = (body: unknown, status = 200, headers: Record<string, string | string[]> = {}) => {
  const h = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' })
  for (const [k, v] of Object.entries(headers)) for (const value of [v].flat()) h.append(k, value)
  return new Response(JSON.stringify(body), { status, headers: h })
}

const fail = (status: number, error: string, code: string) => json({ error, code }, status)

/** Hosts we accept as the SIWE `domain`: the request's own host, configured domains, and NEXT_PUBLIC_APP_URL's host. */
export function acceptedDomains(req: Request, config: AuthWalletConfig): Set<string> {
  const out = new Set<string>(config.allowedDomains.map((d) => d.toLowerCase()))
  const host = req.headers.get('host') ?? new URL(req.url).host
  if (host) out.add(host.toLowerCase())
  // Only trust X-Forwarded-Host when the deployment says a trusted proxy sets it (preview proxies).
  const fwd = req.headers.get('x-forwarded-host')
  if (fwd && process.env.TRUST_FORWARDED_HOST === '1') out.add(fwd.split(',')[0]!.trim().toLowerCase())
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    try {
      out.add(new URL(appUrl).host.toLowerCase())
    } catch {
      /* ignore a malformed NEXT_PUBLIC_APP_URL */
    }
  }
  return out
}

/** GET /api/auth/wallet/nonce */
export async function handleNonce(_req: Request, deps: HandlerDeps = {}): Promise<Response> {
  const config = deps.config ?? getAuthWalletConfig()
  const nonce = generateSiweNonce()
  const token = await signNonce(nonce, config.nonceTtlSeconds)
  return json({ nonce, chainId: getChainId(), statement: config.statement }, 200, {
    'set-cookie': serializeCookie(NONCE_COOKIE, token, { maxAgeSeconds: config.nonceTtlSeconds }),
  })
}

const verifyBody = z.object({
  message: z.string().min(20).max(4000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
})

/** POST /api/auth/wallet/verify  { message, signature } */
export async function handleVerify(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  const config = deps.config ?? getAuthWalletConfig()
  const now = deps.now?.() ?? new Date()

  let body: z.infer<typeof verifyBody>
  try {
    body = verifyBody.parse(await req.json())
  } catch {
    return fail(400, 'That sign-in request was not readable. Please try again.', 'bad_request')
  }

  const expectedNonce = await verifyNonce(readCookie(req, NONCE_COOKIE))
  if (!expectedNonce) return fail(401, 'Your sign-in request expired. Please try again.', 'nonce_expired')

  const message = parseSiweMessage(body.message)
  if (!message.address || !message.domain || !message.nonce) {
    return fail(400, 'That sign-in request was not readable. Please try again.', 'bad_message')
  }
  const chainId = getChainId()
  if (message.chainId !== chainId) {
    return fail(400, 'Your wallet is on a different network. Please switch networks and try again.', 'wrong_chain')
  }
  if (!acceptedDomains(req, config).has(message.domain.toLowerCase())) {
    return fail(401, 'This sign-in request was made for a different website.', 'wrong_domain')
  }
  if (!validateSiweMessage({ message, nonce: expectedNonce, time: now })) {
    return fail(401, 'Your sign-in request expired or did not match. Please try again.', 'invalid_message')
  }

  const address = getAddress(message.address)
  const signature = body.signature as Hex
  let valid = false
  try {
    valid = isAddressEqual(await recoverMessageAddress({ message: body.message, signature }), address)
  } catch {
    valid = false
  }
  if (!valid) {
    const client = deps.publicClient === undefined ? getPublicClient() : deps.publicClient
    if (client) {
      try {
        valid = await client.verifyMessage({ address, message: body.message, signature })
      } catch {
        valid = false
      }
    }
  }
  if (!valid) return fail(401, "We couldn't confirm that signature. Please try signing in again.", 'bad_signature')

  const token = await signSession(address, chainId, config.sessionTtlSeconds)
  if (config.recordUsers) await (deps.store ?? supabaseWalletUserStore()).recordSignIn(address, chainId).catch(() => {})

  return json({ address, chainId }, 200, {
    'set-cookie': [
      serializeCookie(SESSION_COOKIE, token, { maxAgeSeconds: config.sessionTtlSeconds }),
      clearCookie(NONCE_COOKIE),
    ],
  })
}

/** GET /api/auth/wallet/me */
export async function handleMe(req: Request): Promise<Response> {
  const session = await getWalletSessionFromRequest(req)
  if (!session) return json({ signedIn: false })
  return json({ signedIn: true, address: session.address, chainId: session.chainId, expiresAt: session.expiresAt })
}

/** POST /api/auth/wallet/logout */
export async function handleLogout(_req: Request): Promise<Response> {
  return json({ signedIn: false }, 200, { 'set-cookie': clearCookie(SESSION_COOKIE) })
}
