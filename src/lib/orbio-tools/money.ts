/** micro-USD (bigint) ↔ CREDIT decimal strings. 1 CREDIT = 1,000,000 µUSD; CREDIT has 6 decimals. */
export function microToCredit(micro: bigint): string {
  const neg = micro < 0n
  const abs = neg ? -micro : micro
  const whole = abs / 1_000_000n
  const frac = (abs % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`
}

export function creditToMicro(credit: string): bigint {
  const m = /^(-)?(\d+)(?:\.(\d{1,6})\d*)?$/.exec(credit.trim())
  if (!m) throw new Error(`Not a CREDIT amount: ${credit}`)
  const micro = BigInt(m[2]!) * 1_000_000n + BigInt((m[3] ?? '').padEnd(6, '0') || '0')
  return m[1] ? -micro : micro
}
