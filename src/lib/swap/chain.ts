import { createPublicClient, defineChain, http, type Chain, type PublicClient } from 'viem'

/** 31337 = local Anvil fork (preview), 46630 = Robinhood Chain testnet, 4663 = Robinhood Chain mainnet. */
export const SUPPORTED_CHAIN_IDS = [31337, 46630, 4663] as const
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number]

const NAMES: Record<SupportedChainId, string> = {
  31337: 'Local test chain',
  46630: 'Robinhood Chain Testnet',
  4663: 'Robinhood Chain',
}

/** Chain id from NEXT_PUBLIC_CHAIN_ID. Never hard-coded (workstreams.md, rule 5). */
export function getChainId(): SupportedChainId {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID
  const id = Number(raw)
  if (!SUPPORTED_CHAIN_IDS.includes(id as SupportedChainId)) {
    throw new Error(`This app is not set up for a network yet (NEXT_PUBLIC_CHAIN_ID is "${raw ?? ''}"; expected 31337, 46630 or 4663).`)
  }
  return id as SupportedChainId
}

/** RPC URL: server-only RPC_URL first (may carry a key), then the public one. */
export function getRpcUrl(chainId: SupportedChainId = getChainId()): string {
  const browser = typeof window !== 'undefined'
  const url = (browser ? undefined : process.env.RPC_URL) ?? process.env.NEXT_PUBLIC_RPC_URL
  if (url) return url
  if (chainId === 31337) {
    // Preview chain (WS-devchain): Anvil runs inside the workspace. The server reaches it directly; the browser goes
    // through the template's /api/devchain/rpc proxy route (or NEXT_PUBLIC_DEVCHAIN_RPC_URL).
    if (browser) {
      // The builder serves the preview under a path prefix (NEXT_PUBLIC_BASE_PATH); a bare /api/... would reach the builder.
      const rpc = process.env.NEXT_PUBLIC_DEVCHAIN_RPC_URL ?? '/api/devchain/rpc'
      return rpc.startsWith('/') ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${rpc}` : rpc
    }
    return process.env.DEVCHAIN_RPC_URL ?? 'http://127.0.0.1:8545'
  }
  throw new Error('This app has no network connection configured (set NEXT_PUBLIC_RPC_URL).')
}

export function getChain(chainId: SupportedChainId = getChainId()): Chain {
  const rpc = getRpcUrl(chainId)
  return defineChain({
    id: chainId,
    name: NAMES[chainId],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
    testnet: chainId !== 4663,
  })
}

let client: PublicClient | undefined
export function getPublicClient(): PublicClient {
  client ??= createPublicClient({ chain: getChain(), transport: http(getRpcUrl()) }) as PublicClient
  return client
}
