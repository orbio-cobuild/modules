import type { Address, Hex } from 'viem'
import type { TokenSymbol } from './config-schema'
import { createServerDb } from '@/lib/db/server'

export interface NewPayment {
  intentId: string
  kind: 'checkout' | 'tip'
  productId: string | null
  chainId: number
  txHash: Hex
  logIndex: number
  blockNumber: bigint
  token: TokenSymbol
  tokenAddress: Address
  payer: Address
  recipient: Address
  amountRaw: bigint
  userAddress: Address | null
}

export interface PaymentRecord extends NewPayment {
  id: string
  fulfilledAt: string | null
  createdAt: string
}

export type RecordOutcome =
  | { outcome: 'created' | 'existing'; payment: PaymentRecord }
  | { outcome: 'intent_used' | 'transfer_used' }

/** Public view of a payment (all of it is already public on-chain). */
export interface PublicPayment {
  kind: 'checkout' | 'tip'
  token: TokenSymbol
  amountRaw: bigint
  payer: Address
  txHash: Hex
  createdAt: string
}

export interface PaymentStore {
  /** Idempotent: one row per intent and one per on-chain transfer (chain, tx, log index). */
  record(p: NewPayment): Promise<RecordOutcome>
  getByIntent(intentId: string): Promise<PaymentRecord | null>
  /** True exactly once per payment: use it to fulfil an order exactly once. */
  claimFulfilment(paymentId: string): Promise<boolean>
  recent(kind: 'checkout' | 'tip' | null, chainId: number, limit: number): Promise<PublicPayment[]>
  /** True the first time a provider event id is seen (webhook idempotency, e.g. Stripe). */
  markWebhookSeen(provider: string, eventId: string): Promise<boolean>
}

export class MemoryPaymentStore implements PaymentStore {
  rows: PaymentRecord[] = []
  seen = new Set<string>()
  async record(p: NewPayment): Promise<RecordOutcome> {
    const byIntent = this.rows.find((r) => r.intentId === p.intentId)
    if (byIntent) {
      return byIntent.chainId === p.chainId && byIntent.txHash.toLowerCase() === p.txHash.toLowerCase()
        ? { outcome: 'existing', payment: byIntent }
        : { outcome: 'intent_used' }
    }
    if (this.rows.some((r) => r.chainId === p.chainId && r.txHash.toLowerCase() === p.txHash.toLowerCase() && r.logIndex === p.logIndex)) {
      return { outcome: 'transfer_used' }
    }
    const row: PaymentRecord = { ...p, id: crypto.randomUUID(), fulfilledAt: null, createdAt: new Date().toISOString() }
    this.rows.push(row)
    return { outcome: 'created', payment: row }
  }
  async getByIntent(intentId: string) {
    return this.rows.find((r) => r.intentId === intentId) ?? null
  }
  async claimFulfilment(id: string) {
    const r = this.rows.find((x) => x.id === id)
    if (!r || r.fulfilledAt) return false
    r.fulfilledAt = new Date().toISOString()
    return true
  }
  async recent(kind: 'checkout' | 'tip' | null, chainId: number, limit: number) {
    return this.rows
      .filter((r) => r.chainId === chainId && (!kind || r.kind === kind))
      .slice(-limit)
      .reverse()
      .map((r) => ({ kind: r.kind, token: r.token, amountRaw: r.amountRaw, payer: r.payer, txHash: r.txHash, createdAt: r.createdAt }))
  }
  async markWebhookSeen(provider: string, eventId: string) {
    const k = `${provider}:${eventId}`
    if (this.seen.has(k)) return false
    this.seen.add(k)
    return true
  }
}

type Row = {
  id: string
  intent_id: string
  kind: 'checkout' | 'tip'
  product_id: string | null
  chain_id: number
  tx_hash: Hex
  log_index: number
  block_number: string | number
  token_symbol: TokenSymbol
  token_address: Address
  payer: Address
  recipient: Address
  amount_raw: string | number
  user_address: Address | null
  fulfilled_at: string | null
  created_at: string
}

const fromRow = (r: Row): PaymentRecord => ({
  id: r.id,
  intentId: r.intent_id,
  kind: r.kind,
  productId: r.product_id,
  chainId: r.chain_id,
  txHash: r.tx_hash,
  logIndex: r.log_index,
  blockNumber: BigInt(r.block_number),
  token: r.token_symbol,
  tokenAddress: r.token_address,
  payer: r.payer,
  recipient: r.recipient,
  amountRaw: BigInt(r.amount_raw),
  userAddress: r.user_address,
  fulfilledAt: r.fulfilled_at,
  createdAt: r.created_at,
})

export function supabasePaymentStore(): PaymentStore {
  let client: ReturnType<typeof createServerDb> | undefined
  const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    client ??= createServerDb() // db module: publishable key + x-app-server-key
    const { data, error } = await client.rpc(fn, args)
    if (error) throw new Error(`Payments store: ${error.message}`)
    return data as T
  }
  return {
    async record(p) {
      const rows = await call<{ outcome: string; payment: Row | null }[]>('cofounder_payment_record', {
        p_intent_id: p.intentId,
        p_kind: p.kind,
        p_product_id: p.productId,
        p_chain_id: p.chainId,
        p_tx_hash: p.txHash.toLowerCase(),
        p_log_index: p.logIndex,
        p_block_number: p.blockNumber.toString(),
        p_token_symbol: p.token,
        p_token_address: p.tokenAddress.toLowerCase(),
        p_payer: p.payer.toLowerCase(),
        p_recipient: p.recipient.toLowerCase(),
        p_amount_raw: p.amountRaw.toString(),
        p_user_address: p.userAddress?.toLowerCase() ?? null,
      })
      const r = rows[0]
      if (!r) throw new Error('Payments store: no result')
      if (r.outcome === 'created' || r.outcome === 'existing') return { outcome: r.outcome, payment: fromRow(r.payment!) }
      return { outcome: r.outcome as 'intent_used' | 'transfer_used' }
    },
    async getByIntent(intentId) {
      const rows = await call<Row[]>('cofounder_payment_get_by_intent', { p_intent_id: intentId })
      return rows[0] ? fromRow(rows[0]) : null
    },
    claimFulfilment: (id) => call<boolean>('cofounder_payment_claim_fulfilment', { p_id: id }),
    async recent(kind, chainId, limit) {
      const rows = await call<{ kind: 'checkout' | 'tip'; token_symbol: TokenSymbol; amount_raw: string; payer: Address; tx_hash: Hex; created_at: string }[]>(
        'cofounder_payments_recent',
        { p_kind: kind, p_chain_id: chainId, p_limit: limit },
      )
      return rows.map((r) => ({ kind: r.kind, token: r.token_symbol, amountRaw: BigInt(r.amount_raw), payer: r.payer, txHash: r.tx_hash, createdAt: r.created_at }))
    },
    markWebhookSeen: (provider, eventId) => call<boolean>('cofounder_payment_webhook_seen', { p_provider: provider, p_event_id: eventId }),
  }
}
