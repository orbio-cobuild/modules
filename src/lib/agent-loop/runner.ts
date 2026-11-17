/**
 * One agent run: budget check → inputs → model decision (zod-validated, one repair) → claims filter →
 * action hook → run log. Called by the agent-loop job (one run per cron slot) or a manual trigger.
 */
import type { ZodError } from 'zod'
import { redactFields, checkClaims } from './claims'
import type { AgentConfig } from './config'
import { decisionJsonSchema, decisionSchema, PUBLIC_TEXT_FIELDS, type Decision } from './decision'
import { gatherInputs, type InputResult } from './inputs'
import { formatUsd } from './money'
import type { AgentStore, PublicInput, RunPatch } from './store'
import type { ApprovalRequester, ModelEnvelope, ModelProvider, OrbioClient } from './types'

export interface OutboundPayload {
  /** e.g. 'x', 'telegram', 'email' */
  channel: string
  /** The exact text that would go out. */
  content: string
  [key: string]: unknown
}

export type ApprovalAnswer = { approvalId: string } | { blocked: true; reason: string }

export interface ActionContext {
  runId: string
  agent: string
  config: AgentConfig
  inputs: InputResult[]
  /** True when the decision's text passed the claims filter. */
  claimsOk: boolean
  claimsFlags: string[]
  /**
   * The only way to send anything outward (posts, messages, email). Creates an `outbound` approval
   * for the owner; nothing is sent until a person approves. Text that fails the claims filter is refused.
   */
  requestApproval(payload: OutboundPayload): Promise<ApprovalAnswer>
  signal: AbortSignal
}

export interface ActionResult {
  kind: 'none' | 'done' | 'awaiting_approval' | 'blocked' | 'failed'
  /** One plain-English line for the public feed. */
  summary: string
  data?: unknown
}

export type ActionHook = (decision: Decision, ctx: ActionContext) => Promise<ActionResult>

export interface AgentDeps {
  config: AgentConfig
  store: AgentStore
  orbio: OrbioClient
  model: ModelProvider
  onDecision: ActionHook
  approvals: ApprovalRequester
  projectId: string
  fetch?: typeof fetch
  now?: () => Date
}

export interface AgentRunOutcome {
  status: 'succeeded' | 'failed' | 'skipped'
  /** paused_by_owner | paused_budget | daily_budget | already_ran | ok | error */
  reason: string
  runId?: string
  totalCostMicro: bigint
  decision?: Decision
}

const utcDayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function normaliseModel(res: unknown): { object: unknown; costMicro: bigint | null; model?: string } {
  if (res && typeof res === 'object' && 'object' in res && 'costMicro' in res) {
    const e = res as ModelEnvelope
    return { object: e.object, costMicro: e.costMicro, ...(e.model ? { model: e.model } : {}) }
  }
  return { object: res, costMicro: null }
}

function parseMaybeJson(v: unknown): unknown {
  if (typeof v !== 'string') return v
  const text = v.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  try {
    return JSON.parse(text)
  } catch {
    return v
  }
}

const issues = (e: ZodError) =>
  e.issues
    .slice(0, 6)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ')

export function buildPrompt(config: AgentConfig, inputs: InputResult[], now: Date, spentToday: bigint): string {
  const lines = [
    `Goal: ${config.persona.goal}`,
    `Time (UTC): ${now.toISOString()}`,
    `Budget: ${formatUsd(spentToday)} spent today of ${formatUsd(BigInt(config.budget.dailyMicro))}.`,
    '',
    'Inputs:',
    ...(inputs.length
      ? inputs.map((i) => `- [${i.id}] ${i.label}: ${i.summary}${i.ok && i.data != null ? `\n  data: ${clip(JSON.stringify(i.data), 3000)}` : ''}`)
      : ['- (none)']),
    '',
    'Answer with JSON only, matching the schema. Explain your reasoning in plain English.',
    'Never claim or predict token prices, returns or profit. Anything you want sent to people is a draft for the owner to approve.',
  ]
  return lines.join('\n')
}

function plainError(err: unknown): string {
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) return 'The run took too long and was stopped. The next run will try again.'
  if (err instanceof Error && err.message.startsWith('PLAIN:')) return err.message.slice(6)
  return 'Something went wrong in this run. The next run will try again.'
}

