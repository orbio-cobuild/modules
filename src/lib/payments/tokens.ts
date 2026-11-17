import { formatUnits, getAddress, type Address } from 'viem'
import type { PaymentsConfig, TokenSymbol } from './config-schema'

export const TOKEN_DECIMALS = 6

/**
 * Orbio's live token contracts on Robinhood Chain (chain 4663), from https://www.orbio.so/protocol/agents.md
 * (read 6 Nov 2026). The local preview chain (31337) is a fork of 4663, so the same addresses exist there.
 * Testnet (46630) has no published addresses: set them in config.tokenAddresses["46630"].
 */
export const DEFAULT_TOKEN_ADDRESSES: Partial<Record<number, Record<TokenSymbol, Address>>> = {
  4663: { USDG: '0x5fc5360d0400a0fd4f2af552add042d716f1d168', CREDIT: '0xe33322da1380e61e5ae5dfb21e7f62924c73004c' },
  31337: { USDG: '0x5fc5360d0400a0fd4f2af552add042d716f1d168', CREDIT: '0xe33322da1380e61e5ae5dfb21e7f62924c73004c' },
}

export function tokenAddress(symbol: TokenSymbol, chainId: number, config: Pick<PaymentsConfig, 'tokenAddresses'>): Address {
  const addr = config.tokenAddresses[String(chainId)]?.[symbol] ?? DEFAULT_TOKEN_ADDRESSES[chainId]?.[symbol]
  if (!addr) throw new Error(`Payments in ${symbol} aren't set up on this network yet.`)
  return getAddress(addr)
}

/** "5" or "5.25" for display; never a price claim, just the amount. */
export const formatAmount = (raw: bigint) => formatUnits(raw, TOKEN_DECIMALS)
