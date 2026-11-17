/** Server-side quoting and planning (reads the chain). */
import { encodeFunctionData, erc20Abi, formatUnits, getAddress, maxUint256, type Address, type PublicClient } from 'viem'
import { CANONICAL_PERMIT2, permit2Abi, quoterV2Abi } from './abis'
import type { SwapConfig, SwapToken } from './config-schema'
import { applySlippage, buildSwapTx, encodePath, permitTypedData, type PermitSingle } from './encode'
import type { UnsignedTx } from './unsigned-tx'

export interface ResolvedToken {
  symbol: string
  decimals: number
  /** 'native' for ETH. */
  address: Address | 'native'
}

const MAX_UINT160 = (1n << 160n) - 1n

export function perChain(map: Record<string, Address>, chainId: number, what: string): Address {
  const a = map[String(chainId)]
  if (!a) throw new Error(`Swaps aren't set up on this network yet (${what} missing).`)
  return getAddress(a)
}

export const permit2Address = (config: SwapConfig, chainId: number): Address => getAddress(config.permit2[String(chainId)] ?? CANONICAL_PERMIT2)

export function resolveToken(config: SwapConfig, symbol: string, chainId: number): ResolvedToken {
  const t: SwapToken | undefined = config.tokens.find((x) => x.symbol.toLowerCase() === symbol.toLowerCase())
  if (!t) throw new Error(`${symbol} isn't available to swap here.`)
  const a = (t.addressByChain[String(chainId)] as `0x${string}` | undefined) ?? t.address
  if (!a) throw new Error(`${t.symbol} isn't available on this network.`)
  return { symbol: t.symbol, decimals: t.decimals, address: a === 'native' ? 'native' : getAddress(a) }
}

/** Address used inside the pool path: ETH is routed as WETH. */
const pathAddress = (config: SwapConfig, t: ResolvedToken, chainId: number) => (t.address === 'native' ? perChain(config.weth, chainId, 'WETH') : t.address)

export interface Candidate {
  tokens: Address[]
  fees: number[]
  label: string
}

export function candidateRoutes(config: SwapConfig, from: ResolvedToken, to: ResolvedToken, chainId: number): Candidate[] {
  const start = pathAddress(config, from, chainId)
  const explicit = config.routes.filter((r) => r.from.toLowerCase() === from.symbol.toLowerCase() && r.to.toLowerCase() === to.symbol.toLowerCase())
  if (explicit.length) {
    return explicit.map((r) => {
      const last = r.hops[r.hops.length - 1]!
      if (last.token.toLowerCase() !== to.symbol.toLowerCase()) throw new Error(`The ${r.from}→${r.to} route must end in ${r.to}.`)
      return {
        tokens: [start, ...r.hops.map((h) => pathAddress(config, resolveToken(config, h.token, chainId), chainId))],
        fees: r.hops.map((h) => h.fee),
        label: [r.from, ...r.hops.map((h) => `${h.token} (${h.fee / 10_000}%)`)].join(' → '),
      }
    })
  }
  const end = pathAddress(config, to, chainId)
  return config.directFeeTiers.map((fee) => ({ tokens: [start, end], fees: [fee], label: `${from.symbol} → ${to.symbol} (${fee / 10_000}%)` }))
}

export interface Quote {
  amountIn: bigint
  amountOut: bigint
  route: Candidate
  path: `0x${string}`
  gasEstimate: bigint
}

type Reader = Pick<PublicClient, 'simulateContract' | 'readContract'>

/** Asks Uniswap's QuoterV2 for each candidate route and keeps the best. Throws a plain-English error if none work. */
export async function quoteSwap(opts: { config: SwapConfig; chainId: number; client: Reader; from: string; to: string; amountIn: bigint }): Promise<Quote & { tokenIn: ResolvedToken; tokenOut: ResolvedToken }> {
  const { config, chainId, client, amountIn } = opts
  const tokenIn = resolveToken(config, opts.from, chainId)
  const tokenOut = resolveToken(config, opts.to, chainId)
  if (tokenIn.symbol === tokenOut.symbol) throw new Error('Pick two different tokens.')
  if (amountIn <= 0n) throw new Error('Enter an amount to swap.')
  const quoter = perChain(config.quoter, chainId, 'quoter')
  let best: Quote | null = null
  for (const route of candidateRoutes(config, tokenIn, tokenOut, chainId)) {
    const path = encodePath(route.tokens, route.fees)
    try {
      const { result } = await client.simulateContract({ address: quoter, abi: quoterV2Abi, functionName: 'quoteExactInput', args: [path, amountIn] })
      const [amountOut, , , gasEstimate] = result
      if (amountOut > 0n && (!best || amountOut > best.amountOut)) best = { amountIn, amountOut, route, path, gasEstimate }
    } catch {
      // No pool at this fee tier, or not enough liquidity: try the next route.
    }
  }
  if (!best) throw new Error(`There's no Uniswap pool with enough liquidity to swap ${tokenIn.symbol} for ${tokenOut.symbol} right now.`)
  return { ...best, tokenIn, tokenOut }
}

