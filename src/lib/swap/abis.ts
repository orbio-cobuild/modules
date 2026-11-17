import { parseAbi } from 'viem'

/** The canonical Permit2 address (same CREATE2 address on most EVM chains). Verify on each chain before use. */
export const CANONICAL_PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const

export const universalRouterAbi = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable'])

export const quoterV2Abi = parseAbi([
  'function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)',
])

export const permit2Abi = parseAbi([
  'function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
])

/** Universal Router command bytes (developers.uniswap.org, universal-router/concepts/commands). */
export const Command = {
  V3_SWAP_EXACT_IN: 0x00,
  PERMIT2_PERMIT: 0x0a,
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
} as const

/** Universal Router recipient shortcuts. */
export const MSG_SENDER = '0x0000000000000000000000000000000000000001' as const
export const ADDRESS_THIS = '0x0000000000000000000000000000000000000002' as const
