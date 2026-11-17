import { isAddress } from 'viem'
import { z } from 'zod'

const address = z.string().refine((a) => isAddress(a, { strict: false }), 'must be a 0x address')
const perChain = z.record(z.string().regex(/^\d+$/), address)

/** Uniswap v3 fee tiers in hundredths of a basis point (500 = 0.05%). */
const feeTier = z.union([z.literal(100), z.literal(500), z.literal(3000), z.literal(10000)])

export const tokenSchema = z.object({
  symbol: z.string().regex(/^[A-Za-z0-9.$_-]{1,16}$/),
  name: z.string().max(60).optional(),
  /** 'native' = the chain's ETH (wrapped through `weth` inside the router). */
  address: z.union([address, z.literal('native')]).optional(),
  addressByChain: perChain.default({}),
  decimals: z.number().int().min(0).max(36),
})

export const routeSchema = z.object({
  from: z.string(),
  to: z.string(),
  /** Hops after `from`: each is the pool fee and the token it lands in. The last hop's token must be `to`. */
  hops: z.array(z.object({ fee: feeTier, token: z.string() })).min(1).max(4),
})

/** Config for the swap module. The pipeline writes the validated value to `src/config/swap.json`. */
export const configSchema = z.object({
  /** Uniswap Universal Router, per chain id. Robinhood Chain addresses must be confirmed before use. */
  universalRouter: perChain,
  /**
   * Universal Router version deployed on this chain. From 2.1.1 the V3 swap command takes an extra
   * `minHopPriceX36` list, so this must match the deployed router.
   */
  routerVersion: z.enum(['1.2', '2.0', '2.1.1', '2.1.2', '2.2.0']).default('2.0'),
  /** Uniswap v3 QuoterV2, per chain id. */
  quoter: perChain,
  /** Wrapped ETH, per chain id (needed only when ETH is in the token list). */
  weth: perChain.default({}),
  /** Permit2 is deployed at the same address on most chains; override per chain if not. */
  permit2: perChain.default({}),
  tokens: z.array(tokenSchema).min(2).max(30),
  /** Explicit routes. Pairs without one are tried directly at each fee tier in `directFeeTiers`. */
  routes: z.array(routeSchema).default([]),
  directFeeTiers: z.array(feeTier).min(1).default([500, 3000, 10000]),
  /** Default token pair shown in the widget. */
  defaultFrom: z.string(),
  defaultTo: z.string(),
  /** Allowed price movement before the swap reverts, in basis points (50 = 0.5%). */
  slippageBps: z.number().int().min(1).max(500).default(50),
  deadlineSeconds: z.number().int().min(60).max(3600).default(1200),
  /**
   * How the router gets permission to move the token through Permit2:
   *  'signature'   — the user signs a Permit2 message (no gas) that rides along in the swap (Uniswap's default)
   *  'transaction' — the user sends a Permit2 approve transaction first
   */
  permit2Mode: z.enum(['signature', 'transaction']).default('signature'),
  /** How long a Permit2 allowance lasts. */
  permitExpirySeconds: z.number().int().min(300).max(60 * 60 * 24 * 30).default(60 * 60 * 24),
  /** Approve Permit2 for the exact amount (default) instead of unlimited. */
  approveExactAmount: z.boolean().default(true),
})

export type SwapConfig = z.infer<typeof configSchema>
export type SwapToken = z.infer<typeof tokenSchema>
