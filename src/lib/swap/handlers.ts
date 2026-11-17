import { formatUnits, isAddress, parseUnits, getAddress, type PublicClient } from 'viem'
import { z } from 'zod'
import { getChainId, getPublicClient } from './chain'
import { getSwapConfig } from './config'
import type { SwapConfig } from './config-schema'
import { permitToJson } from './encode'
import { planSwap, quoteSwap, resolveToken } from './quote'
import { sampleAmountOut, sampleQuotesEnabled } from './sample'
import { toJson } from './unsigned-tx'

export interface HandlerDeps {
  config?: SwapConfig
  client?: Pick<PublicClient, 'simulateContract' | 'readContract'>
  nowSeconds?: number
}

const body = z.object({
  from: z.string().min(1).max(16),
  to: z.string().min(1).max(16),
  /** Human amount of `from`, e.g. "0.25". */
  amount: z.string().regex(/^\d{1,30}(\.\d{1,36})?$/),
  /** The connected wallet. Without it you get a quote only (no approval steps). */
  owner: z.string().refine((a) => isAddress(a, { strict: false })).optional(),
})

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/**
 * POST /api/swap/quote { from, to, amount, owner? }
 * → { quote, minAmountOut, approvals: UnsignedTxJson[], permit: { permitSingle, typedData } | null, swapInput, swap: UnsignedTxJson | null }
 * Never sends or signs anything: the wallet does.
 */
export async function handleQuote(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  let input: z.infer<typeof body>
  try {
    input = body.parse(await req.json())
  } catch {
    return json({ code: 'bad_request', error: 'Enter an amount and pick two tokens.' }, 400)
  }
  const config = deps.config ?? getSwapConfig()
  if (sampleQuotesEnabled()) {
    const out = sampleAmountOut(input.from, input.to, Number(input.amount))
    return json({
      sample: true,
      quote: { from: input.from, to: input.to, amountIn: input.amount, amountOut: String(out ?? 0), route: 'Sample quote (preview only)', gasEstimate: '0' },
      minAmountOut: null,
      approvals: [],
      permit: null,
      swapInput: null,
      swap: null,
    })
  }
  const chainId = getChainId()
  const client = deps.client ?? getPublicClient()
  try {
    const tokenIn = resolveToken(config, input.from, chainId)
    const amountIn = parseUnits(input.amount, tokenIn.decimals)
    if (!input.owner) {
      const q = await quoteSwap({ config, chainId, client, from: input.from, to: input.to, amountIn })
      return json({ quote: describe(q), minAmountOut: null, approvals: [], permit: null, swapInput: null, swap: null })
    }
    const plan = await planSwap({ config, chainId, client, from: input.from, to: input.to, amountIn, owner: getAddress(input.owner), nowSeconds: deps.nowSeconds })
    return json({
      quote: describe(plan.quote),
      minAmountOut: formatUnits(plan.minAmountOut, plan.quote.tokenOut.decimals),
      slippageBps: config.slippageBps,
      approvals: plan.approvals.map(toJson),
      permit: plan.permit ? { permitSingle: permitToJson(plan.permit.permitSingle), typedData: { ...plan.permit.typedData, message: permitToJson(plan.permit.permitSingle) } } : null,
      swapInput: plan.swapInput,
      swap: plan.swap ? toJson(plan.swap) : null,
    })
  } catch (e) {
    return json({ code: 'no_quote', error: e instanceof Error ? e.message : 'No quote right now.' }, 422)
  }
}

function describe(q: Awaited<ReturnType<typeof quoteSwap>>) {
  return {
    from: q.tokenIn.symbol,
    to: q.tokenOut.symbol,
    amountIn: formatUnits(q.amountIn, q.tokenIn.decimals),
    amountOut: formatUnits(q.amountOut, q.tokenOut.decimals),
    route: q.route.label,
    gasEstimate: q.gasEstimate,
  }
}
