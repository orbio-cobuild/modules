/**
 * Decision schemas the model must answer with. Every preset has `action`, `reasoning`, `confidence`
 * and a short `summary`, so the mind feed can show any of them.
 */
import { z } from 'zod'
import type { AgentConfig } from './config'

const common = {
  reasoning: z.string().min(1).max(2000).describe('Why, in plain English, in a few sentences.'),
  confidence: z.number().min(0).max(1).describe('0 to 1.'),
  summary: z.string().min(1).max(140).describe('One short line for the public feed.'),
}

export const tradeDecision = z.object({
  action: z.enum(['buy', 'sell', 'hold']),
  asset: z.string().min(1).max(20),
  /** Share of the (paper) balance, in basis points. 0 for hold. */
  sizeBps: z.number().int().min(0).max(10_000),
  ...common,
})

export const postDecision = z.object({
  action: z.enum(['post', 'skip']),
  /** The text to post, if action is post. Always goes to the owner for approval first. */
  draft: z.string().max(280).optional(),
  ...common,
})

export const researchDecision = z.object({
  action: z.enum(['investigate', 'skip']),
  topic: z.string().min(1).max(200),
  /** How strong the lead is, 0 to 100. */
  score: z.number().int().min(0).max(100),
  ...common,
})

export function genericDecision(actions: string[]) {
  const all = Array.from(new Set(['none', ...actions])) as [string, ...string[]]
  return z.object({
    action: z.enum(all),
    /** Free-form details for the action hook. */
    details: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
    ...common,
  })
}

export type Decision = { action: string; reasoning: string; confidence: number; summary: string } & Record<string, unknown>

export function decisionSchema(config: Pick<AgentConfig, 'decision'>): z.ZodType<Decision> {
  switch (config.decision.preset) {
    case 'trade':
      return tradeDecision as unknown as z.ZodType<Decision>
    case 'post':
      return postDecision as unknown as z.ZodType<Decision>
    case 'research':
      return researchDecision as unknown as z.ZodType<Decision>
    default:
      return genericDecision(config.decision.actions) as unknown as z.ZodType<Decision>
  }
}

/** JSON Schema for structured output (OpenAI-compatible json_schema response_format). */
export function decisionJsonSchema(config: Pick<AgentConfig, 'decision'>): Record<string, unknown> {
  return z.toJSONSchema(decisionSchema(config), { target: 'draft-7' }) as Record<string, unknown>
}

/** Text fields of a decision that could be shown publicly or sent out. */
export const PUBLIC_TEXT_FIELDS = ['reasoning', 'summary', 'draft', 'topic'] as const
