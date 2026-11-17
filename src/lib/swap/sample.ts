/**
 * Sample quotes for previews (UX #11) when the preview chain has no Uniswap pools for the project's tokens
 * (e.g. its own token before launch). Enabled only by SWAP_SAMPLE_QUOTES=1 (server env, previews). Sample quotes can't
 * be executed: the widget shows them labelled "sample" with the swap button off. The checker fails production with it on.
 * Rates are placeholders for layout, not prices.
 */
export const SAMPLE_RATES: Record<string, number> = { ETH: 3000, USDG: 1, CREDIT: 0.9, ORBIO: 0.05 }

export const sampleQuotesEnabled = () => process.env.SWAP_SAMPLE_QUOTES === '1'

export function sampleAmountOut(from: string, to: string, amountIn: number): number | null {
  const a = SAMPLE_RATES[from.toUpperCase()] ?? 1
  const b = SAMPLE_RATES[to.toUpperCase()] ?? 1
  return Number.isFinite(amountIn) ? (amountIn * a) / b : null
}
