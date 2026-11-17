/**
 * ModelProvider for the generated app: the Orbio gateway's OpenAI-compatible chat completions,
 * POST https://api.orbio.so/api/v1/chat/completions, with a json_schema response_format.
 *
 * Untested against the live gateway: whether it honours `response_format: json_schema` for every model,
 * and whether it reports the charge in an X-Orbio-Cost header (the SDK reads that header for tools).
 * When no cost is reported the runner records the model's cap and marks the run's cost as estimated.
 */
import { creditToMicro } from './money'
import type { ModelEnvelope, ModelProvider } from './types'
import { OrbioCallError } from './orbio-http'

export interface GatewayModelOptions {
  apiKey: string
  model: string
  maxTokens?: number
  baseUrl?: string
  fetch?: typeof fetch
  temperature?: number
}

export function createGatewayModel(opts: GatewayModelOptions): ModelProvider {
  if (!opts.apiKey) throw new Error('The agent is missing its Orbio key. Ask the builder to connect Orbio.')
  const base = (opts.baseUrl ?? 'https://api.orbio.so').replace(/\/+$/, '')
  const f = opts.fetch ?? fetch
  return {
    async generate({ system, messages, schema }): Promise<ModelEnvelope> {
      const body: Record<string, unknown> = {
        model: opts.model,
        messages: [{ role: 'system', content: system }, ...(messages as Array<Record<string, unknown>>)],
        max_tokens: opts.maxTokens ?? 800,
        temperature: opts.temperature ?? 0.3,
        ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: 'decision', schema, strict: false } } } : {}),
      }
      const res = await f(`${base}/api/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string } | string } | null
        const detail = typeof err?.error === 'string' ? { message: err.error } : (err?.error ?? {})
        throw new OrbioCallError(detail.message ?? `The model answered ${res.status}`, detail.code ?? 'unknown', res.status)
      }
      const json = (await res.json()) as { model?: string; choices?: Array<{ message?: { content?: string | null } }> }
      const content = json.choices?.[0]?.message?.content ?? ''
      let object: unknown = content
      try {
        object = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
      } catch {
        // leave as text; the runner's schema check asks for a repair
      }
      const header = res.headers.get('x-orbio-cost')
      let costMicro: bigint | null = null
      try {
        costMicro = header ? creditToMicro(header) : null
      } catch {
        costMicro = null
      }
      return { object, costMicro, model: json.model ?? opts.model }
    },
  }
}
