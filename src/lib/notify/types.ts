/** Interfaces the notify module codes against (structural copies of docs/workstreams.md). */
import type { ParseMode } from './format'

export type Channel = 'telegram' | 'email'

export interface ApprovalRequester {
  request(
    kind: 'spec' | 'production_deploy' | 'spend_over_cap' | 'renewal' | 'token_launch' | 'contract_deploy' | 'outbound',
    projectId: string,
    payload: unknown,
  ): Promise<{ approvalId: string }>
}

export type ApprovalDecision = 'pending' | 'approved' | 'rejected' | 'expired' | 'stale'

/** Optional: lets the drain job poll decisions instead of waiting for the callback. */
export interface ApprovalStatusReader {
  status(approvalId: string): Promise<{ decision: ApprovalDecision; payloadHash?: string }>
}

export interface PaidCallOptions {
  maxCostMicro: bigint
  projectId: string
  jobId?: string
}
export interface OrbioClient {
  paidCall<T>(method: string, args: Record<string, unknown>, opts: PaidCallOptions): Promise<T>
}

/** What a provider tells us after a send attempt. */
export type SendResult =
  | { status: 'sent'; ref: string }
  /** definitely not sent; don't retry */
  | { status: 'failed'; error: string }
  /** definitely not sent; safe to try again later */
  | { status: 'retry'; error: string; retryAfterSeconds: number }
  /** may or may not have been sent; never resend */
  | { status: 'unknown'; error: string }

export interface EmailMessage {
  to: string
  from: string
  replyTo?: string
  subject: string
  text: string
  idempotencyKey: string
}

export interface EmailProvider {
  name: string
  send(msg: EmailMessage): Promise<SendResult>
}

export interface TemplateSpec {
  name: string
  channel: Channel
  subject?: string
  body: string
  transactional: boolean
}

export interface NotifySettings {
  telegram: { enabled: boolean; parseMode: ParseMode; chatIds: string[]; webhook: boolean; welcome?: string }
  email: { enabled: boolean; provider: 'resend' | 'orbio-mail'; from?: string; replyTo?: string; orbioInboxId?: string }
  templates: TemplateSpec[]
  preApproved: Array<{ channel: Channel; template: string }>
  drainSchedule: string
  batchSize: number
}

export interface OutboxRow {
  id: string
  channel: Channel
  recipient: string
  subject: string | null
  content: string
  approval_hash: string
  batch_id: string | null
  token_related: boolean
  idempotency_key: string
  template: string | null
}
