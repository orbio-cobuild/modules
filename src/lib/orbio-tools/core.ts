/**
 * callOrbioTool, without server wiring (testable). Every Orbio tool call in a generated app goes
 * through here (D224):
 *   1. the tool must be in the config's allow-list (chosen when the project was planned);
 *   2. the call's cap is the lower of its own cap and perCallMaxMicro, sent to Orbio as max_cost,
 *      so Orbio refuses anything quoted above it before it runs;
 *   3. the call is refused if today's logged spend plus that cap would pass dailyCapMicro;
 *   4. every call is logged with its real charge (or the cap, marked estimated).
 */
import type { OrbioToolsConfig } from './config'
import { creditToMicro, microToCredit } from './money'
import type { ToolStore } from './store'

export type OrbioToolErrorCode = 'not_allowed' | 'over_daily_cap' | 'missing_key' | 'refused' | 'failed'

export class OrbioToolError extends Error {
  constructor(
    message: string,
    readonly code: OrbioToolErrorCode,
    readonly status: number | null = null,
  ) {
    super(message)
    this.name = 'OrbioToolError'
  }
}

export interface OrbioToolResult<T> {
  result: T
  costMicro: bigint
  estimated: boolean
  /** True when the tool runs on (media generation): poll media.status with the returned id. */
  pending: boolean
  id: string | null
}

export interface OrbioToolsDeps {
  config: OrbioToolsConfig
  apiKey: string
  store: ToolStore
  fetch?: typeof fetch
  baseUrl?: string
  now?: () => Date
}

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

export function createOrbioTools(deps: OrbioToolsDeps) {
  const base = (deps.baseUrl ?? 'https://api.orbio.so').replace(/\/+$/, '')
  const f = deps.fetch ?? fetch
  const now = deps.now ?? (() => new Date())
  const perCall = BigInt(deps.config.perCallMaxMicro)
  const daily = BigInt(deps.config.dailyCapMicro)

  return {
    async call<T = unknown>(tool: string, args: Record<string, unknown>, opts: { maxCostMicro?: bigint } = {}): Promise<OrbioToolResult<T>> {
      if (!deps.config.tools.includes(tool)) {
        throw new OrbioToolError(`This app isn't set up to use the Orbio tool "${tool}". Add it to src/config/modules/orbio-tools.json.`, 'not_allowed')
      }
      if (!deps.apiKey) throw new OrbioToolError('The app is missing its Orbio key. Ask the builder to connect Orbio.', 'missing_key')
      const cap = opts.maxCostMicro !== undefined && opts.maxCostMicro < perCall ? opts.maxCostMicro : perCall
      if (cap <= 0n) throw new OrbioToolError('A tool call needs a spending cap above zero.', 'refused')
      const spent = await deps.store.spentSince(startOfUtcDay(now()))
      if (spent + cap > daily) {
        throw new OrbioToolError('Today’s spending limit for Orbio tools is used up. It resets at midnight UTC.', 'over_daily_cap')
      }

      const { max_cost: _ignored, ...clean } = args
      let res: Response
      try {
        res = await f(`${base}/api/v1/tools/${encodeURIComponent(tool)}`, {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${deps.apiKey}` },
          body: JSON.stringify({ ...clean, max_cost: microToCredit(cap) }),
        })
      } catch (err) {
        await deps.store.record({ tool, ok: false, costMicro: 0n, estimated: false, error: err instanceof Error ? err.message : 'network error' })
        throw new OrbioToolError('Couldn’t reach Orbio. Please try again.', 'failed')
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string | { message?: string } } | null
        const msg = typeof body?.error === 'string' ? body.error : (body?.error?.message ?? `Orbio answered ${res.status}`)
        await deps.store.record({ tool, ok: false, costMicro: 0n, estimated: false, error: msg })
        throw new OrbioToolError(res.status === 402 || res.status === 400 ? msg : 'The Orbio tool didn’t work this time. Please try again.', res.status === 402 || res.status === 400 ? 'refused' : 'failed', res.status)
      }

      const body = (await res.json()) as { id?: string; result?: unknown; cost?: { credit?: string }; status?: string }
      const charged = body.cost?.credit ?? res.headers.get('x-orbio-cost')
      let costMicro = cap
      let estimated = true
      if (charged) {
        try {
          costMicro = creditToMicro(charged)
          estimated = false
        } catch {
          // keep the cap as an estimate
        }
      }
      await deps.store.record({ tool, ok: true, costMicro, estimated, error: null })
      return { result: (body.result ?? null) as T, costMicro, estimated, pending: body.status === 'running', id: body.id ?? null }
    },
  }
}
