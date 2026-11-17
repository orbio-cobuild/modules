// ui-kit crypto helpers (D225): addresses, chains, token amounts, explorer links, sparklines.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CopyButton } from './interactive'
import { Pill } from './primitives'

export const CHAIN_NAMES: Record<number, string> = {
  4663: 'Robinhood Chain',
  46630: 'Robinhood Chain testnet',
  31337: 'Local test chain',
  1: 'Ethereum',
  8453: 'Base',
}

export function shortAddress(address: string, chars = 4): string {
  return address.length > 2 * chars + 4 ? `${address.slice(0, chars + 2)}…${address.slice(-chars)}` : address
}

/** A shortened address with a copy button and an optional explorer link. */
export function Address({ address, explorerUrl, copy = true, className }: { address: string; explorerUrl?: string; copy?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono text-sm', className)} title={address}>
      {explorerUrl ? (
        <a href={explorerUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
          {shortAddress(address)}
        </a>
      ) : (
        shortAddress(address)
      )}
      {copy && <CopyButton value={address} />}
    </span>
  )
}

export function ChainBadge({ chainId, className }: { chainId: number; className?: string }) {
  const test = chainId === 31337 || chainId === 46630
  return (
    <Pill tone={test ? 'warning' : 'muted'} className={className}>
      <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', test ? 'bg-amber-500' : 'bg-emerald-500')} />
      {CHAIN_NAMES[chainId] ?? `Chain ${chainId}`}
    </Pill>
  )
}

/** Formats an on-chain integer amount (bigint or decimal string) with its decimals, e.g. 1234.5 USDG. */
export function formatTokenAmount(raw: bigint | string, decimals: number, maxFraction = 4): string {
  const v = typeof raw === 'bigint' ? raw : BigInt(raw)
  const neg = v < 0n
  const abs = neg ? -v : v
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = (abs % base).toString().padStart(decimals, '0').slice(0, maxFraction).replace(/0+$/, '')
  return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${frac ? `.${frac}` : ''}`
}

export function TokenAmount({ value, decimals, symbol, className }: { value: bigint | string; decimals: number; symbol?: string; className?: string }) {
  return (
    <span className={cn('tabular-nums', className)}>
      {formatTokenAmount(value, decimals)}
      {symbol && <span className="ml-1 text-[var(--muted-fg)]">{symbol}</span>}
    </span>
  )
}

/** A tiny line chart (SVG, no library) for activity, runs or balances over time. Not for price hype. */
export function Sparkline({ points, width = 120, height = 36, label, className }: { points: number[]; width?: number; height?: number; label: string; className?: string }) {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const xy = points.map((p, i) => [(i / (points.length - 1)) * width, height - 2 - ((p - min) / span) * (height - 4)] as const)
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className}>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill="color-mix(in srgb, var(--primary) 16%, transparent)" />
      <path d={line} fill="none" stroke="var(--primary)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** A labelled row for wallets, holders or leaderboards. */
export function WalletRow({ rank, address, explorerUrl, value, extra }: { rank?: number; address: string; explorerUrl?: string; value: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-3">
      {rank !== undefined && <span className="w-6 text-right font-mono text-sm text-[var(--muted-fg)]">{rank}</span>}
      <Address address={address} explorerUrl={explorerUrl} copy={false} className="flex-1" />
      {extra}
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}
