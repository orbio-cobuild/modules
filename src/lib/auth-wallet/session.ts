import { jwtVerify, SignJWT } from 'jose'
import { getAddress, type Address } from 'viem'
import { readCookie } from './cookies'

export const SESSION_COOKIE = 'cf_wallet_session'
export const NONCE_COOKIE = 'cf_siwe_nonce'

export interface WalletSession {
  address: Address
  chainId: number
  issuedAt: number
  expiresAt: number
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('Wallet sign-in is not set up yet: SESSION_SECRET must be at least 32 characters.')
  }
  return new TextEncoder().encode(secret)
}

export async function signSession(address: Address, chainId: number, ttlSeconds: number): Promise<string> {
  return new SignJWT({ chainId, typ: 'wallet_session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(getAddress(address))
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey())
}

export async function verifySession(token: string | undefined): Promise<WalletSession | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] })
    if (payload.typ !== 'wallet_session' || typeof payload.sub !== 'string' || typeof payload.chainId !== 'number') return null
    return { address: getAddress(payload.sub), chainId: payload.chainId, issuedAt: payload.iat ?? 0, expiresAt: payload.exp ?? 0 }
  } catch {
    return null
  }
}

export async function signNonce(nonce: string, ttlSeconds: number): Promise<string> {
  return new SignJWT({ nonce, typ: 'siwe_nonce' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey())
}

export async function verifyNonce(token: string | undefined): Promise<string | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] })
    return payload.typ === 'siwe_nonce' && typeof payload.nonce === 'string' ? payload.nonce : null
  } catch {
    return null
  }
}

/** The signed-in wallet for a route handler's Request, or null. Also checks the session is for this app's chain. */
export async function getWalletSessionFromRequest(req: Request): Promise<WalletSession | null> {
  const session = await verifySession(readCookie(req, SESSION_COOKIE))
  if (!session) return null
  if (String(session.chainId) !== process.env.NEXT_PUBLIC_CHAIN_ID) return null
  return session
}
