/** Wires notify to this project's config, env and database. Server-only. */
import 'server-only'
import { getOrbioClient } from '@/app/(project)/_notify/orbio'
import config from '@/config/modules/notify.json'
import { createServerDb } from '@/lib/db/server'
import { holdingApprovalRequester, httpApprovalRequester, httpApprovalStatusReader } from './approvals'
import { orbioMailProvider, resendProvider } from './email'
import type { NotifyDeps } from './outbox'
import { supabaseNotifyStore } from './store'
import type { EmailProvider, NotifySettings } from './types'

export function notifySettings(): NotifySettings {
  const c = config as unknown as Partial<NotifySettings>
  const envChats = (process.env.TELEGRAM_CHAT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const telegram = { enabled: false, parseMode: 'HTML' as const, chatIds: [], webhook: false, ...(c.telegram ?? {}) }
  return {
    telegram: { ...telegram, chatIds: [...new Set([...telegram.chatIds, ...envChats])] },
    email: { enabled: false, provider: 'resend', ...(c.email ?? {}) },
    templates: (c.templates ?? []).map((t) => ({ ...t, transactional: t.transactional ?? false })),
    preApproved: c.preApproved ?? [],
    drainSchedule: c.drainSchedule ?? '*/5 * * * *',
    batchSize: c.batchSize ?? 20,
  }
}

function emailProvider(s: NotifySettings, projectId: string): EmailProvider | undefined {
  if (!s.email.enabled) return undefined
  if (s.email.provider === 'orbio-mail') {
    const orbio = getOrbioClient()
    if (!orbio || !s.email.orbioInboxId) return undefined
    return orbioMailProvider({ orbio, inboxId: s.email.orbioInboxId, projectId })
  }
  const key = process.env.RESEND_API_KEY
  return key ? resendProvider({ apiKey: key }) : undefined
}

export function notifyDeps(): NotifyDeps {
  const settings = notifySettings()
  const projectId = process.env.COFOUNDER_PROJECT_ID ?? 'local'
  const url = process.env.COFOUNDER_APPROVALS_URL
  const token = process.env.COFOUNDER_APPROVALS_TOKEN
  const email = emailProvider(settings, projectId)
  return {
    settings,
    store: supabaseNotifyStore(createServerDb()),
    approvals: url && token ? httpApprovalRequester({ url, token }) : holdingApprovalRequester,
    ...(url && token ? { approvalStatus: httpApprovalStatusReader({ url, token }) } : {}),
    projectId,
    ...(process.env.TELEGRAM_BOT_TOKEN ? { telegramToken: process.env.TELEGRAM_BOT_TOKEN } : {}),
    ...(email ? { email } : {}),
  }
}
