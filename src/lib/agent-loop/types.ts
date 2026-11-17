/**
 * Local copies of the shared interfaces in docs/workstreams.md. TypeScript is structural, so the
 * platform's @cofounder/orbio and @cofounder/models objects fit these without an import.
 */
export interface PaidCallOptions {
  maxCostMicro: bigint
  projectId: string
  jobId?: string
}

export interface OrbioClient {
  paidCall<T>(method: string, args: Record<string, unknown>, opts: PaidCallOptions): Promise<T>
  read<T>(method: string, args?: Record<string, unknown>): Promise<T>
  tool<T>(name: string, args: Record<string, unknown>, opts: PaidCallOptions): Promise<T>
}

export interface ModelProvider {
  generate(opts: { role: string; system: string; messages: unknown[]; schema?: unknown }): Promise<unknown>
}

export interface ApprovalRequester {
  request(
    kind: 'spec' | 'production_deploy' | 'spend_over_cap' | 'renewal' | 'token_launch' | 'contract_deploy' | 'outbound',
    projectId: string,
    payload: unknown,
  ): Promise<{ approvalId: string }>
}

/** What a tool call returns through createOrbioToolClient (the gateway envelope). Fakes may return the bare result. */
export interface ToolEnvelope<T = unknown> {
  result: T
  chargedMicroUsd: bigint | null
  id?: string
  pending?: boolean
}

/** What the model adapter returns. A bare object (no envelope) is accepted too; its cost is then estimated. */
export interface ModelEnvelope {
  object: unknown
  costMicro: bigint | null
  model?: string
}
