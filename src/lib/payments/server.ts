/** Server-only helpers for project code. Never import from a 'use client' file. */
import { getChainId, getPublicClient } from './chain'
import { getPaymentsConfig } from './config'
import { readIntent } from './intent'
import { supabasePaymentStore, type PaymentStore } from './store'
import { verifyPayment } from './verify'
import type { Hex } from 'viem'

export type { PaymentRecord, PublicPayment } from './store'
export { formatAmount } from './tokens'

let store: PaymentStore | undefined
export const getPaymentStore = () => (store ??= supabasePaymentStore())

/** Verify a payment from a project route or Server Action. Same rules as /api/payments/verify. */
export async function verifyPaymentFromIntent(intentToken: string, txHash: Hex) {
  const intent = await readIntent(intentToken)
  if (!intent) return { status: 'rejected' as const, code: 'bad_intent' as const, message: 'This checkout link is not valid.' }
  return verifyPayment(intent, txHash, {
    publicClient: getPublicClient(),
    store: getPaymentStore(),
    chainId: getChainId(),
    minConfirmations: getPaymentsConfig().minConfirmations,
  })
}

/**
 * Fulfil an order exactly once, even if called from several places or retried:
 *   if (await claimFulfilment(payment.id)) { grantAccess(...) }
 */
export const claimFulfilment = (paymentId: string) => getPaymentStore().claimFulfilment(paymentId)

/** Has this checkout (intent id) been paid and recorded? */
export const getPaymentByIntent = (intentId: string) => getPaymentStore().getByIntent(intentId)
