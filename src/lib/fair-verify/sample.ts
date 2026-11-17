/**
 * Sample rounds for previews (UX #11), shown when NEXT_PUBLIC_FAIR_VERIFY_SAMPLE=1 (preview builds only), before the
 * project's contract has any rounds. Rounds 1–3 verify; round 4 has a tampered result, to show what a failed check
 * looks like; round 5 is committed but not revealed. Values are computed with the real formula for the current chain.
 */
import { keccak256, stringToHex, zeroHash, type Address } from 'viem'
import { computeCommitment, deriveResult } from './derive'
import type { RoundData } from './verify'

export const SAMPLE_CONTRACT: Address = '0x5a3b1e0000000000000000000000000000000001'
export const sampleRoundsEnabled = () => process.env.NEXT_PUBLIC_FAIR_VERIFY_SAMPLE === '1'

export function sampleRound(roundId: bigint, chainId: number): RoundData | null {
  if (roundId < 1n || roundId > 5n) return null
  const seed = keccak256(stringToHex(`cofounder sample seed ${roundId}`))
  const lockBlockHash = keccak256(stringToHex(`cofounder sample block ${roundId}`))
  const commitBlock = 1000n + roundId * 10n
  const base: RoundData = {
    roundId,
    contract: SAMPLE_CONTRACT,
    chainId,
    status: 'Revealed',
    commitment: computeCommitment(seed),
    commitBlock,
    lockBlock: commitBlock + 2n,
    seed,
    lockBlockHash,
    result: deriveResult({ seed, lockBlockHash, roundId, contract: SAMPLE_CONTRACT, chainId }),
    tag: zeroHash,
    blockSource: 'arbsys',
  }
  if (roundId === 4n) return { ...base, result: keccak256(stringToHex('tampered')) }
  if (roundId === 5n) return { ...base, status: 'Committed', seed: zeroHash, lockBlockHash: zeroHash, result: zeroHash }
  return base
}