export interface SwapPlan {
  quote: Quote & { tokenIn: ResolvedToken; tokenOut: ResolvedToken }
  minAmountOut: bigint
  deadline: bigint
  /** Send these first, in order (each waits for the previous to confirm). */
  approvals: UnsignedTx[]
  /** Signature mode: the wallet signs this, then the client calls buildSwapTx({ ...swapInput, permit }). */
  permit: { permitSingle: PermitSingle; typedData: ReturnType<typeof permitTypedData> } | null
  /** Everything needed to build the swap transaction (minus any permit signature). */
  swapInput: Omit<Parameters<typeof buildSwapTx>[0], 'permit'>
  /** Ready-to-send swap when no permit signature is needed. */
  swap: UnsignedTx | null
}

/** Quote plus every step the owner's wallet must take: ERC-20 approval to Permit2, Permit2 allowance, swap. */
export async function planSwap(opts: {
  config: SwapConfig
  chainId: number
  client: Reader
  from: string
  to: string
  amountIn: bigint
  owner: Address
  nowSeconds?: number
}): Promise<SwapPlan> {
  const { config, chainId, client, owner } = opts
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000)
  const quote = await quoteSwap(opts)
  const router = perChain(config.universalRouter, chainId, 'router')
  const permit2 = permit2Address(config, chainId)
  const minAmountOut = applySlippage(quote.amountOut, config.slippageBps)
  const deadline = BigInt(now + config.deadlineSeconds)
  const fmtIn = formatUnits(quote.amountIn, quote.tokenIn.decimals)
  const fmtOut = formatUnits(minAmountOut, quote.tokenOut.decimals)
  const swapInput = {
    chainId,
    router,
    tokenIn: quote.tokenIn.address,
    tokenOut: quote.tokenOut.address,
    path: quote.path,
    amountIn: quote.amountIn,
    minAmountOut,
    deadline,
    routerVersion: config.routerVersion,
    description: `Swap ${fmtIn} ${quote.tokenIn.symbol} for at least ${fmtOut} ${quote.tokenOut.symbol} on Uniswap`,
  }

  const approvals: UnsignedTx[] = []
  let permit: SwapPlan['permit'] = null
  if (quote.tokenIn.address !== 'native') {
    const token = quote.tokenIn.address
    const toPermit2 = await client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, permit2] })
    if (toPermit2 < quote.amountIn) {
      const amount = config.approveExactAmount ? quote.amountIn : maxUint256
      approvals.push({
        chainId,
        to: token,
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [permit2, amount] }),
        value: 0n,
        description: `Allow Uniswap's Permit2 contract to use ${config.approveExactAmount ? `${fmtIn} ` : ''}${quote.tokenIn.symbol}`,
      })
    }
    const [allowed, expiration, nonce] = await client.readContract({ address: permit2, abi: permit2Abi, functionName: 'allowance', args: [owner, token, router] })
    if (allowed < quote.amountIn || expiration < now + 60) {
      const expiry = now + config.permitExpirySeconds
      if (config.permit2Mode === 'transaction') {
        approvals.push({
          chainId,
          to: permit2,
          data: encodeFunctionData({ abi: permit2Abi, functionName: 'approve', args: [token, router, quote.amountIn > MAX_UINT160 ? MAX_UINT160 : quote.amountIn, expiry] }),
          value: 0n,
          description: `Let the Uniswap router swap ${fmtIn} ${quote.tokenIn.symbol} for you`,
        })
      } else {
        const permitSingle: PermitSingle = { details: { token, amount: quote.amountIn, expiration: expiry, nonce }, spender: router, sigDeadline: deadline }
        permit = { permitSingle, typedData: permitTypedData(permitSingle, chainId, permit2) }
      }
    }
  }
  return { quote, minAmountOut, deadline, approvals, permit, swapInput, swap: permit ? null : buildSwapTx(swapInput) }
}
