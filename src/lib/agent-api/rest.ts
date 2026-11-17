/**
 * REST: /api/agent/v1/<op>. POST takes the input as a JSON body. GET works for read operations,
 * with the input as query parameters.
 */
import { NextResponse } from 'next/server'
import { executeOperation, type ExecuteResult } from './dispatch'
import { apiKeyFromRequest, clientSubject } from './keys'
import { coerceQuery } from './schema'
import type { AgentApiDeps } from './types'

function respond(res: ExecuteResult): Response {
  if (res.ok) return NextResponse.json({ ok: true, result: res.result })
  const headers: Record<string, string> = {}
  if (res.retryAfterSeconds) headers['retry-after'] = String(res.retryAfterSeconds)
  return NextResponse.json({ ok: false, error: { code: res.code, message: res.message, ...(res.details ? { details: res.details } : {}) } }, { status: res.status, headers })
}

export function createRestHandlers(getDeps: () => AgentApiDeps) {
  type Ctx = { params: Promise<{ op: string }> }

  async function GET(req: Request, ctx: Ctx) {
    const deps = getDeps()
    const { op } = await ctx.params
    const spec = deps.settings.operations.find((o) => o.name === op)
    if (spec && spec.kind !== 'read') return respond({ ok: false, status: 400, code: 'use_post', message: 'This operation changes things. Call it with POST.' })
    const input = spec ? coerceQuery(spec.input, new URL(req.url).searchParams) : {}
    return respond(await executeOperation(deps, { op, input, apiKey: apiKeyFromRequest(req), subject: clientSubject(req), transport: 'rest' }))
  }

  async function POST(req: Request, ctx: Ctx) {
    const deps = getDeps()
    const { op } = await ctx.params
    const text = await req.text()
    let input: unknown = {}
    if (text.trim()) {
      try {
        input = JSON.parse(text)
      } catch {
        return respond({ ok: false, status: 400, code: 'bad_json', message: "The request body isn't valid JSON." })
      }
    }
    return respond(await executeOperation(deps, { op, input, apiKey: apiKeyFromRequest(req), subject: clientSubject(req), transport: 'rest' }))
  }

  return { GET, POST }
}
