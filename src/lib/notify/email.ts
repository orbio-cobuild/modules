/** Email providers: Resend (default) and Orbio mail (AgentMail through Orbio). */
import type { EmailProvider, OrbioClient, SendResult } from './types'

export function isEmail(v: string): boolean {
  return /^[^\s@<>()]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/.test(v)
}

/** Resend over plain fetch. RESEND_API_KEY is server-only. Resend also de-duplicates by Idempotency-Key. */
export function resendProvider(opts: { apiKey: string; fetch?: typeof fetch }): EmailProvider {
  const f = opts.fetch ?? fetch
  return {
    name: 'resend',
    async send(msg): Promise<SendResult> {
      let res: Response
      try {
        res = await f('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json', 'idempotency-key': msg.idempotencyKey.slice(0, 256) },
          body: JSON.stringify({ from: msg.from, to: [msg.to], subject: msg.subject, text: msg.text, ...(msg.replyTo ? { reply_to: msg.replyTo } : {}) }),
        })
      } catch (err) {
        return { status: 'unknown', error: `Couldn't confirm the email send: ${(err as Error).message}` }
      }
      const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
      if (res.ok && json.id) return { status: 'sent', ref: `resend:${json.id}` }
      if (res.status === 429) return { status: 'retry', error: 'The email service asked us to slow down.', retryAfterSeconds: 60 }
      if (res.status >= 500 || res.ok) return { status: 'unknown', error: `The email service had a problem (${res.status}).` }
      return { status: 'failed', error: `The email service refused the message: ${json.message ?? res.status}` }
    },
  }
}

/**
 * Orbio mail (UNTESTED against the live API). Orbio's SDK documents
 * `infra.mail.drafts.send(id, { draft_id, max_cost: "0.05", idempotency_key })` at 0.05 CREDIT per send,
 * and an inbox at 2.30 CREDIT a month (created by the platform, not here). The method names below
 * ('mail.drafts.create', 'mail.drafts.send') are our best reading of the SDK and must be checked
 * against /api/v1/infra/tools before use. Creating a draft is free; sending it is the paid step.
 */
export function orbioMailProvider(opts: { orbio: OrbioClient; inboxId: string; projectId: string }): EmailProvider {
  return {
    name: 'orbio-mail',
    async send(msg): Promise<SendResult> {
      let draftId: string
      try {
        const draft = await opts.orbio.paidCall<{ draft_id?: string; id?: string }>(
          'mail.drafts.create',
          { inbox_id: opts.inboxId, to: [msg.to], subject: msg.subject, text: msg.text, ...(msg.replyTo ? { reply_to: msg.replyTo } : {}) },
          { maxCostMicro: 0n, projectId: opts.projectId },
        )
        draftId = draft.draft_id ?? draft.id ?? ''
        if (!draftId) return { status: 'failed', error: "Orbio mail didn't return a draft." }
      } catch (err) {
        return { status: 'failed', error: `Couldn't prepare the email: ${(err as Error).message}` }
      }
      try {
        const sent = await opts.orbio.paidCall<{ message_id?: string; operation_id?: string }>(
          'mail.drafts.send',
          { inbox_id: opts.inboxId, draft_id: draftId, idempotency_key: msg.idempotencyKey },
          { maxCostMicro: 50_000n, projectId: opts.projectId },
        )
        return { status: 'sent', ref: `orbio:${sent.message_id ?? sent.operation_id ?? draftId}` }
      } catch (err) {
        // Orbio: "uncertain sends are never replayed".
        return { status: 'unknown', error: `Couldn't confirm the email send: ${(err as Error).message}` }
      }
    },
  }
}
