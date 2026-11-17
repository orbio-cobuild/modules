/** Telegram Bot API. TELEGRAM_BOT_TOKEN is server-only. */
import type { ParseMode } from './format'
import type { SendResult } from './types'

export const TELEGRAM_MAX_LENGTH = 4096

export function isTelegramChatId(v: string): boolean {
  return /^-?\d{1,20}$/.test(v) || /^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(v)
}

export async function sendTelegram(opts: {
  token: string
  chatId: string
  text: string
  parseMode: ParseMode
  fetch?: typeof fetch
  signal?: AbortSignal
}): Promise<SendResult> {
  const f = opts.fetch ?? fetch
  const body: Record<string, unknown> = { chat_id: opts.chatId, text: opts.text, link_preview_options: { is_disabled: true } }
  if (opts.parseMode !== 'plain') body.parse_mode = opts.parseMode
  let res: Response
  try {
    res = await f(`https://api.telegram.org/bot${opts.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(opts.signal ? { signal: opts.signal } : {}),
    })
  } catch (err) {
    // The request may have reached Telegram before the connection dropped.
    return { status: 'unknown', error: `Couldn't confirm the Telegram send: ${(err as Error).message}` }
  }
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    result?: { message_id?: number }
    description?: string
    parameters?: { retry_after?: number }
  }
  if (res.ok && json.ok) return { status: 'sent', ref: `tg:${json.result?.message_id ?? ''}` }
  if (res.status === 429) return { status: 'retry', error: 'Telegram asked us to slow down.', retryAfterSeconds: json.parameters?.retry_after ?? 30 }
  if (res.status >= 500) return { status: 'unknown', error: `Telegram had a problem (${res.status}).` }
  return { status: 'failed', error: `Telegram refused the message: ${json.description ?? res.status}` }
}
