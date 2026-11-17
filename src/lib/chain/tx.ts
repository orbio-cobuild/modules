/**
 * Builds an unsigned transaction for the user's own wallet to review and sign (wagmi in the browser).
 * Nothing here signs or sends.
 */
import { encodeFunctionData, type Abi, type Address, type Hex } from 'viem'
import { getChainId, type SupportedChainId } from './chains'

// Shared shape from docs/workstreams.md.
export interface UnsignedTx {
  chainId: number
  to?: `0x${string}`
  data: `0x${string}`
  value: bigint
  description: string
}

export function buildUnsignedTx(p: {
  to: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
  value?: bigint
  description: string
  chainId?: SupportedChainId
}): UnsignedTx {
  if (!p.description.trim()) throw new Error('Every transaction needs a plain description for the person signing it.')
  const data: Hex = encodeFunctionData({ abi: p.abi, functionName: p.functionName, args: (p.args ?? []) as unknown[] } as never)
  return { chainId: p.chainId ?? getChainId(), to: p.to, data, value: p.value ?? 0n, description: p.description }
}
