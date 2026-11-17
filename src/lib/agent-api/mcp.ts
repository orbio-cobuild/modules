/**
 * MCP over Streamable HTTP, stateless (spec 2025-06-18; also answers 2025-03-26 clients).
 * POST /api/mcp with one JSON-RPC message (a batch array is also accepted). Replies are plain
 * application/json; there is no SSE stream and no session, so GET and DELETE answer 405.
 * Methods: initialize, ping, tools/list, tools/call. Notifications get 202 Accepted.
 * Auth: the same API key as REST, in `Authorization: Bearer ak_…`.
 */
import { executeOperation, requiredScope } from './dispatch'
import { apiKeyFromRequest, clientSubject } from './keys'
import type { AgentApiDeps } from './types'

export const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26'] as const
const LATEST = MCP_PROTOCOL_VERSIONS[0]

type Id = string | number | null
interface RpcRequest {
  jsonrpc: '2.0'
  id?: Id
  method: string
  params?: Record<string, unknown>
}

const rpcError = (id: Id, code: number, message: string) => ({ jsonrpc: '2.0' as const, id, error: { code, message } })
const rpcResult = (id: Id, result: unknown) => ({ jsonrpc: '2.0' as const, id, result })

export function toolList(deps: AgentApiDeps) {
  return deps.settings.operations
    .filter((op) => deps.handlers[op.name])
    .map((op) => ({
      name: op.name,
      title: op.title,
      description: `${op.description}${op.public ? '' : ` (needs an API key with the "${requiredScope(op)}" scope)`}`,
      inputSchema: op.input,
      annotations: { title: op.title, readOnlyHint: op.kind === 'read', openWorldHint: false },
    }))
}

async function handleOne(deps: AgentApiDeps, msg: unknown, req: Request): Promise<object | null> {
  if (!msg || typeof msg !== 'object' || (msg as RpcRequest).jsonrpc !== '2.0' || typeof (msg as RpcRequest).method !== 'string') {
    const id = msg && typeof msg === 'object' && 'id' in msg ? ((msg as RpcRequest).id ?? null) : null
    return rpcError(id, -32600, 'Invalid request')
  }
  const m = msg as RpcRequest
  const isNotification = !('id' in m) || m.id === undefined
  if (isNotification) return null // notifications/initialized, notifications/cancelled, … need no reply
  const id = m.id ?? null

  switch (m.method) {
    case 'initialize': {
      const asked = typeof m.params?.protocolVersion === 'string' ? m.params.protocolVersion : LATEST
      const protocolVersion = (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : LATEST
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: deps.settings.name, version: '0.1.0' },
        instructions: `${deps.settings.description}\nRead /skill.md for how to get an API key and what each tool does.`,
      })
    }
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return rpcResult(id, { tools: toolList(deps) })
    case 'tools/call': {
      const name = m.params?.name
      if (typeof name !== 'string' || !deps.settings.operations.some((o) => o.name === name) || !deps.handlers[name]) {
        return rpcError(id, -32602, `Unknown tool: ${String(name)}`)
      }
      const res = await executeOperation(deps, {
        op: name,
        input: m.params?.arguments ?? {},
        apiKey: apiKeyFromRequest(req),
        subject: clientSubject(req),
        transport: 'mcp',
      })
      if (res.ok) {
        const structured = res.result !== null && typeof res.result === 'object' && !Array.isArray(res.result) ? res.result : { result: res.result }
        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(res.result) }], structuredContent: structured, isError: false })
      }
      const text = [res.message, ...(res.details ?? [])].join('\n')
      return rpcResult(id, { content: [{ type: 'text', text }], isError: true })
    }
    default:
      return rpcError(id, -32601, `Method not found: ${m.method}`)
  }
}

export function createMcpHandlers(getDeps: () => AgentApiDeps) {
  async function POST(req: Request): Promise<Response> {
    const deps = getDeps()
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 })
    }
    const headers = { 'content-type': 'application/json', 'mcp-protocol-version': LATEST }
    if (Array.isArray(body)) {
      if (body.length === 0) return Response.json(rpcError(null, -32600, 'Invalid request'), { status: 400 })
      const replies = (await Promise.all(body.map((m) => handleOne(deps, m, req)))).filter(Boolean)
      return replies.length ? new Response(JSON.stringify(replies), { headers }) : new Response(null, { status: 202 })
    }
    const reply = await handleOne(deps, body, req)
    return reply ? new Response(JSON.stringify(reply), { headers }) : new Response(null, { status: 202 })
  }
  const notAllowed = () => new Response(JSON.stringify({ error: 'This MCP server is stateless. Use POST.' }), { status: 405, headers: { allow: 'POST', 'content-type': 'application/json' } })
  return { POST, GET: notAllowed, DELETE: notAllowed }
}
