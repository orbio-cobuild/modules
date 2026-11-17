import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySession, type WalletSession } from './session'

export type { WalletSession } from './session'
export { getWalletSessionFromRequest } from './session'

/**
 * The signed-in wallet in a Server Component, Server Action or route handler (Next.js 15).
 * Server-only: never import this from a 'use client' file.
 */
export async function getWalletSession(): Promise<WalletSession | null> {
  const jar = await cookies()
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value)
  if (!session || String(session.chainId) !== process.env.NEXT_PUBLIC_CHAIN_ID) return null
  return session
}

export class SignInRequiredError extends Error {
  constructor() {
    super('Please sign in with your wallet first.')
  }
}

export async function requireWalletSession(): Promise<WalletSession> {
  const session = await getWalletSession()
  if (!session) throw new SignInRequiredError()
  return session
}
