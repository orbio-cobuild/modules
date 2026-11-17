/**
 * The derivation used by WS-contracts' CofounderCommitReveal template (packages/contracts, README "CommitReveal"):
 *
 *   commitment = keccak256(abi.encodePacked(bytes32 seed))
 *   result     = keccak256(abi.encode(bytes32 seed, bytes32 lockBlockHash, uint256 roundId, address contract, uint256 chainId))
 *   inRange(n) = uint256(result) % n
 *
 * Pure and client-safe, so the verify page recomputes everything in the visitor's browser.
 */
import { encodeAbiParameters, encodePacked, keccak256, type Address, type Hex } from 'viem'
import type { Outcome } from './config-schema'

export function computeCommitment(seed: Hex): Hex {
  return keccak256(encodePacked(['bytes32'], [seed]))
}

export function deriveResult(a: { seed: Hex; lockBlockHash: Hex; roundId: bigint; contract: Address; chainId: number }): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
      [a.seed, a.lockBlockHash, a.roundId, a.contract, BigInt(a.chainId)],
    ),
  )
}

/** Integer in [0, n), matching the contract's randomInRange. Modulo bias is below n / 2^256. */
export function randomInRange(result: Hex, n: bigint): bigint {
  if (n <= 0n) throw new Error('n must be greater than 0')
  return BigInt(result) % n
}

export interface OutcomeView {
  /** e.g. "Heads", "4", "alice.eth" */
  value: string
  /** e.g. "Coin flip", "Number from 1 to 6" */
  label: string
  /** The plain-English formula, shown on the page. */
  formula: string
}

export function outcomeOf(result: Hex, outcome: Outcome): OutcomeView {
  switch (outcome.kind) {
    case 'coinflip': {
      const i = Number(randomInRange(result, 2n))
      return { value: outcome.labels[i]!, label: 'Coin flip', formula: `result mod 2 = ${i} → ${outcome.labels[i]} (0 = ${outcome.labels[0]}, 1 = ${outcome.labels[1]})` }
    }
    case 'range': {
      const span = BigInt(outcome.max - outcome.min + 1)
      const r = randomInRange(result, span)
      return { value: String(BigInt(outcome.min) + r), label: `${outcome.label} from ${outcome.min} to ${outcome.max}`, formula: `${outcome.min} + (result mod ${span}) = ${BigInt(outcome.min) + r}` }
    }
    case 'pick': {
      const i = randomInRange(result, BigInt(outcome.options.length))
      return { value: outcome.options[Number(i)]!, label: outcome.label, formula: `result mod ${outcome.options.length} = ${i} → entry #${Number(i) + 1} in the list` }
    }
    case 'raw':
      return { value: result, label: 'Result', formula: 'The 256-bit result itself' }
  }
}
