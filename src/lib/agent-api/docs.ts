/**
 * llms.txt and skill.md, generated from the same operation list the API serves, so they can't drift.
 * llms.txt follows llmstxt.org (title, summary, links). skill.md is the errand / orbiobook style
 * "how an agent joins and uses this app" guide with front matter.
 */
import { requiredScope } from './dispatch'
import type { AgentApiSettings, JsonSchema, OperationSpec } from './types'

function exampleFor(op: OperationSpec): Record<string, unknown> {
  if (op.example) return op.example
  const out: Record<string, unknown> = {}
  const props = (op.input.properties ?? {}) as Record<string, JsonSchema>
  for (const k of (op.input.required as string[] | undefined) ?? []) {
    const p = props[k] ?? {}
    out[k] = Array.isArray(p.enum) ? p.enum[0] : p.type === 'integer' || p.type === 'number' ? (p.minimum ?? 1) : p.type === 'boolean' ? true : `<${k}>`
  }
  return out
}

function fields(op: OperationSpec): string[] {
  const props = (op.input.properties ?? {}) as Record<string, JsonSchema>
  const required = new Set((op.input.required as string[] | undefined) ?? [])
  return Object.entries(props).map(([k, p]) => {
    const bits = [Array.isArray(p.type) ? p.type.join('|') : (p.type ?? 'any'), required.has(k) ? 'required' : 'optional']
    if (Array.isArray(p.enum)) bits.push(`one of ${p.enum.join(', ')}`)
    const desc = typeof p.description === 'string' ? ` ${p.description}` : ''
    return `  - \`${k}\` (${bits.join(', ')})${desc}`
  })
}

function curl(op: OperationSpec, base: string): string {
  const auth = op.public ? '' : ` \\\n  -H "Authorization: Bearer $AGENT_API_KEY"`
  return `curl -X POST ${base}/api/agent/v1/${op.name}${auth} \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(exampleFor(op))}'`
}

function access(op: OperationSpec): string {
  return op.public ? 'public, no key needed' : `needs a key with the \`${requiredScope(op)}\` scope`
}

export function renderLlmsTxt(s: AgentApiSettings, base: string): string {
  const lines = [
    `# ${s.name}`,
    '',
    `> ${s.description.replace(/\n/g, ' ')}`,
    '',
    `Agents use this app through a REST API (${base}/api/agent/v1/<operation>) or an MCP server (${base}/api/mcp, Streamable HTTP). Both take the same API key as \`Authorization: Bearer ak_…\`.`,
    '',
    '## Docs',
    '',
    `- [Agent guide](${base}/skill.md): how to get a key, every operation with its input and a curl example`,
    `- [MCP endpoint](${base}/api/mcp): POST JSON-RPC; tools/list shows every operation`,
    '',
    '## Operations',
    '',
    ...s.operations.map((op) => `- [${op.name}](${base}/api/agent/v1/${op.name}): ${op.description} (${op.kind}, ${access(op)})`),
    '',
  ]
  return lines.join('\n')
}

export function renderSkillMd(s: AgentApiSettings, base: string): string {
  const reg = s.selfRegistration
  const out = [
    '---',
    `name: ${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    `description: ${JSON.stringify(s.description.replace(/\n/g, ' '))}`,
    `homepage: ${base}`,
    `mcp: ${base}/api/mcp`,
    '---',
    '',
    `# ${s.name}: agent guide`,
    '',
    s.description,
    '',
    '## Get an API key',
    '',
    reg.enabled
      ? [
          'Register yourself (no human needed). Save the key: it is shown once.',
          '',
          '```bash',
          `curl -X POST ${base}/api/agent/register -H "Content-Type: application/json" -d '{"name":"<your agent name>"}'`,
          '```',
          '',
          `New keys get these scopes: ${reg.scopes.map((x) => `\`${x}\``).join(', ')}. Registration is limited to ${reg.perHour} per hour per address.`,
        ].join('\n')
      : "Ask the app's owner for a key. Keys look like `ak_xxxxxxxx_…`.",
    '',
    'Send it on every call as `Authorization: Bearer <key>` (or `X-API-Key: <key>`). Public operations work without a key.',
    '',
    '## Use it over MCP',
    '',
    '```json',
    JSON.stringify({ mcpServers: { [s.name]: { type: 'http', url: `${base}/api/mcp`, headers: { Authorization: 'Bearer <key>' } } } }, null, 2),
    '```',
    '',
    '## Operations',
    '',
  ]
  for (const op of s.operations) {
    const limit = op.rateLimit ?? s.defaultRateLimit
    out.push(
      `### ${op.name}: ${op.title}`,
      '',
      op.description,
      '',
      `- Kind: ${op.kind} · Access: ${access(op)} · Limit: ${limit.limit} calls per ${limit.windowSeconds} s`,
      ...(fields(op).length ? ['- Input:', ...fields(op)] : ['- Input: none']),
      '',
      '```bash',
      curl(op, base),
      '```',
      '',
    )
  }
  out.push(
    '## Answers and errors',
    '',
    'Success: `{ "ok": true, "result": … }`. Failure: `{ "ok": false, "error": { "code", "message", "details"? } }` with HTTP 400 (bad input), 401 (key missing or invalid), 403 (not allowed), 404 (no such operation), 429 (too many calls; see `Retry-After`).',
    '',
    'Operations that move money never move it themselves. They return an unsigned transaction (`chainId`, `to`, `data`, `value`, `description`) for your own wallet to sign.',
    '',
  )
  return out.join('\n')
}

/** The public origin: config.baseUrl, else the request's own origin. */
export function baseUrlFor(s: AgentApiSettings, req: Request): string {
  return (s.baseUrl ?? new URL(req.url).origin).replace(/\/+$/, '')
}
