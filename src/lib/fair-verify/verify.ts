/** Client-safe: fetches a round from the chain and checks it. Used by the verify page in the visitor's browser. */
import { getAddress, isAddressEqual, zeroHash, type Address, type Hex, type PublicClient } from 'viem'
import { BLOCK_SOURCE, commitRevealAbi, ROUND_STATUS } from './abi'
import type { Outcome } from './config-schema'
import { computeCommitment, deriveResult, outcomeOf, type OutcomeView } from './derive'

export interface RoundData {
  roundId: bigint
  contract: Address
  chainId: number
  status: (typeof ROUND_STATUS)[number]
  commitment: Hex
  commitBlock: bigint
  lockBlock: bigint
  seed: Hex
  lockBlockHash: Hex
  result: Hex
  tag: Hex
  blockSource: (typeof BLOCK_SOURCE)[number]
}

export interface VerifyCheck {
  id: 'commitment' | 'order' | 'blockhash' | 'result'
  /** Plain-English statement of what is checked. */
  label: string
  status: 'pass' | 'fail' | 'skipped'
  detail: string
}

export interface VerifyReport {
  verdict: 'verified' | 'failed' | 'not_revealed' | 'expired' | 'not_found'
  /** One-line plain-English summary for the top of the page. */
  summary: string
  round?: RoundData
  checks: VerifyCheck[]
  recomputedResult?: Hex
  outcome?: OutcomeView
}

type Reader = Pick<PublicClient, 'readContract' | 'getBlock'>

export async function fetchRound(client: Reader, contract: Address, roundId: bigint, chainId: number): Promise<RoundData> {
  const [r, source] = await Promise.all([
    client.readContract({ address: contract, abi: commitRevealAbi, functionName: 'getRound', args: [roundId] }),
    client.readContract({ address: contract, abi: commitRevealAbi, functionName: 'blockSource' }),
  ])
  return {
    roundId,
    contract: getAddress(contract),
    chainId,
    status: ROUND_STATUS[r.status] ?? 'None',
    commitment: r.commitment,
    commitBlock: r.commitBlock,
    lockBlock: r.lockBlock,
    seed: r.seed,
    lockBlockHash: r.lockBlockHash,
    result: r.result,
    tag: r.tag,
    blockSource: BLOCK_SOURCE[source] ?? 'evm',
  }
}

/**
 * Can the lock block's hash be checked against the chain's own block? Yes on a plain EVM chain (and the local fork),
 * and with the 'arbsys' source (real L2 block hashes). Not with 'evm' on Robinhood Chain: there Solidity's blockhash
 * is Arbitrum's pseudo-random value, not a block's hash (see WS-contracts README).
 */
export function blockHashCheckable(r: Pick<RoundData, 'chainId' | 'blockSource'>): boolean {
  return r.blockSource === 'arbsys' || r.chainId === 31337
}

