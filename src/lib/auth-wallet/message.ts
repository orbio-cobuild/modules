import type { Address } from 'viem'
import { createSiweMessage } from 'viem/siwe'

/** Builds the EIP-4361 message the wallet shows. Runs in the browser; uses the page's own host as the domain. */
export function buildSignInMessage(opts: {
  address: Address
  chainId: number
  nonce: string
  statement: string
  host: string
  origin: string
  now?: Date
  ttlSeconds?: number
}): string {
  const now = opts.now ?? new Date()
  return createSiweMessage({
    domain: opts.host,
    address: opts.address,
    // EIP-4361 statements must be one line.
    statement: opts.statement.replace(/[\r\n]+/g, ' ').trim(),
    uri: opts.origin,
    version: '1',
    chainId: opts.chainId,
    nonce: opts.nonce,
    issuedAt: now,
    expirationTime: new Date(now.getTime() + (opts.ttlSeconds ?? 600) * 1000),
  })
}
