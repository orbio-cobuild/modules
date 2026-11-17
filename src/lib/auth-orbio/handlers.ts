import type { JWTVerifyGetKey } from 'jose'
import { getAuthOrbioConfig, clientCredentials, endpoints } from './config'
import type { AuthOrbioConfig } from './config-schema'
import { clearCookie, readCookie, serializeCookie } from './cookies'
import { decryptToken, encryptToken, pkceChallenge, randomUrlSafe } from './crypto'
import { exchangeCode, fetchUserInfo, revokeToken, verifyIdToken, type FetchLike } from './oauth'
import { FLOW_COOKIE, getOrbioSessionFromRequest, openFlow, sealFlow, SESSION_COOKIE, signSession } from './session'
import { isSampleSession, SAMPLE_PROFILE, SAMPLE_SESSION_PREFIX, sampleSignInEnabled } from './sample'
import { supabaseOrbioSessionStore, type OrbioSessionStore } from './store'

export interface HandlerDeps {
  config?: AuthOrbioConfig
  store?: OrbioSessionStore
  fetch?: FetchLike
  /** Test hook: a local JWKS instead of Orbio's remote one. */
  jwks?: JWTVerifyGetKey
}

/** Error codes the app shows in plain English (see ORBIO_ERROR_TEXT). */
export type OrbioErrorCode = 'cancelled' | 'expired' | 'failed' | 'not_configured'

export const ORBIO_ERROR_TEXT: Record<OrbioErrorCode, string> = {
  cancelled: 'You cancelled signing in with Orbio.',
  expired: 'That sign-in took too long. Please try again.',
  failed: "We couldn't sign you in with Orbio. Please try again.",
  not_configured: 'Sign in with Orbio is not set up for this app yet.',
}

/** Only same-site relative paths, so the sign-in link can't be used as an open redirect. */
export function safeReturnTo(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}

/** The app's public origin. NEXT_PUBLIC_APP_URL wins, because Orbio matches the redirect URI exactly. */
export function appOrigin(req: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL
  if (env) return new URL(env).origin
  return new URL(req.url).origin
}

const redirect = (to: string, cookies: string[] = []) => {
  const h = new Headers({ location: to, 'cache-control': 'no-store' })
  for (const c of cookies) h.append('set-cookie', c)
  return new Response(null, { status: 302, headers: h })
}

const withError = (path: string, code: OrbioErrorCode) => `${path}${path.includes('?') ? '&' : '?'}orbio_error=${code}`

/** GET /api/auth/orbio/login?returnTo=/somewhere */
export async function handleLogin(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  const config = deps.config ?? getAuthOrbioConfig()
  const url = new URL(req.url)
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'), config.afterSignInPath)
  if (sampleSignInEnabled()) {
    const sid = SAMPLE_SESSION_PREFIX + crypto.randomUUID()
    const cookie = serializeCookie(SESSION_COOKIE, await signSession(sid, SAMPLE_PROFILE, config.sessionTtlSeconds), { maxAgeSeconds: config.sessionTtlSeconds })
    return redirect(returnTo, [cookie])
  }
  let clientId: string
  try {
    clientId = clientCredentials().clientId
  } catch {
    return redirect(withError(returnTo, 'not_configured'))
  }
  const flow = { verifier: randomUrlSafe(32), state: randomUrlSafe(16), nonce: randomUrlSafe(16), returnTo }
  const authorize = new URL(endpoints(config.issuer).authorize)
  authorize.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: appOrigin(req) + config.callbackPath,
    scope: config.scopes.join(' '),
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: await pkceChallenge(flow.verifier),
    code_challenge_method: 'S256',
    ...(config.prompt ? { prompt: config.prompt } : {}),
  }).toString()
  return redirect(authorize.toString(), [serializeCookie(FLOW_COOKIE, await sealFlow(flow), { maxAgeSeconds: 600 })])
}