export async function runAgentOnce(deps: AgentDeps, run: { slotKey: string; trigger?: string; signal?: AbortSignal }): Promise<AgentRunOutcome> {
  const { config, store } = deps
  const now = deps.now ? deps.now() : new Date()
  const agent = config.agent
  const perRun = BigInt(config.budget.perRunMicro)
  const daily = BigInt(config.budget.dailyMicro)
  const modelCap = BigInt(config.model.maxCostMicro)
  const signal = run.signal ?? AbortSignal.timeout(config.timeoutSeconds * 1000)

  // 1. pause and budget
  const state = (await store.getState(agent)) ?? { paused: config.paused, pausedReason: config.paused ? ('owner' as const) : null }
  const spentToday = await store.spentSince(agent, utcDayStart(now))
  const fits = spentToday + perRun <= daily
  if (state.paused) {
    if (state.pausedReason === 'budget' && fits) await store.setPaused(agent, false, null) // a new day: budget is back
    else return { status: 'skipped', reason: state.pausedReason === 'budget' ? 'paused_budget' : 'paused_by_owner', totalCostMicro: 0n }
  }
  if (!fits) {
    await store.setPaused(agent, true, 'budget')
    return { status: 'skipped', reason: 'daily_budget', totalCostMicro: 0n }
  }

  // 2. claim the slot
  const runId = await store.startRun({ agent, slotKey: run.slotKey, trigger: run.trigger ?? 'cron', startedAt: now })
  if (!runId) return { status: 'skipped', reason: 'already_ran', totalCostMicro: 0n }

  const started = Date.now()
  let inputs: InputResult[] = []
  let inputCost = 0n
  let modelCost = 0n
  let estimated = false
  let modelName: string | null = config.model.name
  let raw: unknown = null

  try {
    // 3. inputs (leave room for two model calls)
    const gathered = await gatherInputs(config.inputs, {
      orbio: deps.orbio,
      projectId: deps.projectId,
      jobId: run.slotKey,
      budgetLeftMicro: perRun - modelCap * 2n,
      signal,
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
    })
    inputs = gathered.results
    inputCost = gathered.costMicro
    estimated ||= gathered.estimated

    // 4. decision
    const schema = decisionSchema(config)
    const jsonSchema = decisionJsonSchema(config)
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [{ role: 'user', content: buildPrompt(config, inputs, now, spentToday) }]
    const ask = async () => {
      if (signal.aborted) throw signal.reason
      const res = normaliseModel(await deps.model.generate({ role: config.model.role, system: config.persona.systemPrompt, messages, schema: jsonSchema }))
      if (res.model) modelName = res.model
      if (res.costMicro === null) estimated = true
      modelCost += res.costMicro ?? modelCap
      return parseMaybeJson(res.object)
    }
    raw = await ask()
    let parsed = schema.safeParse(raw)
    if (!parsed.success) {
      messages.push({ role: 'assistant', content: clip(typeof raw === 'string' ? raw : JSON.stringify(raw), 4000) })
      messages.push({ role: 'user', content: `That answer didn't match the required format (${issues(parsed.error)}). Answer again with only valid JSON.` })
      raw = await ask()
      parsed = schema.safeParse(raw)
      if (!parsed.success) throw new Error("PLAIN:The model's answer wasn't in the expected format, so nothing was done.")
    }
    const decision = parsed.data

    // 5. claims filter → public version
    const { value: publicDecision, flags } = redactFields(decision, PUBLIC_TEXT_FIELDS)
    const claimsOk = flags.length === 0

    // 6. action hook
    let action: ActionResult
    try {
      action = await deps.onDecision(decision, {
        runId,
        agent,
        config,
        inputs,
        claimsOk,
        claimsFlags: flags,
        signal,
        async requestApproval(payload) {
          const texts = Object.values(payload).filter((v): v is string => typeof v === 'string')
          const bad = texts.map((t) => checkClaims(t)).filter((r) => !r.ok)
          if (bad.length) return { blocked: true, reason: `Blocked: ${[...new Set(bad.flatMap((b) => b.flags))].join(', ')}` }
          return deps.approvals.request('outbound', deps.projectId, { ...payload, source: 'agent-loop', agent, runId })
        },
      })
    } catch (err) {
      console.error('[agent-loop] action hook failed', err)
      action = { kind: 'failed', summary: "The action didn't complete." }
    }
    const actionSummary = checkClaims(action.summary)

    const total = inputCost + modelCost
    await store.finishRun(
      runId,
      patch({
        status: 'succeeded',
        model: modelName,
        inputs,
        publicReasoning: publicDecision.reasoning,
        decision: publicDecision,
        action: { kind: action.kind, summary: actionSummary.redacted },
        claimsFlags: [...new Set([...flags, ...actionSummary.flags])],
        inputCost,
        modelCost,
        estimated,
        error: null,
        started,
        now,
      }),
      { rawReasoning: decision.reasoning, rawDecision: decision, rawInputs: inputs.map((i) => ({ id: i.id, data: i.data })) },
    )
    if (spentToday + total + perRun > daily) await store.setPaused(agent, true, 'budget')
    return { status: 'succeeded', reason: 'ok', runId, totalCostMicro: total, decision }
  } catch (err) {
    console.error('[agent-loop] run failed', err)
    await store.finishRun(
      runId,
      patch({ status: 'failed', model: modelName, inputs, publicReasoning: null, decision: null, action: null, claimsFlags: [], inputCost, modelCost, estimated, error: plainError(err), started, now }),
      { rawReasoning: null, rawDecision: raw, rawInputs: inputs.map((i) => ({ id: i.id, data: i.data })) },
    )
    return { status: 'failed', reason: 'error', runId, totalCostMicro: inputCost + modelCost }
  }
}

function patch(p: {
  status: RunPatch['status']
  model: string | null
  inputs: InputResult[]
  publicReasoning: string | null
  decision: Record<string, unknown> | null
  action: RunPatch['action']
  claimsFlags: string[]
  inputCost: bigint
  modelCost: bigint
  estimated: boolean
  error: string | null
  started: number
  now: Date
}): RunPatch {
  const inputs: PublicInput[] = p.inputs.map((i) => ({
    id: i.id,
    kind: i.kind,
    label: i.label,
    ok: i.ok,
    summary: checkClaims(i.summary).redacted,
    costMicro: i.costMicro.toString(),
    estimated: i.estimated,
  }))
  const durationMs = Date.now() - p.started
  return {
    status: p.status,
    finishedAt: new Date(p.now.getTime() + durationMs),
    durationMs,
    model: p.model,
    inputs,
    publicReasoning: p.publicReasoning,
    decision: p.decision,
    action: p.action,
    claimsFlags: p.claimsFlags,
    inputCostMicro: p.inputCost,
    modelCostMicro: p.modelCost,
    totalCostMicro: p.inputCost + p.modelCost,
    costEstimated: p.estimated,
    error: p.error,
  }
}
