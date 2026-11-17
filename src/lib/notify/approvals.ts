/**
 * Approvals for generated apps. The platform owns the approvals table (WS-M1); a live app asks for an
 * approval over HTTP and hears back through POST /api/notify/approval (HMAC-signed) or by polling.
 */
import { createHash, randomUUID } from 'node:crypto'
import type { ApprovalDecision, ApprovalRequester, ApprovalStatusReader } from './types'

/** Canonical JSON (sorted keys) so the same payload always hashes the same. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

/** POST {url} { kind, projectId, payload } with a bearer token; expects { approvalId }. */
export function httpApprovalRequester(opts: { url: string; token: string; fetch?: typeof fetch }): ApprovalRequester {
  const f = opts.fetch ?? fetch
  return {
    async request(kind, projectId, payload) {
      const res = await f(opts.url, {
        method: 'POST',
        headers: { authorization: `Bearer ${opts.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ kind, projectId, payload }),
      })
      const json = (await res.json().catch(() => ({}))) as { approvalId?: string }
      if (!res.ok || !json.approvalId) throw new Error(`Approval request failed (${res.status}).`)
      return { approvalId: json.approvalId }
    },
  }
}

/** GET {url}/{approvalId}; expects { decision, payloadHash }. */
export function httpApprovalStatusReader(opts: { url: string; token: string; fetch?: typeof fetch }): ApprovalStatusReader {
  const f = opts.fetch ?? fetch
  return {
    async status(approvalId) {
      const res = await f(`${opts.url.replace(/\/+$/, '')}/${encodeURIComponent(approvalId)}`, { headers: { authorization: `Bearer ${opts.token}` } })
      if (!res.ok) return { decision: 'pending' }
      const json = (await res.json().catch(() => ({}))) as { decision?: ApprovalDecision; payloadHash?: string }
      return { decision: json.decision ?? 'pending', ...(json.payloadHash ? { payloadHash: json.payloadHash } : {}) }
    },
  }
}

/**
 * Used when no approvals URL is configured (previews). It records a local id and nothing is ever
 * approved automatically, so messages wait until someone approves them through the callback.
 */
export const holdingApprovalRequester: ApprovalRequester = {
  async request() {
    return { approvalId: `local:${randomUUID()}` }
  },
}
