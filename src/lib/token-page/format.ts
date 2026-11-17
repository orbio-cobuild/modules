/** Formatting for the token page. Inputs are decimal strings or bigint; null/undefined always shows a dash. */
export const DASH = '—'

export function toBig(v: string | number | bigint | null | undefined): bigint | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'bigint') return v
  if (typeof v === 'number') return Number.isSafeInteger(v) ? BigInt(v) : null
  return /^-?\d+$/.test(v) ? BigInt(v) : null
}

function groupWhole(n: bigint): string {
  return (n < 0n ? -n : n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Integer amount with `decimals` → "12,345.67" (rounded down to maxDecimals). */
export function formatUnitsPlain(v: string | bigint | null | undefined, decimals: number, maxDecimals = 2): string {
  const n = toBig(v)
  if (n === null) return DASH
  const neg = n < 0n
  const abs = neg ? -n : n
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = (abs % base).toString().padStart(decimals, '0').slice(0, maxDecimals).replace(/0+$/, '')
  return `${neg ? '-' : ''}${groupWhole(whole)}${frac ? `.${frac}` : ''}`
}

/** 18-decimal token amounts (ORBIO, the project token). */
export const formatWei = (v: string | bigint | null | undefined, maxDecimals = 2) => formatUnitsPlain(v, 18, maxDecimals)
/** 6-decimal amounts (CREDIT, USDG). */
export const formatAtoms = (v: string | bigint | null | undefined, maxDecimals = 2) => formatUnitsPlain(v, 6, maxDecimals)

/** micro-USD → "$1,234.56"; tiny non-zero values show "< $0.01". */
export function formatUsdMicro(v: string | bigint | null | undefined): string {
  const n = toBig(v)
  if (n === null) return DASH
  if (n > 0n && n < 10_000n) return '< $0.01'
  return `$${formatUnitsPlain(n, 6, 2)}`
}

/** A token price in micro-USD can be far below a cent; show significant digits instead of "$0.00". */
export function formatPriceMicro(v: string | bigint | null | undefined): string {
  const n = toBig(v)
  if (n === null) return DASH
  if (n >= 10_000n) return formatUsdMicro(n)
  if (n === 0n) return '$0'
  return `$${formatUnitsPlain(n, 6, 6)}`
}

/** Values an 18-decimal ORBIO amount in micro-USD, given ORBIO's price in micro-USD. */
export function orbioWeiToMicroUsd(wei: string | bigint | null | undefined, orbioMicroUsd: string | bigint | null | undefined): bigint | null {
  const w = toBig(wei)
  const p = toBig(orbioMicroUsd)
  if (w === null || p === null) return null
  return (w * p) / 10n ** 18n
}

export function formatDate(unixSeconds: string | bigint | null | undefined): string {
  const s = toBig(unixSeconds)
  if (s === null || s <= 0n) return DASH
  return new Date(Number(s) * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function formatBps(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return DASH
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`
}

export function shortAddress(a: string | null | undefined): string {
  if (!a) return DASH
  return /^0x[0-9a-fA-F]{40}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}
