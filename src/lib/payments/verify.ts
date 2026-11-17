import { decodeEventLog, erc20Abi, isAddressEqual, TransactionReceiptNotFoundError, type Address, type Hex, type PublicClient } from 'viem'
import type { PaymentIntent } from './intent'
import type { PaymentRecord, PaymentStore } from './store'
import { formatAmount } from './tokens'

export type VerifyResult =
  | { status: 'confirmed'; payment: PaymentRecord; created: boolean }
  | { status: 'pending'; reason: 'not_found' | 'confirmations'; confirmations?: number; needed?: number; message: string }
  | { status: 'rejected'; code: RejectCode; message: string }

export type RejectCode =
  | 'wrong_chain'
  | 'tx_failed'
  | 'no_matching_transfer'
  | 'wrong_payer'
  | 'outside_window'
  | 'intent_used'
  | 'transfer_used'

export interface VerifyDeps {
  publicClient: Pick<PublicClient, 'getTransactionReceipt' | 'getBlockNumber' | 'getBlock'>
  store: PaymentStore
  chainId: number
  minConfirmations: number
}

/** Allowance for clock differences between our server and the chain, in seconds. */
const SKEW = 300

/**
 * Verifies a payment from the chain itself, never from the client (module-contract.md, rule 3):
 * the receipt succeeded, it has enough confirmations, it contains an ERC-20 Transfer log from the intent's token
 * contract to the intent's recipient for at least the intent's amount, from the intent's payer (if any),
 * in a block inside the intent's time window. Then it records it, idempotently.
 */
export async function verifyPayment(intent: PaymentIntent, txHash: Hex, deps: VerifyDeps): Promise<VerifyResult> {
  if (intent.chainId !== deps.chainId) {
    return { status: 'rejected', code: 'wrong_chain', message: 'This checkout was made for a different network.' }
  }

  // Already recorded for this intent? Answer from the record (idempotent retries, page reloads).
  const existing = await deps.store.getByIntent(intent.id)
  if (existing) {
    if (existing.txHash.toLowerCase() === txHash.toLowerCase()) return { status: 'confirmed', payment: existing, created: false }
    return { status: 'rejected', code: 'intent_used', message: 'This checkout was already paid with a different transaction.' }
  }

  let receipt
  try {
    receipt = await deps.publicClient.getTransactionReceipt({ hash: txHash })
  } catch (e) {
    if (e instanceof TransactionReceiptNotFoundError || (e instanceof Error && /not found|could not be found/i.test(e.message))) {
      return { status: 'pending', reason: 'not_found', message: "We're waiting for your payment to reach the network." }
    }
    throw e
  }
  if (receipt.status !== 'success') {
    return { status: 'rejected', code: 'tx_failed', message: 'That transaction failed on the network, so no payment was made.' }
  }

  // cacheTime 0: viem caches the block number for a few seconds by default, which would undercount confirmations.
  const head = await deps.publicClient.getBlockNumber({ cacheTime: 0 })
  const confirmations = Number(head - receipt.blockNumber + 1n)
  if (confirmations < deps.minConfirmations) {
    return {
      status: 'pending',
      reason: 'confirmations',
      confirmations,
      needed: deps.minConfirmations,
      message: `Your payment is on the network. Waiting for confirmation (${confirmations} of ${deps.minConfirmations}).`,
    }
  }

  const candidates: { logIndex: number; from: Address; value: bigint }[] = []
  let wrongPayer = false
  for (const log of receipt.logs) {
    if (!isAddressEqual(log.address, intent.tokenAddress)) continue
    let decoded
    try {
      decoded = decodeEventLog({ abi: erc20Abi, eventName: 'Transfer', data: log.data, topics: log.topics })
    } catch {
      continue
    }
    const { from, to, value } = decoded.args
    if (!isAddressEqual(to, intent.recipient) || value < intent.amountRaw) continue
    if (intent.payer && !isAddressEqual(from, intent.payer)) {
      wrongPayer = true
      continue
    }
    candidates.push({ logIndex: log.logIndex, from, value })
  }
  if (!candidates.length) {
    return wrongPayer
      ? { status: 'rejected', code: 'wrong_payer', message: 'That payment came from a different wallet than the one you signed in with.' }
      : {
          status: 'rejected',
          code: 'no_matching_transfer',
          message: `We couldn't find a payment of ${formatAmount(intent.amountRaw)} ${intent.token} to this project in that transaction.`,
        }
  }

  const block = await deps.publicClient.getBlock({ blockNumber: receipt.blockNumber })
  const ts = Number(block.timestamp)
  if (ts < intent.issuedAt - SKEW || ts > intent.payBy + SKEW) {
    return {
      status: 'rejected',
      code: 'outside_window',
      message: 'That payment was sent outside the checkout window. If you were charged, contact the project with the transaction link.',
    }
  }

  // Try each matching transfer; a transfer already used by another checkout can't pay for this one.
  for (const c of candidates) {
    const res = await deps.store.record({
      intentId: intent.id,
      kind: intent.kind,
      productId: intent.productId,
      chainId: intent.chainId,
      txHash: receipt.transactionHash,
      logIndex: c.logIndex,
      blockNumber: receipt.blockNumber,
      token: intent.token,
      tokenAddress: intent.tokenAddress,
      payer: c.from,
      recipient: intent.recipient,
      amountRaw: c.value,
      userAddress: intent.payer,
    })
    if (res.outcome === 'created' || res.outcome === 'existing') return { status: 'confirmed', payment: res.payment, created: res.outcome === 'created' }
    if (res.outcome === 'intent_used') {
      return { status: 'rejected', code: 'intent_used', message: 'This checkout was already paid with a different transaction.' }
    }
  }
  return { status: 'rejected', code: 'transfer_used', message: 'That payment has already been used for another purchase.' }
}
