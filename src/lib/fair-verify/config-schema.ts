import { isAddress } from 'viem'
import { z } from 'zod'

const address = z.string().refine((a) => isAddress(a, { strict: false }), 'must be a 0x address')

export const outcomeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('coinflip'), labels: z.tuple([z.string().min(1), z.string().min(1)]).default(['Heads', 'Tails']) }),
  /** Inclusive range, e.g. a dice roll 1–6 or a 0–9999 ticket. */
  z.object({ kind: z.literal('range'), min: z.number().int(), max: z.number().int(), label: z.string().max(40).default('Number') }),
  z.object({ kind: z.literal('pick'), options: z.array(z.string().min(1).max(60)).min(2).max(1000), label: z.string().max(40).default('Winner') }),
  /** Show the raw 256-bit result only. */
  z.object({ kind: z.literal('raw') }),
])

/** Config for the fair-verify module. The pipeline writes the validated value to `src/config/fair-verify.json`. */
export const configSchema = z
  .object({
    /** The project's CofounderCommitReveal contract (WS-contracts template), per chain id. */
    contractByChain: z.record(z.string().regex(/^\d+$/), address),
    /** How the app turns a round's 256-bit result into what players see. Must match the app's own game code. */
    outcome: outcomeSchema,
    /** What a round is called on the page: "Round", "Flip", "Draw" … */
    roundNoun: z.string().min(1).max(20).default('Round'),
  })
  .refine((c) => c.outcome.kind !== 'range' || c.outcome.max >= c.outcome.min, { message: 'outcome.max must be ≥ outcome.min' })

export type FairVerifyConfig = z.infer<typeof configSchema>
export type Outcome = z.infer<typeof outcomeSchema>
