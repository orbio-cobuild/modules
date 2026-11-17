import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { clientCredentials, endpoints } from './config'
import type { OrbioProfile } from './session'

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  scope?: string
  id_token?: string
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** invalid_grant: the code was used/expired, or the refresh token was used before (Orbio has now revoked the connection). */
export class OrbioOAuthError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    description?: string,
  ) {
    super(description ? `${code}: ${description}` : code)
  }
}

/** A network failure: we don't know whether Orbio received the request. */
export class OrbioTransportError extends Error {}

export interface OAuthDeps {
  issuer: string
  fetch?: FetchLike
}

async function tokenRequest(deps: OAuthDeps, params: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = clientCredentials()
  const body = new URLSearchParams(params)
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }
  if (clientSecret) headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString('base64')}`
  else body.set('client_id', clientId) // public app: PKCE only, no secret
  let res: Response
  try {
    res = await (deps.fetch ?? fetch)(endpoints(deps.issuer).token, { method: 'POST', headers, body, cache: 'no-store' })
  } catch (e) {
    throw new OrbioTransportError(e instanceof Error ? e.message : String(e))
  }
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string; error_description?: string }
  if (!res.ok || !json.access_token || !json.refresh_token) {
    throw new OrbioOAuthError(json.error ?? 'token_request_failed', res.status, json.error_description)
  }
  return json as TokenResponse
}

export function exchangeCode(deps: OAuthDeps, code: string, redirectUri: string, verifier: string) {
  return tokenRequest(deps, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier })
}

/** Single-use refresh token: the caller must save the returned refresh_token before using the access_token. */
export function refreshTokens(deps: OAuthDeps, refreshToken: string) {
  return tokenRequest(deps, { grant_type: 'refresh_token', refresh_token: refreshToken })
}

/** Disconnects the app from the person's Orbio account. Best effort. */
export async function revokeToken(deps: OAuthDeps, refreshToken: string): Promise<void> {
  const { clientId, clientSecret } = clientCredentials()
  const body = new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token' })
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' }
  if (clientSecret) headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString('base64')}`
  else body.set('client_id', clientId)
  await (deps.fetch ?? fetch)(endpoints(deps.issuer).revoke, { method: 'POST', headers, body }).catch(() => undefined)
}

const jwksCache = new Map<string, JWTVerifyGetKey>()

/** Verifies the ES256 id_token against Orbio's JWKS: issuer, audience (our client id), expiry and nonce. */
export async function verifyIdToken(
  idToken: string,
  opts: { issuer: string; nonce: string; jwks?: JWTVerifyGetKey },
): Promise<OrbioProfile> {
  const { clientId } = clientCredentials()
  let jwks = opts.jwks ?? jwksCache.get(opts.issuer)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(endpoints(opts.issuer).jwks))
    jwksCache.set(opts.issuer, jwks)
  }
  const { payload } = await jwtVerify(idToken, jwks, { issuer: opts.issuer, audience: clientId, algorithms: ['ES256'] })
  if (payload.nonce !== opts.nonce) throw new OrbioOAuthError('invalid_nonce', 400)
  if (typeof payload.sub !== 'string') throw new OrbioOAuthError('invalid_id_token', 400)
  return claimsToProfile(payload as Record<string, unknown>)
}

export function claimsToProfile(c: Record<string, unknown>): OrbioProfile {
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined)
  return {
    sub: String(c.sub),
    name: str(c.name),
    preferredUsername: str(c.preferred_username),
    picture: str(c.picture),
    email: c.email_verified === false ? undefined : str(c.email),
    walletAddress: str(c.wallet_address),
  }
}

export async function fetchUserInfo(deps: OAuthDeps, accessToken: string): Promise<OrbioProfile> {
  const res = await (deps.fetch ?? fetch)(endpoints(deps.issuer).userinfo, { headers: { authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  if (!res.ok) throw new OrbioOAuthError('userinfo_failed', res.status)
  return claimsToProfile((await res.json()) as Record<string, unknown>)
}
