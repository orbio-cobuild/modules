import { z } from 'zod'

const microString = z.string().regex(/^\d{1,15}$/, 'a whole number of micro-USD, as a string')

/**
 * Which Orbio tools this app may call, and how much it may spend.
 * Money is micro-USD (1 CREDIT = $1 = 1,000,000 µUSD) as strings.
 */
export const orbioToolsConfigSchema = z
  .object({
    /** Tool names from Orbio's catalogue (GET https://www.orbio.so/api/v1/tools). Anything else is refused. */
    tools: z.array(z.string().regex(/^[a-z][a-z0-9._-]{1,63}$/)).max(12).default([]),
    /** The most one call may cost. Each call also takes its own, lower cap if given. Default $0.10. */
    perCallMaxMicro: microString.default('100000'),
    /** The most all tool calls may cost per UTC day. Default $2. */
    dailyCapMicro: microString.default('2000000'),
  })
  .superRefine((c, ctx) => {
    if (BigInt(c.perCallMaxMicro) <= 0n) ctx.addIssue({ code: 'custom', path: ['perCallMaxMicro'], message: 'The per-call cap must be more than zero.' })
    if (BigInt(c.perCallMaxMicro) > BigInt(c.dailyCapMicro)) ctx.addIssue({ code: 'custom', path: ['dailyCapMicro'], message: 'The daily cap must be at least the per-call cap.' })
    if (BigInt(c.dailyCapMicro) > 50_000_000n) ctx.addIssue({ code: 'custom', path: ['dailyCapMicro'], message: 'The daily cap is above $50. Ask the owner before raising it that far.' })
  })

export type OrbioToolsConfig = z.infer<typeof orbioToolsConfigSchema>
