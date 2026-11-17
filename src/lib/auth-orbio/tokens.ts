import { decryptToken, encryptToken } from './crypto'
import { OrbioOAuthError, refreshTokens, type FetchLike } from './oauth'
import { isSampleSession } from './sample'
import type { OrbioSessionStore, SavedTokens } from './store'

export class OrbioReconnectRequired extends Error {
  constructor() {
    super('Your Orbio connection has ended. Please sign in with Orbio again.')
  }
}

export class OrbioBusyError extends Error {
  constructor() {
    super('Orbio is taking a while to respond. Please try again in a moment.')
  }
}

export interface TokenManagerDeps {
  store: OrbioSessionStore
  issuer: string
  fetch?: FetchLike
  now?: () => number
  /** Refresh this many seconds before expiry (access tokens last an hour). */
  refreshSkewSeconds?: number
  /** How long one refresher holds the lock. Must exceed the refresh request timeout. */
  lockSeconds?: number
  /** Timeout for the refresh request itself; kept well under lockSeconds. */
  refreshTimeoutMs?: number
  /** How long a second caller waits for the refresher to finish. */
  waitMs?: number
  pollMs?: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * The ONE place that refreshes Orbio tokens (developers/docs.md: refresh tokens are single use, and presenting an old
 * one disconnects the person).
 *
 *  1. In-process: concurrent callers for the same session share one promise.
 *  2. Across instances: `store.claimRefresh` is an atomic row lock; only its winner calls Orbio. Others wait for the
 *     new tokens to appear.
 *  3. The new refresh token is saved (`completeRefresh`) BEFORE the new access token is returned to anyone.
 *  4. `invalid_grant` means the connection is gone: mark it disconnected and ask the person to sign in again.
 *  5. A network failure keeps the old refresh token and releases the lock. If Orbio did consume it, the next attempt
 *     gets `invalid_grant` and lands in (4); there is no safe way to recover a lost refresh response.
 */
export function createOrbioTokenManager(deps: TokenManagerDeps) {
  const now = deps.now ?? Date.now
  const skewMs = (deps.refreshSkewSeconds ?? 120) * 1000
  const lockSeconds = deps.lockSeconds ?? 30
  const refreshTimeoutMs = deps.refreshTimeoutMs ?? 15_000
  const waitMs = deps.waitMs ?? 10_000
  const pollMs = deps.pollMs ?? 200
  const inflight = new Map<string, Promise<string>>()

  const fresh = (expiresAt: number) => expiresAt - now() > skewMs

  async function waitForOtherRefresher(id: string, seenVersion: number): Promise<string> {
    const deadline = now() + waitMs
    while (now() < deadline) {
      await sleep(pollMs)
      const row = await deps.store.get(id)
      if (!row || row.status !== 'active') throw new OrbioReconnectRequired()
      if (row.version > seenVersion && row.accessTokenEnc) return decryptToken(row.accessTokenEnc, id)
    }
    throw new OrbioBusyError()
  }

  async function saveWithRetry(id: string, tokens: SavedTokens) {
    let lastErr: unknown
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await deps.store.completeRefresh(id, tokens)
      } catch (e) {
        lastErr = e
        await sleep(250 * 2 ** attempt)
      }
    }
    throw lastErr
  }

  async function run(id: string, forceRefresh: boolean): Promise<string> {
    const row = await deps.store.get(id)
    if (!row || row.status !== 'active') throw new OrbioReconnectRequired()
    if (!forceRefresh && fresh(row.accessExpiresAt)) return decryptToken(row.accessTokenEnc, id)

    const claimed = await deps.store.claimRefresh(id, lockSeconds)
    if (!claimed) return waitForOtherRefresher(id, row.version)
    // Someone else refreshed between our read and our claim: use theirs.
    if (claimed.version !== row.version && fresh(claimed.accessExpiresAt)) {
      await deps.store.releaseRefresh(id)
      return decryptToken(claimed.accessTokenEnc, id)
    }

    let tokens
    try {
      const refreshToken = await decryptToken(claimed.refreshTokenEnc, id)
      const timedFetch: FetchLike = (url, init) => (deps.fetch ?? fetch)(url, { ...init, signal: AbortSignal.timeout(refreshTimeoutMs) })
      tokens = await refreshTokens({ issuer: deps.issuer, fetch: timedFetch }, refreshToken)
    } catch (e) {
      if (e instanceof OrbioOAuthError && e.code === 'invalid_grant') {
        await deps.store.markDisconnected(id)
        throw new OrbioReconnectRequired()
      }
      await deps.store.releaseRefresh(id)
      throw e
    }

    // Save the new refresh token before the new access token is used anywhere.
    await saveWithRetry(id, {
      accessTokenEnc: await encryptToken(tokens.access_token, id),
      refreshTokenEnc: await encryptToken(tokens.refresh_token, id),
      accessExpiresAt: now() + tokens.expires_in * 1000,
      scope: tokens.scope ?? claimed.scope,
    })
    return tokens.access_token
  }

  return {
    /** A valid access token for this session, refreshing if needed. Throws OrbioReconnectRequired when signed out. */
    getAccessToken(sessionId: string, opts: { forceRefresh?: boolean } = {}): Promise<string> {
      if (isSampleSession(sessionId)) return Promise.reject(new Error('This is a sample sign-in, so it cannot use Orbio. Sign in for real on the live app.'))
      const key = `${sessionId}:${opts.forceRefresh ? 'force' : 'normal'}`
      const existing = inflight.get(key)
      if (existing) return existing
      const p = run(sessionId, !!opts.forceRefresh).finally(() => inflight.delete(key))
      inflight.set(key, p)
      return p
    },
  }
}

export type OrbioTokenManager = ReturnType<typeof createOrbioTokenManager>
