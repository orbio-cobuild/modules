/** Shared types for the agent API (REST + MCP share one dispatcher). */

export type JsonSchema = { type?: string | string[]; [k: string]: unknown }

export interface OperationSpec {
  name: string
  title: string
  description: string
  kind: 'read' | 'write'
  scope?: string
  public: boolean
  rateLimit?: { limit: number; windowSeconds: number }
  input: JsonSchema
  example?: Record<string, unknown>
}

export interface AgentApiSettings {
  name: string
  description: string
  baseUrl?: string
  operations: OperationSpec[]
  defaultRateLimit: { limit: number; windowSeconds: number }
  anonymousRateLimit: { limit: number; windowSeconds: number }
  selfRegistration: { enabled: boolean; scopes: string[]; perHour: number }
  logRequests: boolean
}

/** The agent behind a request, once its key has been checked. */
export interface AgentIdentity {
  keyId: string
  prefix: string
  label: string
  ownerWallet: string | null
  scopes: string[]
  source: 'owner' | 'self'
}

export interface OperationContext {
  /** null for anonymous calls to public operations */
  agent: AgentIdentity | null
  operation: OperationSpec
  transport: 'rest' | 'mcp'
  requestId: string
}

export type OperationHandler = (input: Record<string, unknown>, ctx: OperationContext) => Promise<unknown>
export type OperationHandlers = Record<string, OperationHandler>

/**
 * Unsigned transaction handed to the user's or agent's own wallet (never signed by this app).
 * Same shape as docs/workstreams.md. bigint `value` is sent as a decimal string.
 */
export interface UnsignedTx {
  chainId: number
  to?: `0x${string}`
  data: `0x${string}`
  value: bigint
  description: string
}

export interface AuthorizeContext {
  agent: AgentIdentity | null
  operation: OperationSpec
  input: Record<string, unknown>
  transport: 'rest' | 'mcp'
}

/** true = allow; false or a sentence = refuse (the sentence is shown to the agent). */
export type AuthorizeHook = (ctx: AuthorizeContext) => Promise<boolean | string>

export interface KeyStore {
  authenticate(keyHash: string): Promise<AgentIdentity | null>
  issue(input: { prefix: string; keyHash: string; label: string; scopes: string[]; ownerWallet?: string | null; source: 'owner' | 'self' }): Promise<string>
  revoke(prefix: string): Promise<boolean>
}

export interface RateLimiter {
  hit(subject: string, op: string, windowSeconds: number, limit: number): Promise<{ allowed: boolean; hits: number; resetAt: Date }>
}

export interface RequestLogger {
  log(entry: { op: string; transport: 'rest' | 'mcp'; keyPrefix: string | null; subjectHash: string | null; status: number; durationMs: number; error?: string }): Promise<void>
}

export interface AgentApiDeps {
  settings: AgentApiSettings
  handlers: OperationHandlers
  keys: KeyStore
  rate: RateLimiter
  logger?: RequestLogger
  authorize?: AuthorizeHook
}
