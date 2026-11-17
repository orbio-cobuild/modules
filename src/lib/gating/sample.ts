import { getAddress, type Address } from 'viem'

/**
 * Sample balances for previews (UX #11), used only when GATING_SAMPLE_BALANCES=1 (server env, preview builds).
 * Useful before the project's own token exists. The devchain test wallets (Anvil dev accounts 1–3) get:
 *   Alice: twice the minimum (allowed) · Bob: exactly the minimum (allowed) · Carol: nothing (denied).
 * The checker fails a production build with it set.
 */
export const SAMPLE_WALLETS = {
  alice: getAddress('0x70997970c51812dc3a010c7d01b50e0d17dc79c8'),
  bob: getAddress('0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc'),
  carol: getAddress('0x90f79bf6eb2c4f870365e785982e1f101e93b906'),
}

export const sampleBalancesEnabled = () => process.env.GATING_SAMPLE_BALANCES === '1'

export function sampleBalance(wallet: Address, required: bigint): bigint {
  const w = getAddress(wallet)
  if (w === SAMPLE_WALLETS.alice) return required * 2n
  if (w === SAMPLE_WALLETS.bob) return required
  return 0n
}
