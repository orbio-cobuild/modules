/** Unsigned transaction handed to the user's browser wallet (docs/workstreams.md). We never sign. */
export interface UnsignedTx {
  chainId: number
  to?: `0x${string}`
  data: `0x${string}`
  value: bigint
  description: string
}

export interface UnsignedTxJson {
  chainId: number
  to?: `0x${string}`
  data: `0x${string}`
  value: string
  description: string
}

export const toJson = (tx: UnsignedTx): UnsignedTxJson => ({ ...tx, value: tx.value.toString() })
export const fromJson = (tx: UnsignedTxJson): UnsignedTx => ({ ...tx, value: BigInt(tx.value) })
