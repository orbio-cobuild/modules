/**
 * Queue, approve and send. Nothing leaves the app without a row in the outbox, and nothing that
 * needs approval is sent before an approval whose payload hash matches the row.
 *
 *   queueNotification / queueBroadcast  -> row(s) in state blocked | pending_approval | approved
 *   applyDecision (callback or poll)    -> approved | rejected (or 'stale' if the content changed)
 *   drainOutbox (cron job)              -> sending -> sent | failed | unknown (never resent)
 */
import { canonicalJson, sha256 } from './approvals'
import { checkClaims, isTokenRelated } from './claims'
import { isEmail } from './email'
import { renderTemplate, stripTags } from './format'
import type { NotifyStore } from './store'
import { isTelegramChatId, sendTelegram, TELEGRAM_MAX_LENGTH } from './telegram'
import type { ApprovalDecision, ApprovalRequester, ApprovalStatusReader, Channel, EmailProvider, NotifySettings, OutboxRow, SendResult } from './types'

export interface NotifyDeps {
  settings: NotifySettings
  store: NotifyStore
  approvals: ApprovalRequester
  approvalStatus?: ApprovalStatusReader
  projectId: string
  telegramToken?: string
  email?: EmailProvider
  fetch?: typeof fetch
}

export interface QueueInput {
  channel: Channel
  /** Telegram chat id or @channel, or an email address. */
  to: string
  /** Use a template from the config... */
  template?: string
  vars?: Record<string, string | number>
  /** ...or raw text (always needs approval). */
  text?: string
  subject?: string
  /** Same key = same message. Use something stable, e.g. `digest:2026-11-06`. */
  idempotencyKey: string
}

export interface QueueResult {
  ids: string[]
  state: 'pending_approval' | 'approved' | 'blocked' | string
  needsApproval: boolean
  blockedReasons: string[]
  duplicate: boolean
}

function resolveContent(s: NotifySettings, input: Omit<QueueInput, 'to'>): { content: string; subject: string | null; template: string | null; transactional: boolean } {
  const mode = input.channel === 'telegram' ? s.telegram.parseMode : 'plain'
  if (input.template) {
    const t = s.templates.find((x) => x.name === input.template && x.channel === input.channel)
    if (!t) throw new Error(`There is no ${input.channel} template called "${input.template}".`)
    const vars = input.vars ?? {}
    return {
      content: renderTemplate(t.body, vars, mode),
      subject: t.subject ? renderTemplate(t.subject, vars, 'plain') : (input.subject ?? null),
      template: t.name,
      transactional: t.transactional,
    }
  }
  if (!input.text?.trim()) throw new Error('A message needs a template or some text.')
  return { content: input.text, subject: input.subject ?? null, template: null, transactional: false }
}

function checkRecipient(channel: Channel, to: string) {
  if (channel === 'telegram' && !isTelegramChatId(to)) throw new Error(`"${to}" isn't a Telegram chat id.`)
  if (channel === 'email' && !isEmail(to)) throw new Error(`"${to}" isn't an email address.`)
}

function checkChannel(s: NotifySettings, channel: Channel) {
  if (channel === 'telegram' && !s.telegram.enabled) throw new Error('Telegram messages are turned off for this app.')
  if (channel === 'email' && !s.email.enabled) throw new Error('Email is turned off for this app.')
}

/** Decide whether a message may skip approval. Token-related text never can. */
export function needsApproval(s: NotifySettings, channel: Channel, template: string | null, transactional: boolean, tokenRelated: boolean): boolean {
  if (tokenRelated || !template || !transactional) return true
  return !s.preApproved.some((p) => p.channel === channel && p.template === template)
}

