import { cookies } from 'next/headers'
import { getAuthOrbioConfig } from './config'
import { SESSION_COOKIE, verifySession, type OrbioSession } from './session'
import { supabaseOrbioSessionStore } from './store'
import { createOrbioTokenManager, OrbioReconnectRequired, type OrbioTokenManager } from './tokens'

export type { OrbioProfile, OrbioSession } from './session'
export { getOrbioSessionFromRequest } from './session'
export { OrbioBusyError, OrbioReconnectRequired } from './tokens'

let manager: OrbioTokenManager | undefined
/** The app's single token manager (server-only). */
export function getOrbioTokenManager(): OrbioTokenManager {
  manager ??= createOrbioTokenManager({ store: supabaseOrbioSessionStore(), issuer: getAuthOrbioConfig().issuer })
  return manager
}

/** The signed-in Orbio user in a Server Component, Server Action or route handler. Server-only. */
export async function getOrbioSession(): Promise<OrbioSession | null> {
  const jar = await cookies()
  return verifySession(jar.get(SESSION_COOKIE)?.value)
}

/** A valid access token for the signed-in person (refreshed in one place). Throws OrbioReconnectRequired. */
export async function getOrbioAccessToken(): Promise<string> {
  const session = await getOrbioSession()
  if (!session) throw new OrbioReconnectRequired()
  return getOrbioTokenManager().getAccessToken(session.sessionId)
}

/**
 * Calls Orbio's API (gateway, tools) as the signed-in person, on their balance.
 * On a 401 it refreshes once and retries (a 401 means Orbio did not run the request).
 * `path` is relative to apiBase, e.g. "/api/v1/key" or "/api/v1/chat/completions".
 */
export async function orbioFetch(path: string, init: RequestInit = {}, sessionId?: string): Promise<Response> {
  const sid = sessionId ?? (await getOrbioSession())?.sessionId
  if (!sid) throw new OrbioReconnectRequired()
  const mgr = getOrbioTokenManager()
  const url = getAuthOrbioConfig().apiBase.replace(/\/$/, '') + path
  const send = (token: string) => fetch(url, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), authorization: `Bearer ${token}` } })
  let res = await send(await mgr.getAccessToken(sid))
  if (res.status === 401) res = await send(await mgr.getAccessToken(sid, { forceRefresh: true }))
  return res
}
