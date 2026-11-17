/**
 * The one place an operation runs. REST and MCP both call executeOperation, so auth, scopes,
 * the authorize hook, rate limits, input validation and logging are identical on both.
 */
import { randomUUID } from 'node:crypto'
import { hashApiKey, parseApiKey } from './keys'
import { validateInput } from './schema'
import type { AgentApiDeps, AgentIdentity, OperationSpec } from './types'

export type ExecuteResult =
  | { ok: true; status: 200; result: unknown }
  | { ok: false; status: 400 | 401 | 403 | 404 | 429 | 500; code: string; message: string; details?: string[]; retryAfterSeconds?: number }

export interface ExecuteRequest {
  op: string
  input: unknown
  apiKey: string | null
  /** Hashed caller IP, used for anonymous rate limits. */
  subject: string
  transport: 'rest' | 'mcp'
}

export function requiredScope(op: OperationSpec): string {
  return op.scope ?? op.kind
}

/** Converts bigint to decimal strings so results are JSON-safe (UnsignedTx.value is a bigint). */
export function jsonSafe(value: unknown): unknown {
  if (value === undefined) return null
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
}

/** True for objects shaped like an UnsignedTx. Used to make sure nothing signed slips out. */
export function isUnsignedTx(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const t = v as Record<string, unknown>
  return typeof t.chainId === 'number' && typeof t.data === 'string' && /^0x[0-9a-fA-F]*$/.test(t.data) && typeof t.description === 'string'
}

const SIGNED = ['signature', 'rawTransaction', 'signedTransaction', 'serializedTransaction', 'privateKey', 'mnemonic']

function containsSignedMaterial(v: unknown, depth = 0): boolean {
  if (!v || typeof v !== 'object' || depth > 6) return false
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (SIGNED.includes(k)) return true
    if (containsSignedMaterial(val, depth + 1)) return true
  }
  return false
}

export async function executeOperation(deps: AgentApiDeps, req: ExecuteRequest): Promise<ExecuteResult> {
  const started = Date.now()
  let agent: AgentIdentity | null = null
  const finish = async (res: ExecuteResult): Promise<ExecuteResult> => {
    if (deps.settings.logRequests && deps.logger) {
      await deps.logger
        .log({
          op: req.op,
          transport: req.transport,
          keyPrefix: agent?.prefix ?? null,
          subjectHash: agent ? null : req.subject,
          status: res.status,
          durationMs: Date.now() - started,
          ...(res.ok ? {} : { error: res.code }),
        })
        .catch((e) => console.error('[agent-api] log failed', e))
    }
    return res
  }

  const op = deps.settings.operations.find((o) => o.name === req.op)
  const handler = deps.handlers[req.op]
  if (!op || !handler) return finish({ ok: false, status: 404, code: 'not_found', message: `There is no operation called "${req.op}". See /llms.txt for the list.` })

  if (req.apiKey) {
    if (!parseApiKey(req.apiKey)) return finish({ ok: false, status: 401, code: 'bad_key', message: "That API key isn't valid. Keys look like ak_xxxxxxxx_…" })
    agent = await deps.keys.authenticate(hashApiKey(req.apiKey))
    if (!agent) return finish({ ok: false, status: 401, code: 'bad_key', message: "That API key isn't valid or was revoked." })
  } else if (!op.public) {
    return finish({ ok: false, status: 401, code: 'key_required', message: 'This operation needs an API key. See /skill.md for how to get one.' })
  }

  const scope = requiredScope(op)
  if (agent && !agent.scopes.includes(scope) && !agent.scopes.includes('*') && !(op.public && op.kind === 'read')) {
    return finish({ ok: false, status: 403, code: 'scope', message: `Your key can't do this. It needs the "${scope}" scope.` })
  }

  const limit = agent ? (op.rateLimit ?? deps.settings.defaultRateLimit) : deps.settings.anonymousRateLimit
  const rate = await deps.rate.hit(agent ? agent.keyId : `anon:${req.subject}`, op.name, limit.windowSeconds, limit.limit)
  if (!rate.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000))
    return finish({ ok: false, status: 429, code: 'rate_limited', message: `Too many calls. Try again in ${retryAfterSeconds} seconds.`, retryAfterSeconds })
  }

  const parsed = validateInput(op.input, req.input)
  if (!parsed.ok) return finish({ ok: false, status: 400, code: 'invalid_input', message: 'Some of the input is wrong.', details: parsed.errors })

  if (deps.authorize) {
    const verdict = await deps.authorize({ agent, operation: op, input: parsed.value, transport: req.transport })
    if (verdict !== true) {
      return finish({ ok: false, status: 403, code: 'refused', message: typeof verdict === 'string' ? verdict : "You're not allowed to do that." })
    }
  }

  try {
    const result = await handler(parsed.value, { agent, operation: op, transport: req.transport, requestId: randomUUID() })
    if (containsSignedMaterial(result)) {
      console.error(`[agent-api] ${op.name} returned signed material; refused`)
      return finish({ ok: false, status: 500, code: 'unsafe_result', message: 'The operation failed. The app owner has been told.' })
    }
    return finish({ ok: true, status: 200, result: jsonSafe(result) })
  } catch (err) {
    console.error(`[agent-api] ${op.name} failed`, err)
    const message = err instanceof OperationError ? err.message : 'The operation failed. Try again later.'
    return finish({ ok: false, status: err instanceof OperationError ? err.status : 500, code: 'failed', message })
  }
}

/** Throw this from a handler to send a plain-English error to the agent (other errors are hidden). */
export class OperationError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 = 400,
  ) {
    super(message)
  }
}
