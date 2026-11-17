import { getAddress, isHash, type Hex } from 'viem'
import { z } from 'zod'
import { getWalletSessionFromRequest } from '@/lib/auth-wallet/server'
import { getChainId, getPublicClient } from './chain'
import { getPaymentsConfig } from './config'
import { TOKEN_SYMBOLS, type PaymentsConfig } from './config-schema'
import { readIntent, signIntent, type PaymentIntent } from './intent'
import { supabasePaymentStore, type PaymentStore } from './store'
import { formatAmount, tokenAddress } from './tokens'
import { buildTransferTx, toJson } from './unsigned-tx'
import { verifyPayment, type VerifyDeps } from './verify'

export interface HandlerDeps {
  config?: PaymentsConfig
  store?: PaymentStore
  publicClient?: VerifyDeps['publicClient']
  now?: () => number
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
const fail = (status: number, code: string, error: string) => json({ code, error }, status)

const intentBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('checkout'), productId: z.string().min(1).max(64), token: z.enum(TOKEN_SYMBOLS) }),
  z.object({ kind: z.literal('tip'), amountMicro: z.string().regex(/^\d{1,18}$/), token: z.enum(TOKEN_SYMBOLS) }),
])

/** POST /api/payments/intent → { intent, tx, summary } */
export async function handleCreateIntent(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  const config = deps.config ?? getPaymentsConfig()
  let body: z.infer<typeof intentBody>
  try {
    body = intentBody.parse(await req.json())
  } catch {
    return fail(400, 'bad_request', "We couldn't read that payment request. Please try again.")
  }
  const chainId = getChainId()
  let amountRaw: bigint
  let productId: string | null = null
  let label: string
  if (body.kind === 'checkout') {
    const product = config.products.find((p) => p.id === body.productId)
    if (!product) return fail(404, 'unknown_product', "That item isn't for sale.")
    if (!product.tokens.includes(body.token)) return fail(400, 'token_not_accepted', `${product.name} can't be paid in ${body.token}.`)
    amountRaw = product.priceMicro
    productId = product.id
    label = `Pay ${formatAmount(amountRaw)} ${body.token} for ${product.name}`
  } else {
    if (!config.tips.enabled) return fail(400, 'tips_off', "This project isn't taking tips.")
    if (!config.tips.tokens.includes(body.token)) return fail(400, 'token_not_accepted', `Tips can't be paid in ${body.token}.`)
    amountRaw = BigInt(body.amountMicro)
    if (amountRaw < config.tips.minMicro || amountRaw > config.tips.maxMicro) {
      return fail(400, 'amount_out_of_range', `Tips must be between ${formatAmount(config.tips.minMicro)} and ${formatAmount(config.tips.maxMicro)} ${body.token}.`)
    }
    label = `Tip ${formatAmount(amountRaw)} ${body.token}`
  }

  let token
  try {
    token = tokenAddress(body.token, chainId, config)
  } catch (e) {
    return fail(400, 'token_unavailable', (e as Error).message)
  }
  const session = await getWalletSessionFromRequest(req)
  const now = Math.floor((deps.now?.() ?? Date.now()) / 1000)
  const intent: PaymentIntent = {
    id: crypto.randomUUID(),
    kind: body.kind,
    productId,
    token: body.token,
    tokenAddress: token,
    amountRaw,
    recipient: getAddress(config.recipient),
    payer: session?.address ?? null,
    chainId,
    issuedAt: now,
    payBy: now + config.intentTtlSeconds,
  }
  const tx = buildTransferTx({ chainId, token, recipient: intent.recipient, amountRaw, description: label })
  return json({
    intent: await signIntent(intent),
    intentId: intent.id,
    tx: toJson(tx),
    summary: { kind: intent.kind, productId, token: intent.token, amount: formatAmount(amountRaw), amountMicro: amountRaw.toString(), recipient: intent.recipient, payBy: intent.payBy },
  })
}

const verifyBody = z.object({ intent: z.string().min(10).max(4000), txHash: z.string().refine((h) => isHash(h), 'tx hash') })

/**
 * POST /api/payments/verify { intent, txHash }
 * 200 confirmed · 202 pending (call again) · 409 already used · 422 not a valid payment.
 * Safe to call any number of times: the record is keyed by the intent and by the on-chain transfer.
 */
export async function handleVerify(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  const config = deps.config ?? getPaymentsConfig()
  let body: z.infer<typeof verifyBody>
  try {
    body = verifyBody.parse(await req.json())
  } catch {
    return fail(400, 'bad_request', "We couldn't read that payment. Please try again.")
  }
  const intent = await readIntent(body.intent)
  if (!intent) return fail(400, 'bad_intent', 'This checkout link is not valid. Please start again.')

  const result = await verifyPayment(intent, body.txHash as Hex, {
    publicClient: deps.publicClient ?? getPublicClient(),
    store: deps.store ?? supabasePaymentStore(),
    chainId: getChainId(),
    minConfirmations: config.minConfirmations,
  })
  if (result.status === 'confirmed') {
    const p = result.payment
    return json({ status: 'confirmed', created: result.created, payment: { id: p.id, kind: p.kind, productId: p.productId, token: p.token, amount: formatAmount(p.amountRaw), payer: p.payer, txHash: p.txHash } })
  }
  if (result.status === 'pending') return json(result, 202)
  return json({ status: 'rejected', code: result.code, error: result.message }, result.code === 'intent_used' || result.code === 'transfer_used' ? 409 : 422)
}

/** GET /api/payments/recent?kind=tip&limit=10: public feed (all of it is already public on-chain). */
export async function handleRecent(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  const url = new URL(req.url)
  const kindParam = url.searchParams.get('kind')
  const kind = kindParam === 'tip' || kindParam === 'checkout' ? kindParam : null
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 10))
  const rows = await (deps.store ?? supabasePaymentStore()).recent(kind, getChainId(), limit)
  return json({ payments: rows.map((r) => ({ ...r, amount: formatAmount(r.amountRaw), amountRaw: undefined })) })
}
