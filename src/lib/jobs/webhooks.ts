/**
 * Webhook signature checks and once-only handling.
 * Always verify against the RAW body: read `await req.text()` first, verify, then JSON.parse.
 */
import { createHash, createHmac } from 'node:crypto'
import { safeEqual } from './auth'
import type { JobStore } from './store'

export type HmacAlgorithm = 'sha256' | 'sha1' | 'sha512'

/** Generic HMAC: signature = prefix + hex|base64(HMAC(secret, payload)). e.g. GitHub: prefix "sha256=". */
export function verifyHmacSignature(opts: {
  secret: string
  payload: string
  signature: string | null | undefined
  algorithm?: HmacAlgorithm
  encoding?: 'hex' | 'base64'
  prefix?: string
}): boolean {
  if (!opts.secret || !opts.signature) return false
  const digest = createHmac(opts.algorithm ?? 'sha256', opts.secret).update(opts.payload, 'utf8').digest(opts.encoding ?? 'hex')
  return safeEqual(opts.signature, `${opts.prefix ?? ''}${digest}`)
}

/**
 * Timestamped scheme (Stripe style): header `t=<unix>,v1=<hex>[,v1=<hex>]`, signed over `${t}.${payload}`.
 * Rejects signatures older than toleranceSeconds (default 5 minutes) to stop replays.
 */
export function verifyTimestampedSignature(opts: {
  secret: string
  payload: string
  header: string | null | undefined
  toleranceSeconds?: number
  now?: Date
}): boolean {
  if (!opts.secret || !opts.header) return false
  const parts = opts.header.split(',').map((p) => p.trim().split('=') as [string, string])
  const t = parts.find(([k]) => k === 't')?.[1]
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !/^\d+$/.test(t) || sigs.length === 0) return false
  const age = Math.abs((opts.now ?? new Date()).getTime() / 1000 - Number(t))
  if (age > (opts.toleranceSeconds ?? 300)) return false
  const expected = createHmac('sha256', opts.secret).update(`${t}.${opts.payload}`, 'utf8').digest('hex')
  return sigs.some((s) => safeEqual(s, expected))
}

/**
 * Standard Webhooks (standardwebhooks.com; used by Resend, Svix, Supabase and others).
 * Headers webhook-id, webhook-timestamp, webhook-signature ("v1,<base64> v1,<base64>").
 * Secret looks like "whsec_<base64>".
 */
export function verifyStandardWebhook(opts: {
  secret: string
  payload: string
  id: string | null | undefined
  timestamp: string | null | undefined
  signature: string | null | undefined
  toleranceSeconds?: number
  now?: Date
}): boolean {
  const { id, timestamp, signature } = opts
  if (!opts.secret || !id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false
  const age = Math.abs((opts.now ?? new Date()).getTime() / 1000 - Number(timestamp))
  if (age > (opts.toleranceSeconds ?? 300)) return false
  const key = Buffer.from(opts.secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${opts.payload}`, 'utf8').digest('base64')
  return signature
    .split(' ')
    .map((s) => s.split(','))
    .some(([v, sig]) => v === 'v1' && typeof sig === 'string' && safeEqual(sig, expected))
}

/** Telegram sends the secret_token you set with setWebhook in X-Telegram-Bot-Api-Secret-Token. */
export function verifyTelegramSecret(req: Request, secret: string | undefined): boolean {
  if (!secret) return false
  return safeEqual(req.headers.get('x-telegram-bot-api-secret-token') ?? '', secret)
}

export function sha256Hex(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}

export type WebhookOutcome =
  | { handled: true; reason: 'new' | 'retry'; result: unknown }
  | { handled: false; reason: 'duplicate' | 'in_progress' }

/**
 * Runs `handler` at most once per (source, eventId). A duplicate delivery returns handled:false.
 * If the handler throws, the event is marked failed and the sender's retry will run it again.
 */
export async function handleWebhookOnce<T>(opts: {
  store: JobStore
  source: string
  eventId: string
  payload: string
  handler: () => Promise<T>
}): Promise<WebhookOutcome> {
  const claim = await opts.store.webhookClaim(opts.source, opts.eventId, sha256Hex(opts.payload))
  if (!claim.claimed) return { handled: false, reason: claim.reason as 'duplicate' | 'in_progress' }
  try {
    const result = await opts.handler()
    await opts.store.webhookFinish(opts.source, opts.eventId, true)
    return { handled: true, reason: claim.reason as 'new' | 'retry', result }
  } catch (err) {
    await opts.store.webhookFinish(opts.source, opts.eventId, false, err instanceof Error ? err.message : String(err))
    throw err
  }
}