/** Runs every check on a round. `chainBlockHash` is the hash the chain reports for `lockBlock` (null = unavailable). */
export function checkRound(r: RoundData, outcomeConfig: Outcome, chainBlockHash: Hex | null | undefined): VerifyReport {
  if (r.status === 'None') return { verdict: 'not_found', summary: `There is no round ${r.roundId} on this contract.`, checks: [] }
  if (r.status === 'Committed') {
    return {
      verdict: 'not_revealed',
      round: r,
      summary: `Round ${r.roundId} is locked in but not revealed yet. Its commitment is ${r.commitment.slice(0, 10)}…; check back after block ${r.lockBlock}.`,
      checks: [],
    }
  }
  if (r.status === 'Expired') {
    return {
      verdict: 'expired',
      round: r,
      summary: `Round ${r.roundId} was never revealed in time, so it has no result. The app must treat it as cancelled (for example, refund everyone).`,
      checks: [],
    }
  }

  const checks: VerifyCheck[] = []
  const commitmentOk = computeCommitment(r.seed) === r.commitment.toLowerCase()
  checks.push({
    id: 'commitment',
    label: 'The revealed seed matches the commitment published before anyone played',
    status: commitmentOk ? 'pass' : 'fail',
    detail: `keccak256(seed) = ${computeCommitment(r.seed)}; published commitment = ${r.commitment}`,
  })
  checks.push({
    id: 'order',
    label: 'The commitment came before the lock block, so the block hash was unknown when it was made',
    status: r.commitBlock < r.lockBlock ? 'pass' : 'fail',
    detail: `committed at block ${r.commitBlock}, locked at block ${r.lockBlock}`,
  })
  if (!blockHashCheckable(r)) {
    checks.push({
      id: 'blockhash',
      label: "The lock block's hash is the chain's real block hash",
      status: 'skipped',
      detail: "This contract uses Robinhood Chain's built-in blockhash, which isn't a real block hash and can't be checked independently. Fine for low stakes.",
    })
  } else if (!chainBlockHash) {
    checks.push({ id: 'blockhash', label: "The lock block's hash is the chain's real block hash", status: 'skipped', detail: `Couldn't read block ${r.lockBlock} from the network just now.` })
  } else {
    checks.push({
      id: 'blockhash',
      label: "The lock block's hash is the chain's real block hash",
      status: chainBlockHash.toLowerCase() === r.lockBlockHash.toLowerCase() && r.lockBlockHash !== zeroHash ? 'pass' : 'fail',
      detail: `contract used ${r.lockBlockHash}; the network says block ${r.lockBlock} is ${chainBlockHash}`,
    })
  }
  const recomputed = deriveResult({ seed: r.seed, lockBlockHash: r.lockBlockHash, roundId: r.roundId, contract: r.contract, chainId: r.chainId })
  checks.push({
    id: 'result',
    label: 'Recomputing the result in your browser gives the same answer as the contract',
    status: recomputed === r.result.toLowerCase() ? 'pass' : 'fail',
    detail: `keccak256(seed, block hash, round ${r.roundId}, contract, chain ${r.chainId}) = ${recomputed}; contract stored ${r.result}`,
  })

  const failed = checks.some((c) => c.status === 'fail')
  const outcome = outcomeOf(recomputed, outcomeConfig)
  return {
    verdict: failed ? 'failed' : 'verified',
    round: r,
    checks,
    recomputedResult: recomputed,
    outcome,
    summary: failed
      ? `Round ${r.roundId} did NOT verify. Don't trust this result.`
      : `Round ${r.roundId} is fair: the result (${outcome.value}) was fixed by a seed committed in advance and a block hash nobody knew yet.`,
  }
}

/** Fetch + check, reading the lock block from the chain too. */
export async function verifyRoundOnChain(client: Reader, opts: { contract: Address; roundId: bigint; chainId: number; outcome: Outcome }): Promise<VerifyReport> {
  let round: RoundData
  try {
    round = await fetchRound(client, opts.contract, opts.roundId, opts.chainId)
  } catch {
    return { verdict: 'not_found', summary: "We couldn't read this round from the network. Check the round number and try again.", checks: [] }
  }
  let chainBlockHash: Hex | null = null
  if (round.status === 'Revealed' && blockHashCheckable(round)) {
    try {
      chainBlockHash = (await client.getBlock({ blockNumber: round.lockBlock })).hash
    } catch {
      chainBlockHash = null
    }
  }
  return checkRound(round, opts.outcome, chainBlockHash)
}

/** Manual mode: verify values pasted by the visitor (e.g. from another explorer). */
export function verifyManual(input: { seed: Hex; commitment: Hex; lockBlockHash: Hex; result: Hex; roundId: bigint; contract: Address; chainId: number }, outcome: Outcome): VerifyReport {
  return checkRound(
    { ...input, status: 'Revealed', commitBlock: 0n, lockBlock: 1n, tag: zeroHash, blockSource: 'arbsys' },
    outcome,
    input.lockBlockHash,
  )
}

export const sameAddress = (a: Address, b: Address) => isAddressEqual(a, b)