function uuidFrom(key: string): string {
  const h = sha256(key)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** Queue one message to one recipient. */
export async function queueNotification(deps: NotifyDeps, input: QueueInput): Promise<QueueResult> {
  return queueBroadcast(deps, { ...input, recipients: [input.to] })
}

/** Queue the same message to many recipients under one approval. */
export async function queueBroadcast(deps: NotifyDeps, input: Omit<QueueInput, 'to'> & { recipients: string[] }): Promise<QueueResult> {
  const s = deps.settings
  checkChannel(s, input.channel)
  const recipients = [...new Set(input.recipients)].sort()
  if (recipients.length === 0) throw new Error('There is nobody to send this to yet.')
  recipients.forEach((r) => checkRecipient(input.channel, r))
  const { content, subject, template, transactional } = resolveContent(s, input)
  if (input.channel === 'telegram' && content.length > TELEGRAM_MAX_LENGTH) throw new Error('Telegram messages can be at most 4,096 characters.')
  if (input.channel === 'email' && !subject) throw new Error('An email needs a subject.')

  const plain = `${subject ?? ''}\n${stripTags(content)}`
  const claims = checkClaims(plain)
  const tokenRelated = isTokenRelated(plain)
  const approval = claims.ok ? needsApproval(s, input.channel, template, transactional, tokenRelated) : true
  const state = !claims.ok ? 'blocked' : approval ? 'pending_approval' : 'approved'
  const approvalHash = sha256(canonicalJson({ channel: input.channel, recipients, subject, content }))
  const batchId = recipients.length > 1 ? uuidFrom(input.idempotencyKey) : null

  const rows = []
  for (const r of recipients) {
    rows.push(
      await deps.store.enqueue({
        channel: input.channel,
        recipient: r,
        subject,
        content,
        template,
        content_hash: sha256(canonicalJson({ channel: input.channel, recipient: r, subject, content })),
        approval_hash: approvalHash,
        batch_id: batchId,
        needs_approval: approval,
        token_related: tokenRelated,
        state,
        ...(claims.ok ? {} : { block_reasons: claims.reasons }),
        idempotency_key: recipients.length > 1 ? `${input.idempotencyKey}:${r}` : input.idempotencyKey,
      }),
    )
  }
  const created = rows.filter((r) => r.created)
  if (state === 'pending_approval' && created.length) {
    await requestApproval(deps, created.map((r) => r.id), { channel: input.channel, recipients, subject, content, tokenRelated, approvalHash, template }).catch((err) =>
      console.error('[notify] approval request failed; the drain job will retry', err),
    )
  }
  return { ids: rows.map((r) => r.id), state: rows[0]!.state, needsApproval: approval, blockedReasons: claims.reasons, duplicate: created.length === 0 }
}

async function requestApproval(
  deps: NotifyDeps,
  ids: string[],
  p: { channel: Channel; recipients: string[]; subject: string | null; content: string; tokenRelated: boolean; approvalHash: string; template: string | null },
) {
  const { approvalId } = await deps.approvals.request('outbound', deps.projectId, {
    channel: p.channel,
    recipients: p.recipients,
    recipientCount: p.recipients.length,
    subject: p.subject,
    content: p.content,
    template: p.template,
    tokenRelated: p.tokenRelated,
    manualReviewRequired: p.tokenRelated,
    notificationIds: ids,
    payloadHash: p.approvalHash,
    estimatedCostMicro: p.channel === 'email' && deps.settings.email.provider === 'orbio-mail' ? String(50_000 * p.recipients.length) : '0',
  })
  await deps.store.setApproval(ids, approvalId)
  return approvalId
}

/** Apply a decision from the platform. 'stale' means the approved content no longer matches. */
export async function applyDecision(deps: Pick<NotifyDeps, 'store'>, d: { approvalId: string; decision: ApprovalDecision; payloadHash: string }) {
  if (d.decision === 'pending') return { updated: 0, outcome: 'pending' }
  return deps.store.applyDecision(d.approvalId, d.decision, d.payloadHash)
}

async function sendOne(deps: NotifyDeps, row: OutboxRow): Promise<SendResult> {
  if (row.channel === 'telegram') {
    if (!deps.telegramToken) return { status: 'failed', error: 'The Telegram bot isn’t connected (TELEGRAM_BOT_TOKEN is missing).' }
    return sendTelegram({ token: deps.telegramToken, chatId: row.recipient, text: row.content, parseMode: deps.settings.telegram.parseMode, ...(deps.fetch ? { fetch: deps.fetch } : {}) })
  }
  if (!deps.email || !deps.settings.email.from) return { status: 'failed', error: 'Email isn’t connected for this app.' }
  return deps.email.send({
    to: row.recipient,
    from: deps.settings.email.from,
    ...(deps.settings.email.replyTo ? { replyTo: deps.settings.email.replyTo } : {}),
    subject: row.subject ?? '',
    text: stripTags(row.content),
    idempotencyKey: row.idempotency_key,
  })
}

export interface DrainReport {
  markedUnknown: number
  approvalsRequested: number
  decisionsApplied: number
  sent: number
  failed: number
  retrying: number
  unknown: number
}

/** One pass of the outbox. Run by the notify-drain job; safe to run concurrently. */
export async function drainOutbox(deps: NotifyDeps, opts: { limit?: number } = {}): Promise<DrainReport> {
  const report: DrainReport = { markedUnknown: 0, approvalsRequested: 0, decisionsApplied: 0, sent: 0, failed: 0, retrying: 0, unknown: 0 }
  report.markedUnknown = await deps.store.markStuckUnknown()

  // 1. ask for approvals that failed to be requested earlier (grouped by broadcast)
  const groups = new Map<string, OutboxRow[]>()
  for (const row of await deps.store.needingRequest(100)) {
    const k = row.batch_id ?? row.id
    groups.set(k, [...(groups.get(k) ?? []), row])
  }
  for (const rows of groups.values()) {
    const first = rows[0]!
    try {
      await requestApproval(deps, rows.map((r) => r.id), {
        channel: first.channel,
        recipients: rows.map((r) => r.recipient).sort(),
        subject: first.subject,
        content: first.content,
        tokenRelated: first.token_related,
        approvalHash: first.approval_hash,
        template: first.template,
      })
      report.approvalsRequested++
    } catch (err) {
      console.error('[notify] approval request failed again', err)
    }
  }

  // 2. poll decisions when a status reader is configured
  if (deps.approvalStatus) {
    for (const id of await deps.store.openApprovals(50)) {
      const st = await deps.approvalStatus.status(id).catch(() => ({ decision: 'pending' as const }))
      if (st.decision === 'pending') continue
      const r = await applyDecision(deps, { approvalId: id, decision: st.decision, payloadHash: 'payloadHash' in st && st.payloadHash ? st.payloadHash : '' })
      if (r.updated > 0) report.decisionsApplied++
    }
  }

  // 3. send what's approved
  for (const row of await deps.store.claimBatch(opts.limit ?? deps.settings.batchSize, 120)) {
    const res = await sendOne(deps, row).catch((err): SendResult => ({ status: 'unknown', error: (err as Error).message }))
    if (res.status === 'sent') {
      await deps.store.finish(row.id, 'sent', res.ref, null, 0)
      report.sent++
    } else if (res.status === 'retry') {
      const st = await deps.store.finish(row.id, 'retry', null, res.error, res.retryAfterSeconds)
      if (st === 'failed') report.failed++
      else report.retrying++
    } else {
      await deps.store.finish(row.id, res.status, null, res.error, 0)
      if (res.status === 'failed') report.failed++
      else report.unknown++
    }
  }
  return report
}

/** Everyone a Telegram broadcast goes to: configured chats plus /start subscribers. */
export async function telegramAudience(deps: Pick<NotifyDeps, 'settings' | 'store'>, extraChatIds: string[] = []): Promise<string[]> {
  return [...new Set([...deps.settings.telegram.chatIds, ...extraChatIds, ...(await deps.store.subscribers('telegram'))])]
}
