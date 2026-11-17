/** Display helpers. Amounts stay bigint until the moment they're shown. */
import { formatUnits, type Address } from 'viem'
import { chainFor, type SupportedChainId } from './chains'

/** "1,234.56" from a raw integer amount. Rounds down to `maxDecimals`. */
export function formatAmount(raw: bigint, decimals: number, maxDecimals = 4): string {
  const s = formatUnits(raw, decimals)
  const [whole, frac = ''] = s.split('.')
  const w = BigInt(whole!.replace('-', '')).toLocaleString('en-US')
  const f = frac.slice(0, maxDecimals).replace(/0+$/, '')
  return `${s.startsWith('-') ? '-' : ''}${w}${f ? `.${f}` : ''}`
}

export function shortAddress(a: string): string {
  return /^0x[0-9a-fA-F]{40}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

export function explorerUrl(chainId: SupportedChainId, kind: 'address' | 'tx' | 'token', value: string): string | null {
  const base = chainFor(chainId).blockExplorers?.default.url
  return base ? `${base}/${kind}/${value}` : null
}

/**
 * The "not launched yet" value (D252): on the live site the platform fills the project's own token address
 * with it until the token has a contract. Nothing can be read from it.
 */
export const NOT_LAUNCHED_ADDRESS = '0x0000000000000000000000000000000000000000'

/** False for the "not launched yet" value: show "Coming after launch" instead of reading the chain. */
export function isLaunchedToken(a: unknown): a is Address {
  return isAddress(a) && BigInt(a) !== 0n
}

export function isAddress(a: unknown): a is Address {
  return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a)
}
