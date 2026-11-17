/**
 * ChainReader over Orbio's `chain.read` tool (Alchemy behind it), billed to the project's Orbio balance.
 * Server-only: the Orbio credential never reaches the browser.
 */
import {
  decodeEventLog,
  decodeFunctionResult,
  encodeEventTopics,
  encodeFunctionData,
  hexToBigInt,
  numberToHex,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from 'viem'
import { erc20Abi } from './abi'
import { ORBIO_NETWORK, type SupportedChainId } from './chains'
import { MAX_LOG_RANGE, type ChainReader, type DecodedLog, type ReadContractParams } from './reader'

// --- Shared interface from docs/workstreams.md (structural copy; @cofounder/orbio owns the original) ---
export interface PaidCallOptions {
  maxCostMicro: bigint
  projectId: string
  jobId?: string
}
export interface OrbioClient {
  paidCall<T>(method: string, args: Record<string, unknown>, opts: PaidCallOptions): Promise<T>
  read<T>(method: string, args?: Record<string, unknown>): Promise<T>
  tool<T>(name: string, args: Record<string, unknown>, opts: PaidCallOptions): Promise<T>
}
// -------------------------------------------------------------------------------------------------------

export interface OrbioReaderOptions {
  orbio: Pick<OrbioClient, 'tool'>
  chainId: SupportedChainId
  projectId: string
  jobId?: string
  /** Ceiling per read, micro-USD (1 CREDIT = 1,000,000). A balance read typically costs ~13. */
  maxCostMicroPerRead?: bigint
  /** Called with what each read was charged, when Orbio reports it. */
  onCost?: (micro: bigint, method: string) => void
}

type RpcMethod =
  | 'eth_blockNumber'
  | 'eth_getBalance'
  | 'eth_call'
  | 'eth_getLogs'
  | 'eth_getTransactionReceipt'

interface RpcLog {
  address: Address
  topics: Hash[]
  data: Hex
  blockNumber: Hex
  transactionHash: Hash
  logIndex: Hex
}

export function orbioReader(opts: OrbioReaderOptions): ChainReader {
  const network = ORBIO_NETWORK[opts.chainId]
  if (!network) throw new Error('Orbio can’t read the local test chain. Use the RPC reader for it.')
  const maxCostMicro = opts.maxCostMicroPerRead ?? 2_000n

  async function rpc<T>(method: RpcMethod, params: unknown[]): Promise<T> {
    const res = await opts.orbio.tool<unknown>('chain.read', { method, params, network }, { maxCostMicro, projectId: opts.projectId, jobId: opts.jobId })
    if (res && typeof res === 'object') {
      const r = res as { result?: unknown; chargedMicroUsd?: unknown; error?: unknown }
      if (r.error) throw new Error(`Couldn’t read the chain: ${typeof r.error === 'string' ? r.error : JSON.stringify(r.error)}`)
      if (opts.onCost && (typeof r.chargedMicroUsd === 'string' || typeof r.chargedMicroUsd === 'number' || typeof r.chargedMicroUsd === 'bigint')) {
        opts.onCost(BigInt(r.chargedMicroUsd), method)
      }
      if ('result' in r) return r.result as T
    }
    return res as T
  }

  async function call<T>(p: ReadContractParams): Promise<T> {
    const data = encodeFunctionData({ abi: p.abi, functionName: p.functionName, args: (p.args ?? []) as unknown[] } as never)
    const out = await rpc<Hex>('eth_call', [{ to: p.address, data }, 'latest'])
    return decodeFunctionResult({ abi: p.abi, functionName: p.functionName, data: out } as never) as T
  }

  const reader: ChainReader = {
    chainId: opts.chainId,
    source: 'orbio',
    getBlockNumber: async () => hexToBigInt(await rpc<Hex>('eth_blockNumber', [])),
    getBalance: async (address) => hexToBigInt(await rpc<Hex>('eth_getBalance', [address, 'latest'])),
    getErc20Balance: (token, owner) => call<bigint>({ address: token, abi: erc20Abi as Abi, functionName: 'balanceOf', args: [owner] }),
    async getErc20Metadata(token) {
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        call<string>({ address: token, abi: erc20Abi as Abi, functionName: 'name' }),
        call<string>({ address: token, abi: erc20Abi as Abi, functionName: 'symbol' }),
        call<number>({ address: token, abi: erc20Abi as Abi, functionName: 'decimals' }),
        call<bigint>({ address: token, abi: erc20Abi as Abi, functionName: 'totalSupply' }),
      ])
      return { address: token, name, symbol, decimals: Number(decimals), totalSupply }
    },
    readContract: call,
    async getLogs(p) {
      const toBlock = p.toBlock === undefined || p.toBlock === 'latest' ? await reader.getBlockNumber() : p.toBlock
      if (toBlock - p.fromBlock > MAX_LOG_RANGE) throw new Error(`Ask for at most ${MAX_LOG_RANGE} blocks of events at a time.`)
      const topics = encodeEventTopics({ abi: [p.event], eventName: p.event.name, args: p.args as never } as never)
      const logs = await rpc<RpcLog[]>('eth_getLogs', [
        { address: p.address, topics, fromBlock: numberToHex(p.fromBlock), toBlock: numberToHex(toBlock) },
      ])
      return logs.map((l): DecodedLog => {
        const decoded = decodeEventLog({ abi: [p.event], data: l.data, topics: l.topics as [Hex, ...Hex[]] })
        return {
          blockNumber: hexToBigInt(l.blockNumber),
          transactionHash: l.transactionHash,
          logIndex: Number(hexToBigInt(l.logIndex)),
          address: l.address,
          eventName: decoded.eventName ?? p.event.name,
          args: (decoded.args ?? {}) as Record<string, unknown>,
        }
      })
    },
    async getTransactionReceipt(hash) {
      const r = await rpc<null | { status: Hex; blockNumber: Hex; from: Address; to: Address | null; logs: RpcLog[] }>('eth_getTransactionReceipt', [hash])
      if (!r) return null
      return {
        status: r.status === '0x1' ? 'success' : 'reverted',
        blockNumber: hexToBigInt(r.blockNumber),
        from: r.from,
        to: r.to,
        logs: r.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data })),
      }
    },
  }
  return reader
}
