/**
 * Picks the reader for this app: the RPC (viem) by default, Orbio chain.read when the config says so
 * and an Orbio client is supplied. The local test chain (31337) always uses the RPC.
 */
import config from '@/config/modules/chain.json'
import { createPublicClient, http, type PublicClient } from 'viem'
import { DEFAULT_RPC_URLS, chainFor, getChainId, type SupportedChainId } from './chains'
import { orbioReader, type OrbioClient } from './orbio'
import { viemReader, type ChainReader } from './reader'

interface ChainConfigFile {
  source?: 'rpc' | 'orbio'
  rpcUrls?: Partial<Record<string, string>>
  orbio?: { maxCostMicroPerRead?: number }
}
const cfg = config as ChainConfigFile

/**
 * RPC URL precedence: RPC_URL (server-only, may hold a provider key) > NEXT_PUBLIC_RPC_URL > config > public default.
 * In the browser only NEXT_PUBLIC_RPC_URL / config / default are visible.
 */
export function rpcUrlFor(chainId: SupportedChainId): string {
  const serverOnly = typeof window === 'undefined' ? process.env.RPC_URL : undefined
  return serverOnly || process.env.NEXT_PUBLIC_RPC_URL || cfg.rpcUrls?.[String(chainId)] || DEFAULT_RPC_URLS[chainId]
}

const clients = new Map<SupportedChainId, PublicClient>()

export function getPublicClient(chainId: SupportedChainId = getChainId()): PublicClient {
  let c = clients.get(chainId)
  if (!c) {
    const url = rpcUrlFor(chainId)
    c = createPublicClient({ chain: chainFor(chainId, url), transport: http(url, { retryCount: 2, timeout: 15_000 }) }) as PublicClient
    clients.set(chainId, c)
  }
  return c
}

export interface CreateReaderOptions {
  chainId?: SupportedChainId
  /** Needed when config.source is "orbio". Server-only. */
  orbio?: Pick<OrbioClient, 'tool'>
  projectId?: string
  jobId?: string
  onCost?: (micro: bigint, method: string) => void
}

export function createChainReader(opts: CreateReaderOptions = {}): ChainReader {
  const chainId = opts.chainId ?? getChainId()
  if (cfg.source === 'orbio' && chainId !== 31337) {
    if (!opts.orbio || !opts.projectId) throw new Error('Chain reads are set to go through Orbio, but no Orbio connection was given.')
    return orbioReader({
      orbio: opts.orbio,
      chainId,
      projectId: opts.projectId,
      jobId: opts.jobId,
      maxCostMicroPerRead: BigInt(cfg.orbio?.maxCostMicroPerRead ?? 2000),
      onCost: opts.onCost,
    })
  }
  return viemReader(getPublicClient(chainId), chainId)
}