/** GET /api/auth/orbio/callback?code=…&state=…&iss=… */
export async function handleCallback(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  const config = deps.config ?? getAuthOrbioConfig()
  const url = new URL(req.url)
  const flow = await openFlow(readCookie(req, FLOW_COOKIE))
  const clearFlow = clearCookie(FLOW_COOKIE)
  if (!flow) return redirect(withError(config.afterSignInPath, 'expired'), [clearFlow])

  const fail = (code: OrbioErrorCode) => redirect(withError(flow.returnTo, code), [clearFlow])
  const error = url.searchParams.get('error')
  if (error) return fail(error === 'access_denied' ? 'cancelled' : 'failed')
  if (url.searchParams.get('state') !== flow.state) return fail('failed')
  const iss = url.searchParams.get('iss')
  if (iss && iss.replace(/\/$/, '') !== config.issuer.replace(/\/$/, '')) return fail('failed') // RFC 9207 mix-up defence
  const code = url.searchParams.get('code')
  if (!code) return fail('failed')

  try {
    const oauth = { issuer: config.issuer, fetch: deps.fetch }
    const tokens = await exchangeCode(oauth, code, appOrigin(req) + config.callbackPath, flow.verifier)
    const profile = tokens.id_token
      ? await verifyIdToken(tokens.id_token, { issuer: config.issuer, nonce: flow.nonce, jwks: deps.jwks })
      : await fetchUserInfo(oauth, tokens.access_token)

    const sessionId = crypto.randomUUID()
    await (deps.store ?? supabaseOrbioSessionStore()).create({
      id: sessionId,
      sub: profile.sub,
      profile,
      scope: tokens.scope ?? config.scopes.join(' '),
      accessTokenEnc: await encryptToken(tokens.access_token, sessionId),
      refreshTokenEnc: await encryptToken(tokens.refresh_token, sessionId),
      accessExpiresAt: Date.now() + tokens.expires_in * 1000,
    })
    const cookie = serializeCookie(SESSION_COOKIE, await signSession(sessionId, profile, config.sessionTtlSeconds), {
      maxAgeSeconds: config.sessionTtlSeconds,
    })
    return redirect(flow.returnTo, [cookie, clearFlow])
  } catch (e) {
    console.warn('[auth-orbio] sign-in failed:', e instanceof Error ? e.message : e)
    return fail('failed')
  }
}

const json = (body: unknown, cookies: string[] = []) => {
  const h = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' })
  for (const c of cookies) h.append('set-cookie', c)
  return new Response(JSON.stringify(body), { status: 200, headers: h })
}

/** GET /api/auth/orbio/me */
export async function handleMe(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  const session = await getOrbioSessionFromRequest(req)
  if (!session) return json({ signedIn: false })
  if (isSampleSession(session.sessionId)) {
    if (!sampleSignInEnabled()) return json({ signedIn: false }, [clearCookie(SESSION_COOKIE)])
    return json({ signedIn: true, sample: true, user: session.profile })
  }
  const row = await (deps.store ?? supabaseOrbioSessionStore()).get(session.sessionId).catch(() => null)
  if (!row || row.status !== 'active') return json({ signedIn: false, reconnect: true }, [clearCookie(SESSION_COOKIE)])
  const { sub, name, preferredUsername, picture, email, walletAddress } = session.profile
  return json({ signedIn: true, user: { sub, name, preferredUsername, picture, email, walletAddress } })
}

/** POST /api/auth/orbio/logout: revokes the refresh token (disconnects the app at Orbio) and ends the session. */
export async function handleLogout(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  const config = deps.config ?? getAuthOrbioConfig()
  const session = await getOrbioSessionFromRequest(req)
  if (session && !isSampleSession(session.sessionId)) {
    const store = deps.store ?? supabaseOrbioSessionStore()
    const row = await store.get(session.sessionId).catch(() => null)
    if (row?.refreshTokenEnc) {
      const refreshToken = await decryptToken(row.refreshTokenEnc, row.id).catch(() => null)
      if (refreshToken) await revokeToken({ issuer: config.issuer, fetch: deps.fetch }, refreshToken)
    }
    await store.delete(session.sessionId).catch(() => undefined)
  }
  return json({ signedIn: false }, [clearCookie(SESSION_COOKIE)])
}
