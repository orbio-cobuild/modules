/**
 * The three chains a generated app can run on. Which one is chosen by NEXT_PUBLIC_CHAIN_ID:
 * 31337 local Anvil fork (builder preview), 46630 Robinhood Chain testnet, 4663 Robinhood Chain mainnet.
 */
import { defineChain, type Chain } from 'viem'

export const SUPPORTED_CHAIN_IDS = [31337, 46630, 4663] as const
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number]

/** Public RPC defaults. Override per project with config.rpcUrls or the RPC env vars. */
export const DEFAULT_RPC_URLS: Record<SupportedChainId, string> = {
  31337: 'http://127.0.0.1:8545',
  46630: 'https://rpc.testnet.chain.robinhood.com/rpc',
  4663: 'https://rpc.mainnet.chain.robinhood.com',
}

const eth = { name: 'Ether', symbol: 'ETH', decimals: 18 } as const

export function chainFor(id: SupportedChainId, rpcUrl: string = DEFAULT_RPC_URLS[id]): Chain {
  switch (id) {
    case 31337:
      return defineChain({ id, name: 'Local test chain', nativeCurrency: eth, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true })
    case 46630:
      return defineChain({
        id,
        name: 'Robinhood Chain Testnet',
        nativeCurrency: { ...eth, name: 'Sepolia Ether' },
        rpcUrls: { default: { http: [rpcUrl] } },
        blockExplorers: { default: { name: 'Blockscout', url: 'https://explorer.testnet.chain.robinhood.com' } },
        testnet: true,
      })
    case 4663:
      return defineChain({
        id,
        name: 'Robinhood Chain',
        nativeCurrency: eth,
        rpcUrls: { default: { http: [rpcUrl] } },
        blockExplorers: { default: { name: 'Robinhood Chain explorer', url: 'https://robin.etherscan.io' } },
      })
  }
}

export function isSupportedChainId(id: number): id is SupportedChainId {
  return (SUPPORTED_CHAIN_IDS as readonly number[]).includes(id)
}

/** Reads NEXT_PUBLIC_CHAIN_ID. Literal reference so Next.js inlines it in client code. */
export function getChainId(raw: string | undefined = process.env.NEXT_PUBLIC_CHAIN_ID): SupportedChainId {
  const id = Number(raw)
  if (!raw || !isSupportedChainId(id)) {
    throw new Error('The app is not set up for a blockchain network yet. Ask the builder to choose one.')
  }
  return id
}

/** Orbio chain.read network names. The local Anvil chain has none (reads go to the local RPC). */
export const ORBIO_NETWORK: Partial<Record<SupportedChainId, string>> = {
  46630: 'robinhood-testnet',
  4663: 'robinhood',
}
