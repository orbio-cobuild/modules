/**
 * Optional card payments adapter: INTERFACE AND STUB ONLY (not implemented in the POC).
 *
 * A real adapter must: create a hosted checkout server-side with the secret key; verify every webhook's signature
 * (Stripe-Signature, with STRIPE_WEBHOOK_SECRET) on the raw body; call `store.markWebhookSeen('stripe', event.id)`
 * and ignore events seen before (webhooks are retried); and record the payment only from the verified event,
 * never from the client redirect.
 */
import type { PaymentStore } from './store'

export interface CardCheckoutInput {
  productId: string
  amountMicro: bigint
  currency: 'usd'
  successUrl: string
  cancelUrl: string
  /** Signed-in wallet or user id to link the payment to. */
  customerRef: string | null
}

export interface ProviderWebhookEvent {
  id: string
  type: 'payment.succeeded' | 'payment.failed' | 'payment.refunded' | 'other'
  productId: string | null
  amountMicro: bigint | null
  customerRef: string | null
  raw: unknown
}

export interface CardPaymentAdapter {
  readonly provider: 'stripe'
  createCheckout(input: CardCheckoutInput): Promise<{ url: string; sessionId: string }>
  /** Verifies the signature and parses the event. Throws if the signature is wrong. */
  parseWebhook(req: Request): Promise<ProviderWebhookEvent>
}

export class CardPaymentsNotConfigured extends Error {
  constructor() {
    super('Card payments are not set up for this project.')
  }
}

export const stripeAdapterStub: CardPaymentAdapter = {
  provider: 'stripe',
  async createCheckout() {
    throw new CardPaymentsNotConfigured()
  },
  async parseWebhook() {
    throw new CardPaymentsNotConfigured()
  },
}

/** Webhook-style idempotency helper any provider adapter uses: runs `handle` at most once per event id. */
export async function handleProviderEventOnce(
  store: PaymentStore,
  event: ProviderWebhookEvent,
  provider: string,
  handle: (e: ProviderWebhookEvent) => Promise<void>,
): Promise<'handled' | 'duplicate'> {
  if (!(await store.markWebhookSeen(provider, event.id))) return 'duplicate'
  await handle(event)
  return 'handled'
}
