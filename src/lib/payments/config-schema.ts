import { isAddress } from 'viem'
import { z } from 'zod'

const address = z.string().refine((a) => isAddress(a, { strict: false }), 'must be a 0x address')
/** Integer micro-USD (6 decimals), as a decimal string in JSON. USDG and CREDIT both have 6 decimals, so 1 unit = 1 micro. */
const micro = z
  .string()
  .regex(/^\d+$/, 'must be a whole number of micro-units, e.g. "5000000" for 5')
  .transform((s) => BigInt(s))

export const TOKEN_SYMBOLS = ['USDG', 'CREDIT'] as const
export type TokenSymbol = (typeof TOKEN_SYMBOLS)[number]

export const productSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'lowercase letters, digits and dashes'),
  name: z.string().min(1).max(80),
  description: z.string().max(300).default(''),
  priceMicro: micro,
  /** Which tokens this product can be paid in. */
  tokens: z.array(z.enum(TOKEN_SYMBOLS)).min(1).default(['USDG', 'CREDIT']),
})

/** Config for the payments module. The pipeline writes the validated value to `src/config/payments.json`. */
export const configSchema = z.object({
  /** The project's wallet that receives every payment. The user's own wallet; never one we control. */
  recipient: address,
  /** Token contract overrides per chain id. 4663 (and its 31337 fork) default to Orbio's live USDG and CREDIT. */
  tokenAddresses: z.record(z.string().regex(/^\d+$/), z.object({ USDG: address.optional(), CREDIT: address.optional() })).default({}),
  products: z.array(productSchema).max(100).default([]),
  tips: z
    .object({
      enabled: z.boolean().default(true),
      tokens: z.array(z.enum(TOKEN_SYMBOLS)).min(1).default(['USDG', 'CREDIT']),
      presetsMicro: z.array(micro).max(6).prefault(['1000000', '5000000', '20000000']),
      minMicro: micro.prefault('100000'),
      maxMicro: micro.prefault('1000000000'),
    })
    .prefault({}),
  /** Blocks to wait after the payment's block before recording it. */
  minConfirmations: z.number().int().min(1).max(64).default(1),
  /** How long someone has to send the payment after starting checkout. */
  intentTtlSeconds: z.number().int().min(60).max(60 * 60 * 24).default(60 * 60),
})

export type PaymentsConfig = z.infer<typeof configSchema>
export type PaymentsConfigInput = z.input<typeof configSchema>
export type Product = z.infer<typeof productSchema>
