/**
 * agent-loop config. The platform validates the module config with this schema and writes the result
 * to src/config/modules/agent-loop.json. Money is micro-USD written as a string of digits.
 */
import { z } from 'zod'
import { isValidCron } from '@/lib/jobs/cron'

export const microString = z.string().regex(/^\d{1,15}$/, 'Write money as whole micro-USD, e.g. "200000" for $0.20.')
const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, 'Use lower-case letters, numbers and dashes.')
const label = z.string().min(1).max(80)

export const NETWORKS = ['robinhood', 'robinhood-testnet', 'ethereum', 'base', 'arbitrum', 'optimism'] as const
export const CHAIN_METHODS = [
  'eth_blockNumber',
  'eth_getBalance',
  'eth_call',
  'eth_getLogs',
  'eth_getTransactionCount',
  'alchemy_getTokenBalances',
  'alchemy_getTokenMetadata',
  'alchemy_getAssetTransfers',
] as const

const chainInput = z.object({
  kind: z.literal('chain'),
  id,
  label,
  method: z.enum(CHAIN_METHODS),
  params: z.array(z.unknown()).max(10).default([]),
  /** Defaults to the network for NEXT_PUBLIC_CHAIN_ID (4663 robinhood, 46630 robinhood-testnet). */
  network: z.enum(NETWORKS).optional(),
  maxCostMicro: microString.default('1000'),
})
const xPostsInput = z
  .object({
    kind: z.literal('x'),
    id,
    label,
    query: z.string().max(500).optional(),
    handle: z.string().regex(/^[A-Za-z0-9_]{1,15}$/).optional(),
    mentionsOf: z.string().regex(/^[A-Za-z0-9_]{1,15}$/).optional(),
    limit: z.number().int().min(5).max(100).default(10),
    maxCostMicro: microString.default('200000'),
  })
  .refine((x) => x.query || x.handle || x.mentionsOf, 'An X input needs a query, a handle or mentionsOf.')
const xProfileInput = z.object({
  kind: z.literal('x-profile'),
  id,
  label,
  handles: z.array(z.string().regex(/^[A-Za-z0-9_]{1,15}$/)).min(1).max(20),
  maxCostMicro: microString.default('250000'),
})
const webInput = z.object({
  kind: z.literal('web'),
  id,
  label,
  query: z.string().min(2).max(300),
  limit: z.number().int().min(1).max(10).default(5),
  maxCostMicro: microString.default('20000'),
})
const priceInput = z.object({
  kind: z.literal('price'),
  id,
  label,
  /** orbio-launchpad: the public launchpad API (free). url: any public JSON URL, `field` is a dot path. */
  source: z.enum(['orbio-launchpad', 'url']),
  agentId: z.string().regex(/^\d+$/).optional(),
  url: z.string().url().startsWith('https://').optional(),
  field: z.string().regex(/^[A-Za-z0-9_.[\]]+$/).optional(),
})

export const inputSchema = z.union([chainInput, xPostsInput, xProfileInput, webInput, priceInput])
export type AgentInput = z.infer<typeof inputSchema>

export const DECISION_PRESETS = ['generic', 'trade', 'post', 'research'] as const

export const agentConfigSchema = z
  .object({
    agent: id.default('main'),
    /** 5-part cron, UTC. Every 10 minutes by default. Sub-daily needs Vercel Pro or Supabase cron (see jobs). */
    schedule: z.string().refine(isValidCron, 'Use a 5-part cron schedule, e.g. "*/10 * * * *".').default('*/10 * * * *'),
    persona: z
      .object({
        name: z.string().min(1).max(60).default('Agent'),
        /** Who the agent is and how it behaves. */
        systemPrompt: z.string().min(10).max(4000),
        /** What each run should decide. */
        goal: z.string().min(5).max(1000),
      }),
    model: z
      .object({
        /** A model id from Orbio GET /api/v1/models (validated by the platform). */
        name: z.string().min(1).max(100).default('deepseek/deepseek-chat'),
        role: z.string().min(1).max(40).default('agent-loop'),
        maxTokens: z.number().int().min(100).max(4000).default(800),
        /** Most one model call may cost; used for the budget check and as the estimate when the gateway reports no cost. */
        maxCostMicro: microString.default('50000'),
      })
      .default({ name: 'deepseek/deepseek-chat', role: 'agent-loop', maxTokens: 800, maxCostMicro: '50000' }),
    inputs: z.array(inputSchema).max(8).default([]),
    decision: z
      .object({
        preset: z.enum(DECISION_PRESETS).default('generic'),
        /** generic preset: the actions the agent may pick. "none" is always allowed. */
        actions: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,30}$/)).max(10).default([]),
      })
      .default({ preset: 'generic', actions: [] }),
    budget: z
      .object({
        perRunMicro: microString.default('200000'),
        dailyMicro: microString.default('5000000'),
      })
      .default({ perRunMicro: '200000', dailyMicro: '5000000' }),
    /** Start paused (the owner resumes from the builder or the admin route). */
    paused: z.boolean().default(false),
    /** Stop a run after this long. Keep under the route's maxDuration (60 s). */
    timeoutSeconds: z.number().int().min(10).max(55).default(50),
  })
  .superRefine((c, ctx) => {
    const perRun = BigInt(c.budget.perRunMicro)
    if (BigInt(c.budget.dailyMicro) < perRun) ctx.addIssue({ code: 'custom', path: ['budget', 'dailyMicro'], message: 'The daily cap must be at least the per-run cap.' })
    if (BigInt(c.model.maxCostMicro) * 2n > perRun) ctx.addIssue({ code: 'custom', path: ['budget', 'perRunMicro'], message: 'The per-run cap must cover two model calls (one repair attempt).' })
    const ids = c.inputs.map((i) => i.id)
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['inputs'], message: 'Each input needs its own id.' })
  })

export type AgentConfig = z.infer<typeof agentConfigSchema>

/** The chain.read network for NEXT_PUBLIC_CHAIN_ID. The local Anvil fork (31337) reads mainnet, which it forks. */
export function defaultNetwork(chainId: string | undefined = process.env.NEXT_PUBLIC_CHAIN_ID): (typeof NETWORKS)[number] {
  return chainId === '46630' ? 'robinhood-testnet' : 'robinhood'
}
