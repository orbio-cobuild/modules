/**
 * Pure Universal Router / Permit2 encoding. Client-safe (no network, no secrets), so the browser can finish the swap
 * transaction after the user signs a Permit2 message.
 */
import { concatHex, encodeAbiParameters, encodeFunctionData, encodePacked, numberToHex, type Address, type Hex } from 'viem'
import { ADDRESS_THIS, Command, MSG_SENDER, universalRouterAbi } from './abis'
import type { UnsignedTx } from './unsigned-tx'

/** Uniswap v3 path: token (20 bytes) · fee (3 bytes) · token · fee · token … */
export function encodePath(tokens: Address[], fees: number[]): Hex {
  if (tokens.length !== fees.length + 1 || fees.length === 0) throw new Error('A route needs one more token than fees.')
  const types: ('address' | 'uint24')[] = []
  const values: (Address | number)[] = []
  tokens.forEach((t, i) => {
    types.push('address')
    values.push(t)
    if (i < fees.length) {
      types.push('uint24')
      values.push(fees[i]!)
    }
  })
  return encodePacked(types, values)
}

export function applySlippage(amountOut: bigint, slippageBps: number): bigint {
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n
}

export interface PermitSingle {
  details: { token: Address; amount: bigint; expiration: number; nonce: number }
  spender: Address
  sigDeadline: bigint
}

export const PERMIT_TYPES = {
  PermitDetails: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint160' },
    { name: 'expiration', type: 'uint48' },
    { name: 'nonce', type: 'uint48' },
  ],
  PermitSingle: [
    { name: 'details', type: 'PermitDetails' },
    { name: 'spender', type: 'address' },
    { name: 'sigDeadline', type: 'uint256' },
  ],
} as const

/** EIP-712 data the user's wallet signs (no transaction, no gas). Pass straight to wagmi's signTypedData. */
export function permitTypedData(permit: PermitSingle, chainId: number, permit2: Address) {
  return {
    domain: { name: 'Permit2', chainId, verifyingContract: permit2 },
    types: PERMIT_TYPES,
    primaryType: 'PermitSingle' as const,
    message: permit,
  }
}

const PERMIT_SINGLE_PARAM = {
  type: 'tuple',
  components: [
    {
      name: 'details',
      type: 'tuple',
      components: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint160' },
        { name: 'expiration', type: 'uint48' },
        { name: 'nonce', type: 'uint48' },
      ],
    },
    { name: 'spender', type: 'address' },
    { name: 'sigDeadline', type: 'uint256' },
  ],
} as const

export interface SwapTxInput {
  chainId: number
  router: Address
  /** 'native' for ETH in; the path must then start with WETH. */
  tokenIn: Address | 'native'
  tokenOut: Address | 'native'
  path: Hex
  amountIn: bigint
  minAmountOut: bigint
  deadline: bigint
  /** Present in signature mode: the signed Permit2 message rides along as the first command. */
  permit?: { permitSingle: PermitSingle; signature: Hex }
  /** Deployed Universal Router version (config.routerVersion). Default '2.0'. */
  routerVersion?: '1.2' | '2.0' | '2.1.1' | '2.1.2' | '2.2.0'
  description: string
}

const takesMinHopPrice = (v: SwapTxInput['routerVersion']) => v === '2.1.1' || v === '2.1.2' || v === '2.2.0'

/** Builds `UniversalRouter.execute(commands, inputs, deadline)` for an exact-input v3 swap. */
export function buildSwapTx(i: SwapTxInput): UnsignedTx {
  if (i.tokenIn === 'native' && i.tokenOut === 'native') throw new Error('Pick two different tokens.')
  const commands: number[] = []
  const inputs: Hex[] = []

  if (i.permit) {
    commands.push(Command.PERMIT2_PERMIT)
    inputs.push(encodeAbiParameters([PERMIT_SINGLE_PARAM, { type: 'bytes' }], [i.permit.permitSingle, i.permit.signature]))
  }
  if (i.tokenIn === 'native') {
    commands.push(Command.WRAP_ETH)
    inputs.push(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [ADDRESS_THIS, i.amountIn]))
  }
  const outIsNative = i.tokenOut === 'native'
  commands.push(Command.V3_SWAP_EXACT_IN)
  // recipient, amountIn, amountOutMin, path, payerIsUser (false when the router pays with the ETH it just wrapped)
  const swapArgs = [outIsNative ? ADDRESS_THIS : MSG_SENDER, i.amountIn, outIsNative ? 0n : i.minAmountOut, i.path, i.tokenIn !== 'native'] as const
  const swapTypes = [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes' }, { type: 'bool' }] as const
  inputs.push(
    takesMinHopPrice(i.routerVersion)
      ? // 2.1.1+: per-hop price floors; empty = none (amountOutMin still protects the whole swap)
        encodeAbiParameters([...swapTypes, { type: 'uint256[]' }], [...swapArgs, []])
      : encodeAbiParameters(swapTypes, swapArgs),
  )
  if (outIsNative) {
    commands.push(Command.UNWRAP_WETH)
    inputs.push(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [MSG_SENDER, i.minAmountOut]))
  }

  const data = encodeFunctionData({
    abi: universalRouterAbi,
    functionName: 'execute',
    args: [concatHex(commands.map((c) => numberToHex(c, { size: 1 }))), inputs, i.deadline],
  })
  return { chainId: i.chainId, to: i.router, data, value: i.tokenIn === 'native' ? i.amountIn : 0n, description: i.description }
}

/** JSON-safe Permit2 data for API responses. */
export interface PermitSingleJson {
  details: { token: Address; amount: string; expiration: number; nonce: number }
  spender: Address
  sigDeadline: string
}
export const permitToJson = (p: PermitSingle): PermitSingleJson => ({ ...p, details: { ...p.details, amount: p.details.amount.toString() }, sigDeadline: p.sigDeadline.toString() })
export const permitFromJson = (p: PermitSingleJson): PermitSingle => ({ ...p, details: { ...p.details, amount: BigInt(p.details.amount) }, sigDeadline: BigInt(p.sigDeadline) })
