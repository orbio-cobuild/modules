import { isAddress } from 'viem'
import { z } from 'zod'

const address = z.string().refine((a) => isAddress(a, { strict: false }), 'must be a 0x address')

export const gateSchema = z
  .object({
    /** Used in code: <Gated gate="holders">. */
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'lowercase letters, digits and dashes'),
    /** Shown to people, e.g. "Holders lounge". */
    name: z.string().min(1).max(80),
    standard: z.enum(['erc20', 'erc721']),
    /** Token contract. Use addressByChain when it differs per network (preview fork, testnet, mainnet). */
    address: address.optional(),
    addressByChain: z.record(z.string().regex(/^\d+$/), address).default({}),
    /** Display symbol, e.g. "PEPE" or "Genesis Pass". */
    symbol: z.string().max(32).default('tokens'),
    /** ERC-20 only. Read from the contract when omitted. */
    decimals: z.number().int().min(0).max(36).optional(),
    /**
     * How much is needed. ERC-20: whole or decimal tokens as a string ("100", "0.5"). ERC-721: how many NFTs ("1").
     */
    minBalance: z.string().regex(/^\d+(\.\d+)?$/, 'a positive number as a string, e.g. "100"'),
    /** Plain-English line shown to people who don't qualify. No price talk. */
    deniedMessage: z.string().max(200).optional(),
  })
  .refine((g) => g.address || Object.keys(g.addressByChain).length > 0, { message: 'set address or addressByChain' })
  .refine((g) => g.standard === 'erc20' || /^\d+$/.test(g.minBalance), { message: 'ERC-721 minBalance must be a whole number' })
  .refine((g) => !(g.standard === 'erc20' && g.minBalance.replace(/[0.]/g, '') === ''), { message: 'minBalance must be above 0' })

/** Config for the gating module. The pipeline writes the validated value to `src/config/gating.json`. */
export const configSchema = z.object({
  gates: z.array(gateSchema).min(1).max(20),
  /** Seconds a balance check is reused for the same wallet and gate. */
  cacheSeconds: z.number().int().min(0).max(600).default(30),
})

export type GatingConfig = z.infer<typeof configSchema>
export type Gate = z.infer<typeof gateSchema>
