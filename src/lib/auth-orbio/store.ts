import { createServerDb } from '@/lib/db/server'
import type { OrbioProfile } from './session'

/** One signed-in Orbio connection. Tokens are AES-256-GCM ciphertext (see crypto.ts), never plaintext. */
export interface StoredOrbioSession {
  id: string
  sub: string
  profile: OrbioProfile
  scope: string
  accessTokenEnc: string
  refreshTokenEnc: string
  /** Unix ms. */
  accessExpiresAt: number
  status: 'active' | 'disconnected'
  /** Bumped on every refresh, so waiters can tell the tokens changed. */
  version: number
}

export interface SavedTokens {
  accessTokenEnc: string
  refreshTokenEnc: string
  accessExpiresAt: number
  scope: string
}

/**
 * Where Orbio tokens live. `claimRefresh` is the "one place" that refreshes: it must be atomic across every
 * server instance (a row lock in Postgres), because a refresh token presented twice disconnects the person.
 */
export interface OrbioSessionStore {
  create(s: Omit<StoredOrbioSession, 'version' | 'status'>): Promise<void>
  get(id: string): Promise<StoredOrbioSession | null>
  /** Atomically take the refresh lock for `lockSeconds`. Returns the row if this caller got the lock, else null. */
  claimRefresh(id: string, lockSeconds: number): Promise<StoredOrbioSession | null>
  /** Save the new tokens and release the lock, in one write. */
  completeRefresh(id: string, tokens: SavedTokens): Promise<void>
  releaseRefresh(id: string): Promise<void>
  markDisconnected(id: string): Promise<void>
  delete(id: string): Promise<void>
}

/** In-memory store for tests and single-process previews. Not for production (no cross-instance lock). */
export class MemoryOrbioSessionStore implements OrbioSessionStore {
  rows = new Map<string, StoredOrbioSession & { lockUntil: number }>()
  async create(s: Omit<StoredOrbioSession, 'version' | 'status'>) {
    this.rows.set(s.id, { ...s, status: 'active', version: 1, lockUntil: 0 })
  }
  async get(id: string) {
    const r = this.rows.get(id)
    if (!r) return null
    const { lockUntil: _l, ...rest } = r
    return { ...rest }
  }
  async claimRefresh(id: string, lockSeconds: number) {
    const r = this.rows.get(id)
    if (!r || r.status !== 'active' || r.lockUntil > Date.now()) return null
    r.lockUntil = Date.now() + lockSeconds * 1000
    return this.get(id)
  }
  async completeRefresh(id: string, t: SavedTokens) {
    const r = this.rows.get(id)
    if (!r) return
    Object.assign(r, t, { lockUntil: 0, version: r.version + 1 })
  }
  async releaseRefresh(id: string) {
    const r = this.rows.get(id)
    if (r) r.lockUntil = 0
  }
  async markDisconnected(id: string) {
    const r = this.rows.get(id)
    if (r) Object.assign(r, { status: 'disconnected', lockUntil: 0, accessTokenEnc: '', refreshTokenEnc: '' })
  }
  async delete(id: string) {
    this.rows.delete(id)
  }
}

type Row = {
  id: string
  sub: string
  profile: OrbioProfile
  scope: string
  access_token_enc: string
  refresh_token_enc: string
  access_expires_at: string
  status: 'active' | 'disconnected'
  version: number
}

const fromRow = (r: Row): StoredOrbioSession => ({
  id: r.id,
  sub: r.sub,
  profile: r.profile,
  scope: r.scope,
  accessTokenEnc: r.access_token_enc,
  refreshTokenEnc: r.refresh_token_enc,
  accessExpiresAt: new Date(r.access_expires_at).getTime(),
  status: r.status,
  version: r.version,
})

/** Supabase store: every call goes through SECURITY DEFINER functions guarded by the server write key. */
export function supabaseOrbioSessionStore(): OrbioSessionStore {
  let client: ReturnType<typeof createServerDb> | undefined
  const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    client ??= createServerDb() // db module: publishable key + x-app-server-key
    const { data, error } = await client.rpc(fn, args)
    if (error) throw new Error(`Orbio session store: ${error.message}`)
    return data as T
  }
  const one = (rows: Row[] | null) => (rows && rows[0] ? fromRow(rows[0]) : null)
  return {
    async create(s) {
      await call('cofounder_orbio_session_create', {
        p_id: s.id,
        p_sub: s.sub,
        p_profile: s.profile,
        p_scope: s.scope,
        p_access_token_enc: s.accessTokenEnc,
        p_refresh_token_enc: s.refreshTokenEnc,
        p_access_expires_at: new Date(s.accessExpiresAt).toISOString(),
      })
    },
    get: async (id) => one(await call<Row[]>('cofounder_orbio_session_get', { p_id: id })),
    claimRefresh: async (id, lockSeconds) => one(await call<Row[]>('cofounder_orbio_session_claim_refresh', { p_id: id, p_lock_seconds: lockSeconds })),
    async completeRefresh(id, t) {
      await call('cofounder_orbio_session_complete_refresh', {
        p_id: id,
        p_access_token_enc: t.accessTokenEnc,
        p_refresh_token_enc: t.refreshTokenEnc,
        p_access_expires_at: new Date(t.accessExpiresAt).toISOString(),
        p_scope: t.scope,
      })
    },
    releaseRefresh: async (id) => void (await call('cofounder_orbio_session_release_refresh', { p_id: id })),
    markDisconnected: async (id) => void (await call('cofounder_orbio_session_disconnect', { p_id: id })),
    delete: async (id) => void (await call('cofounder_orbio_session_delete', { p_id: id })),
  }
}
