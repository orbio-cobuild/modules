/**
 * ChainReader: one interface for every chain read, with two implementations:
 *  - viemReader: straight to an RPC (works everywhere, required for the local Anvil chain)
 *  - orbioReader (./orbio.ts): through Orbio's chain.read tool, billed to the project's Orbio balance
 */
import {
  decodeEventLog,
  type Abi,
  type AbiEvent,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type Hash,
  type PublicClient,
} from 'viem'
import { erc20Abi } from './abi'
import type { SupportedChainId } from './chains'

export interface TokenMetadata {
  address: Address
  name: string
  symbol: string
  decimals: number
  totalSupply: bigint
}

export interface ReadContractParams {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

export interface GetLogsParams {
  address?: Address | Address[]
  event: AbiEvent
  args?: Record<string, unknown>
  fromBlock: bigint
  toBlock?: bigint | 'latest'
}

export interface DecodedLog {
  blockNumber: bigint
  transactionHash: Hash
  logIndex: number
  address: Address
  eventName: string
  args: Record<string, unknown>
}

export interface ReceiptSummary {
  status: 'success' | 'reverted'
  blockNumber: bigint
  from: Address
  to: Address | null
  logs: Array<{ address: Address; topics: readonly Hash[]; data: Hash }>
}

export interface ChainReader {
  readonly chainId: SupportedChainId
  readonly source: 'rpc' | 'orbio'
  getBlockNumber(): Promise<bigint>
  getBalance(address: Address): Promise<bigint>
  getErc20Balance(token: Address, owner: Address): Promise<bigint>
  getErc20Metadata(token: Address): Promise<TokenMetadata>
  readContract<T = unknown>(params: ReadContractParams): Promise<T>
  getLogs(params: GetLogsParams): Promise<DecodedLog[]>
  /** null while the transaction isn't mined yet. */
  getTransactionReceipt(hash: Hash): Promise<ReceiptSummary | null>
}

/** Biggest block span asked for in one getLogs call; public RPCs refuse larger ranges. */
export const MAX_LOG_RANGE = 10_000n

export function viemReader(client: PublicClient, chainId: SupportedChainId): ChainReader {
  const read = <T,>(p: ReadContractParams) =>
    client.readContract({
      address: p.address,
      abi: p.abi,
      functionName: p.functionName as ContractFunctionName<Abi, 'view' | 'pure'>,
      args: (p.args ?? []) as ContractFunctionArgs<Abi, 'view' | 'pure'>,
    }) as Promise<T>

  const reader: ChainReader = {
    chainId,
    source: 'rpc',
    getBlockNumber: () => client.getBlockNumber(),
    getBalance: (address) => client.getBalance({ address }),
    getErc20Balance: (token, owner) => read<bigint>({ address: token, abi: erc20Abi as Abi, functionName: 'balanceOf', args: [owner] }),
    async getErc20Metadata(token) {
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        read<string>({ address: token, abi: erc20Abi as Abi, functionName: 'name' }),
        read<string>({ address: token, abi: erc20Abi as Abi, functionName: 'symbol' }),
        read<number>({ address: token, abi: erc20Abi as Abi, functionName: 'decimals' }),
        read<bigint>({ address: token, abi: erc20Abi as Abi, functionName: 'totalSupply' }),
      ])
      return { address: token, name, symbol, decimals: Number(decimals), totalSupply }
    },
    readContract: read,
    async getLogs(p) {
      const toBlock = p.toBlock === undefined || p.toBlock === 'latest' ? await client.getBlockNumber() : p.toBlock
      if (toBlock - p.fromBlock > MAX_LOG_RANGE) throw new Error(`Ask for at most ${MAX_LOG_RANGE} blocks of events at a time.`)
      const logs = await client.getLogs({ address: p.address, event: p.event, args: p.args as never, fromBlock: p.fromBlock, toBlock })
      return logs.map((l) => {
        const decoded = decodeEventLog({ abi: [p.event], data: l.data, topics: l.topics })
        return {
          blockNumber: l.blockNumber,
          transactionHash: l.transactionHash,
          logIndex: l.logIndex,
          address: l.address,
          eventName: decoded.eventName ?? p.event.name,
          args: (decoded.args ?? {}) as Record<string, unknown>,
        }
      })
    },
    async getTransactionReceipt(hash) {
      try {
        const r = await client.getTransactionReceipt({ hash })
        return { status: r.status, blockNumber: r.blockNumber, from: r.from, to: r.to, logs: r.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data })) }
      } catch (err) {
        if (err instanceof Error && err.name === 'TransactionReceiptNotFoundError') return null
        throw err
      }
    },
  }
  return reader
}
