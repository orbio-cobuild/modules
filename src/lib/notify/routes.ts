/** Route handler factories (approval callback and Telegram webhook). */
import { NextResponse } from 'next/server'
import type { JobStore } from '@/lib/jobs/store'
import { handleWebhookOnce, verifyHmacSignature, verifyTelegramSecret } from '@/lib/jobs/webhooks'
import { escapeFor } from './format'
import { applyDecision, type NotifyDeps } from './outbox'
import { sendTelegram } from './telegram'
import type { ApprovalDecision } from './types'

const DECISIONS: ApprovalDecision[] = ['approved', 'rejected', 'expired', 'stale']

/**
 * POST /api/notify/approval
 * Body: { approvalId, decision: approved|rejected|expired|stale, payloadHash }
 * Header: x-cofounder-signature: sha256=<hex HMAC-SHA256 of the raw body with NOTIFY_APPROVAL_SECRET>
 */
export function createApprovalCallback(getDeps: () => Pick<NotifyDeps, 'store'>, secret: () => string | undefined = () => process.env.NOTIFY_APPROVAL_SECRET) {
  async function POST(req: Request) {
    const raw = await req.text()
    const key = secret()
    if (!key || !verifyHmacSignature({ secret: key, payload: raw, signature: req.headers.get('x-cofounder-signature'), prefix: 'sha256=' })) {
      return NextResponse.json({ error: 'Not allowed.' }, { status: 401 })
    }
    let body: { approvalId?: unknown; decision?: unknown; payloadHash?: unknown }
    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: "The body isn't valid JSON." }, { status: 400 })
    }
    if (typeof body.approvalId !== 'string' || !DECISIONS.includes(body.decision as ApprovalDecision) || typeof body.payloadHash !== 'string') {
      return NextResponse.json({ error: 'Send approvalId, decision and payloadHash.' }, { status: 400 })
    }
    const result = await applyDecision(getDeps(), { approvalId: body.approvalId, decision: body.decision as ApprovalDecision, payloadHash: body.payloadHash })
    return NextResponse.json(result, { status: result.outcome === 'stale' ? 409 : 200 })
  }
  return { POST }
}

interface TelegramUpdate {
  update_id: number
  message?: { text?: string; chat?: { id: number; type?: string }; from?: { username?: string } }
}

/**
 * POST /api/notify/telegram (set with setWebhook and a secret_token = TELEGRAM_WEBHOOK_SECRET).
 * /start subscribes the chat, /stop unsubscribes. Replies to these commands are direct answers to
 * the person who asked, so they don't go through approval.
 */
export function createTelegramWebhook(
  getDeps: () => Pick<NotifyDeps, 'store' | 'settings' | 'telegramToken' | 'fetch'> & { jobStore: JobStore },
  secret: () => string | undefined = () => process.env.TELEGRAM_WEBHOOK_SECRET,
) {
  async function POST(req: Request) {
    const deps = getDeps()
    if (!deps.settings.telegram.webhook) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    if (!verifyTelegramSecret(req, secret())) return NextResponse.json({ error: 'Not allowed.' }, { status: 401 })
    const raw = await req.text()
    const update = JSON.parse(raw) as TelegramUpdate
    const msg = update.message
    const chatId = msg?.chat?.id
    const cmd = msg?.text?.trim().split(/[\s@]/)[0]?.toLowerCase()
    if (chatId === undefined || (cmd !== '/start' && cmd !== '/stop')) return NextResponse.json({ ok: true, ignored: true })

    const outcome = await handleWebhookOnce({
      store: deps.jobStore,
      source: 'telegram',
      eventId: String(update.update_id),
      payload: raw,
      handler: async () => {
        const subscribe = cmd === '/start'
        await deps.store.subscribe('telegram', String(chatId), msg?.from?.username ?? null, subscribe)
        if (deps.telegramToken) {
          const mode = deps.settings.telegram.parseMode
          const text = subscribe ? (deps.settings.telegram.welcome ?? "You're subscribed. Send /stop any time.") : "You're unsubscribed. Send /start to come back."
          await sendTelegram({ token: deps.telegramToken, chatId: String(chatId), text: escapeFor(mode, text), parseMode: mode, ...(deps.fetch ? { fetch: deps.fetch } : {}) })
        }
        return subscribe ? 'subscribed' : 'unsubscribed'
      },
    })
    return NextResponse.json({ ok: true, duplicate: !outcome.handled })
  }
  return { POST }
}
