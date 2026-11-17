/** Micro-USD (bigint) <-> CREDIT decimal strings. 1 CREDIT = $1 = 1,000,000 micro. Exact, no floats. */
const MICRO = 1_000_000n

export function microToCredit(micro: bigint): string {
  if (micro < 0n) throw new Error('A cost cannot be negative.')
  const whole = micro / MICRO
  const frac = (micro % MICRO).toString().padStart(6, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}

export function creditToMicro(credit: string): bigint {
  const text = credit.trim()
  if (!/^\d+(\.\d{1,6})?$/.test(text)) throw new Error(`"${credit}" is not an amount of CREDIT.`)
  const [whole = '0', frac = ''] = text.split('.')
  return BigInt(whole) * MICRO + BigInt((frac + '000000').slice(0, 6))
}

/** "$0.0123" style, for people. 4 decimals below $1, 2 decimals from $1 up. Rounds half up. */
export function formatUsd(micro: bigint): string {
  const negative = micro < 0n
  const v = negative ? -micro : micro
  const digits = v >= MICRO ? 2 : 4
  const scale = 10n ** BigInt(6 - digits)
  const rounded = (v + scale / 2n) / scale
  const unit = 10n ** BigInt(digits)
  const whole = rounded / unit
  const frac = (rounded % unit).toString().padStart(digits, '0')
  return `${negative ? '-' : ''}$${whole.toLocaleString('en-US')}.${frac}`
}

export const toMicro = (value: string | number | bigint | null | undefined): bigint =>
  value === null || value === undefined ? 0n : typeof value === 'bigint' ? value : BigInt(value)
