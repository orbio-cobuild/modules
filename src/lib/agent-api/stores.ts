/** Supabase-backed key store, rate limiter and request log (all via the SQL functions in 0001_agent_api.sql). */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentIdentity, KeyStore, RateLimiter, RequestLogger } from './types'

type Rpc = Pick<SupabaseClient, 'rpc'>

async function call<T>(db: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw new Error(`${fn} failed: ${error.message}`)
  return data as T
}

export function supabaseKeyStore(db: Rpc): KeyStore {
  return {
    async authenticate(keyHash) {
      const rows = await call<Array<{ id: string; prefix: string; label: string; owner_wallet: string | null; scopes: string[]; source: AgentIdentity['source'] }>>(
        db,
        'agent_api_authenticate',
        { p_key_hash: keyHash },
      )
      const r = rows?.[0]
      return r ? { keyId: r.id, prefix: r.prefix, label: r.label, ownerWallet: r.owner_wallet, scopes: r.scopes, source: r.source } : null
    },
    async issue(k) {
      return call<string>(db, 'agent_api_issue_key', {
        p_prefix: k.prefix,
        p_key_hash: k.keyHash,
        p_label: k.label,
        p_scopes: k.scopes,
        p_owner_wallet: k.ownerWallet ?? null,
        p_source: k.source,
      })
    },
    async revoke(prefix) {
      return call<boolean>(db, 'agent_api_revoke_key', { p_prefix: prefix })
    },
  }
}

export function supabaseRateLimiter(db: Rpc): RateLimiter {
  return {
    async hit(subject, op, windowSeconds, limit) {
      const rows = await call<Array<{ allowed: boolean; hits: number; reset_at: string }>>(db, 'agent_api_hit', {
        p_subject: subject,
        p_op: op,
        p_window_seconds: windowSeconds,
        p_limit: limit,
      })
      const r = rows[0]!
      return { allowed: r.allowed, hits: r.hits, resetAt: new Date(r.reset_at) }
    },
  }
}

export function supabaseRequestLogger(db: Rpc): RequestLogger {
  return {
    async log(e) {
      await call(db, 'agent_api_log', {
        p_op: e.op,
        p_transport: e.transport,
        p_key_prefix: e.keyPrefix,
        p_subject_hash: e.subjectHash,
        p_status: e.status,
        p_duration_ms: e.durationMs,
        p_error: e.error ?? null,
      })
    },
  }
}
