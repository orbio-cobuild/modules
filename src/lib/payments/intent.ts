import { jwtVerify, SignJWT } from 'jose'
import { getAddress, type Address } from 'viem'
import type { TokenSymbol } from './config-schema'

/**
 * What the server agreed to accept: amount, token, recipient and (if signed in) payer. It is signed so the client
 * can't change it, and it needs no database row until the payment is verified.
 */
export interface PaymentIntent {
  id: string
  kind: 'checkout' | 'tip'
  productId: string | null
  token: TokenSymbol
  tokenAddress: Address
  amountRaw: bigint
  recipient: Address
  payer: Address | null
  chainId: number
  /** Unix seconds. */
  issuedAt: number
  /** Unix seconds: the payment's block must be no later than this. */
  payBy: number
}

function key(): Uint8Array {
  const s = process.env.PAYMENTS_SECRET
  if (!s || s.length < 32) throw new Error('Payments are not set up yet: PAYMENTS_SECRET must be at least 32 characters.')
  return new TextEncoder().encode(s)
}

export async function signIntent(i: PaymentIntent): Promise<string> {
  return new SignJWT({
    typ: 'payment_intent',
    kind: i.kind,
    productId: i.productId,
    token: i.token,
    tokenAddress: i.tokenAddress,
    amountRaw: i.amountRaw.toString(),
    recipient: i.recipient,
    payer: i.payer,
    chainId: i.chainId,
    payBy: i.payBy,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(i.id)
    .setIssuedAt(i.issuedAt)
    .sign(key())
}

/** Checks the signature only. The time window is checked against the payment's block, not the clock. */
export async function readIntent(token: string): Promise<PaymentIntent | null> {
  try {
    const { payload: p } = await jwtVerify(token, key(), { algorithms: ['HS256'] })
    if (p.typ !== 'payment_intent' || typeof p.jti !== 'string' || typeof p.iat !== 'number') return null
    return {
      id: p.jti,
      kind: p.kind === 'tip' ? 'tip' : 'checkout',
      productId: typeof p.productId === 'string' ? p.productId : null,
      token: p.token as TokenSymbol,
      tokenAddress: getAddress(String(p.tokenAddress)),
      amountRaw: BigInt(String(p.amountRaw)),
      recipient: getAddress(String(p.recipient)),
      payer: typeof p.payer === 'string' ? getAddress(p.payer) : null,
      chainId: Number(p.chainId),
      issuedAt: p.iat,
      payBy: Number(p.payBy),
    }
  } catch {
    return null
  }
}
