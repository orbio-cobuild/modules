import { EncryptJWT, jwtDecrypt, jwtVerify, SignJWT } from 'jose'
import { readCookie } from './cookies'
import { deriveKeyBytes } from './crypto'

export const SESSION_COOKIE = 'cf_orbio_session'
export const FLOW_COOKIE = 'cf_orbio_flow'

export interface OrbioProfile {
  sub: string
  name?: string
  preferredUsername?: string
  picture?: string
  email?: string
  walletAddress?: string
}

export interface OrbioSession {
  sessionId: string
  profile: OrbioProfile
  expiresAt: number
}

export async function signSession(sessionId: string, profile: OrbioProfile, ttlSeconds: number): Promise<string> {
  return new SignJWT({ typ: 'orbio_session', sid: sessionId, profile })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(profile.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(await deriveKeyBytes('session'))
}

export async function verifySession(token: string | undefined): Promise<OrbioSession | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, await deriveKeyBytes('session'), { algorithms: ['HS256'] })
    if (payload.typ !== 'orbio_session' || typeof payload.sid !== 'string' || typeof payload.sub !== 'string') return null
    const profile = (payload.profile ?? { sub: payload.sub }) as OrbioProfile
    return { sessionId: payload.sid, profile: { ...profile, sub: payload.sub }, expiresAt: payload.exp ?? 0 }
  } catch {
    return null
  }
}

export interface LoginFlow {
  verifier: string
  state: string
  nonce: string
  returnTo: string
}

/** The login cookie is encrypted, because it holds the PKCE verifier. */
export async function sealFlow(flow: LoginFlow, ttlSeconds = 600): Promise<string> {
  return new EncryptJWT({ ...flow, typ: 'orbio_flow' })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .encrypt(await deriveKeyBytes('flow'))
}

export async function openFlow(token: string | undefined): Promise<LoginFlow | null> {
  if (!token) return null
  try {
    const { payload } = await jwtDecrypt(token, await deriveKeyBytes('flow'))
    if (payload.typ !== 'orbio_flow') return null
    const { verifier, state, nonce, returnTo } = payload as unknown as LoginFlow
    return verifier && state && nonce ? { verifier, state, nonce, returnTo: returnTo || '/' } : null
  } catch {
    return null
  }
}

export async function getOrbioSessionFromRequest(req: Request): Promise<OrbioSession | null> {
  return verifySession(readCookie(req, SESSION_COOKIE))
}
