/** The outbox, through the SQL functions in 0001_notify.sql. */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OutboxRow } from './types'

type Rpc = Pick<SupabaseClient, 'rpc'>

async function call<T>(db: Rpc, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw new Error(`${fn} failed: ${error.message}`)
  return data as T
}

export interface EnqueueItem {
  channel: OutboxRow['channel']
  recipient: string
  subject: string | null
  content: string
  template: string | null
  content_hash: string
  approval_hash: string
  batch_id: string | null
  needs_approval: boolean
  token_related: boolean
  state: 'pending_approval' | 'approved' | 'blocked'
  block_reasons?: string[]
  idempotency_key: string
}

export interface NotifyStore {
  enqueue(item: EnqueueItem): Promise<{ id: string; state: string; created: boolean; approvalId: string | null }>
  setApproval(ids: string[], approvalId: string): Promise<number>
  applyDecision(approvalId: string, decision: string, payloadHash: string): Promise<{ updated: number; outcome: string }>
  claimBatch(limit: number, leaseSeconds: number): Promise<OutboxRow[]>
  finish(id: string, outcome: 'sent' | 'failed' | 'retry' | 'unknown', providerRef: string | null, error: string | null, retrySeconds: number): Promise<string | null>
  markStuckUnknown(): Promise<number>
  needingRequest(limit: number): Promise<OutboxRow[]>
  openApprovals(limit: number): Promise<string[]>
  subscribe(channel: string, address: string, username: string | null, subscribed: boolean): Promise<void>
  subscribers(channel: string): Promise<string[]>
}

export function supabaseNotifyStore(db: Rpc): NotifyStore {
  return {
    async enqueue(item) {
      const rows = await call<Array<{ id: string; state: string; created: boolean; approval_id: string | null }>>(db, 'notify_enqueue', { p_item: item })
      const r = rows[0]!
      return { id: r.id, state: r.state, created: r.created, approvalId: r.approval_id }
    },
    setApproval: (ids, approvalId) => call<number>(db, 'notify_set_approval', { p_ids: ids, p_approval_id: approvalId }),
    async applyDecision(approvalId, decision, payloadHash) {
      const rows = await call<Array<{ updated: number; outcome: string }>>(db, 'notify_apply_decision', {
        p_approval_id: approvalId,
        p_decision: decision,
        p_payload_hash: payloadHash,
      })
      return rows[0]!
    },
    claimBatch: (limit, leaseSeconds) => call<OutboxRow[]>(db, 'notify_claim_batch', { p_limit: limit, p_lease_seconds: leaseSeconds }),
    finish: (id, outcome, providerRef, error, retrySeconds) =>
      call<string | null>(db, 'notify_finish', { p_id: id, p_outcome: outcome, p_provider_ref: providerRef, p_error: error, p_retry_seconds: retrySeconds }),
    markStuckUnknown: () => call<number>(db, 'notify_mark_stuck_unknown'),
    needingRequest: (limit) => call<OutboxRow[]>(db, 'notify_needing_request', { p_limit: limit }),
    async openApprovals(limit) {
      const rows = await call<Array<{ approval_id: string }>>(db, 'notify_open_approvals', { p_limit: limit })
      return rows.map((r) => r.approval_id)
    },
    async subscribe(channel, address, username, subscribed) {
      await call(db, 'notify_subscribe', { p_channel: channel, p_address: address, p_username: username, p_subscribed: subscribed })
    },
    async subscribers(channel) {
      const rows = await call<Array<{ address: string }>>(db, 'notify_subscribers_list', { p_channel: channel })
      return rows.map((r) => r.address)
    },
  }
}
