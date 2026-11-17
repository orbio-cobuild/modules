import { encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem'

/** Unsigned transaction handed to the user's browser wallet (docs/workstreams.md). We never sign. */
export interface UnsignedTx {
  chainId: number
  to?: `0x${string}`
  data: `0x${string}`
  value: bigint
  description: string
}

/** JSON-safe form for API responses (bigint as a decimal string). */
export interface UnsignedTxJson {
  chainId: number
  to?: `0x${string}`
  data: `0x${string}`
  value: string
  description: string
}

export const toJson = (tx: UnsignedTx): UnsignedTxJson => ({ ...tx, value: tx.value.toString() })
export const fromJson = (tx: UnsignedTxJson): UnsignedTx => ({ ...tx, value: BigInt(tx.value) })

/** An ERC-20 `transfer(recipient, amount)` the payer's wallet sends. */
export function buildTransferTx(opts: { chainId: number; token: Address; recipient: Address; amountRaw: bigint; description: string }): UnsignedTx {
  const data: Hex = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [opts.recipient, opts.amountRaw] })
  return { chainId: opts.chainId, to: opts.token, data, value: 0n, description: opts.description }
}
