/**
 * OrbioClient for the generated app itself (server-only; uses ORBIO_API_KEY).
 *
 * tool(): POST https://api.orbio.so/api/v1/tools/{name} with the tool's arguments plus
 * `max_cost` as a CREDIT decimal string. Matches @orbiodotso/sdk 0.2.1 `tools.call`: the response is
 * { id, tool, result, cost: { credit }, status } and the charge may instead be in the X-Orbio-Cost header.
 * read(): GET /api/v1/{method with dots as slashes}. paidCall() is not offered here: infrastructure
 * calls belong to the platform, never to a generated app.
 */
import { creditToMicro, microToCredit } from './money'
import type { OrbioClient, ToolEnvelope } from './types'

export class OrbioCallError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message)
    this.name = 'OrbioCallError'
  }
  get retryable(): boolean {
    return this.code === 'rate_limited' || this.code === 'tool_failed' || this.status >= 500
  }
}

export interface OrbioToolClientOptions {
  apiKey: string
  baseUrl?: string
  fetch?: typeof fetch
}

function chargedFrom(body: { cost?: { credit?: string } } | null, headers: Headers): bigint | null {
  const text = body?.cost?.credit ?? headers.get('x-orbio-cost')
  if (!text) return null
  try {
    return creditToMicro(text)
  } catch {
    return null
  }
}

async function errorFrom(res: Response): Promise<OrbioCallError> {
  const body = (await res.json().catch(() => null)) as { error?: string | { message?: string; code?: string; type?: string }; retry_after_seconds?: number } | null
  const detail = typeof body?.error === 'string' ? { message: body.error } : (body?.error ?? {})
  const retry = Number(res.headers.get('retry-after')) || (typeof body?.retry_after_seconds === 'number' ? body.retry_after_seconds : null)
  return new OrbioCallError(detail.message ?? `Orbio answered ${res.status}`, detail.code ?? detail.type ?? 'unknown', res.status, retry)
}

export function createOrbioToolClient(opts: OrbioToolClientOptions): OrbioClient {
  if (!opts.apiKey) throw new Error('The agent is missing its Orbio key. Ask the builder to connect Orbio.')
  const base = (opts.baseUrl ?? 'https://api.orbio.so').replace(/\/+$/, '')
  const f = opts.fetch ?? fetch
  const headers = (json: boolean): Record<string, string> => ({
    accept: 'application/json',
    authorization: `Bearer ${opts.apiKey}`,
    ...(json ? { 'content-type': 'application/json' } : {}),
  })

  return {
    async tool<T>(name: string, args: Record<string, unknown>, o: { maxCostMicro: bigint }): Promise<T> {
      const res = await f(`${base}/api/v1/tools/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ ...args, max_cost: microToCredit(o.maxCostMicro) }),
      })
      if (!res.ok) throw await errorFrom(res)
      const body = (await res.json()) as { id?: string; result?: unknown; cost?: { credit?: string }; status?: string }
      const envelope: ToolEnvelope = {
        result: body.result ?? null,
        chargedMicroUsd: chargedFrom(body, res.headers),
        ...(body.id ? { id: body.id } : {}),
        pending: body.status === 'running',
      }
      return envelope as T
    },
    async read<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
      const qs = new URLSearchParams(Object.entries(args).map(([k, v]) => [k, String(v)])).toString()
      const res = await f(`${base}/api/v1/${method.split('.').map(encodeURIComponent).join('/')}${qs ? `?${qs}` : ''}`, { headers: headers(false) })
      if (!res.ok) throw await errorFrom(res)
      return (await res.json()) as T
    },
    async paidCall<T>(): Promise<T> {
      throw new Error('Paid infrastructure calls are made by the platform, not by the generated app.')
    },
  }
}
