import { erc20Abi, erc721Abi, getAddress, parseUnits, type Address, type PublicClient } from 'viem'
import type { Gate, GatingConfig } from './config-schema'
import { sampleBalance, sampleBalancesEnabled } from './sample'

export type GateResult =
  | { status: 'allowed' | 'denied'; gate: Gate; balance: bigint; required: bigint; decimals: number }
  | { status: 'comingSoon'; gate: Gate; message: string }
  | { status: 'error'; gate: Gate; message: string }

/**
 * The "not launched yet" value (D252): the platform writes it as a gate's address on the live site while the
 * project's own token has no contract yet. Such a gate lets nobody in and says "coming after launch"; it
 * switches on by itself once the real address is filled in at the next go-live.
 */
export const NOT_LAUNCHED_ADDRESS = '0x0000000000000000000000000000000000000000'

/** False while the gate's token on this network is the "not launched yet" value. */
export function gateLaunched(gate: Gate, chainId: number): boolean {
  const a = gate.addressByChain[String(chainId)] ?? gate.address
  return !a || BigInt(a) !== 0n
}

export function comingSoonText(gate: Gate): string {
  return `Coming after launch: ${gate.name} opens once ${gate.symbol === 'tokens' ? 'the token' : gate.symbol} is live.`
}

export interface CheckDeps {
  publicClient: Pick<PublicClient, 'readContract'>
  chainId: number
  cacheSeconds: number
  now?: () => number
}

export function gateAddress(gate: Gate, chainId: number): Address {
  const a = gate.addressByChain[String(chainId)] ?? gate.address
  if (!a) throw new Error(`The "${gate.name}" gate isn't set up on this network yet.`)
  return getAddress(a)
}

const balances = new Map<string, { at: number; balance: bigint }>()
const decimalsCache = new Map<string, number>()

export function clearGateCache() {
  balances.clear()
  decimalsCache.clear()
}

async function decimalsOf(gate: Gate, token: Address, deps: CheckDeps): Promise<number> {
  if (gate.standard === 'erc721') return 0
  if (gate.decimals !== undefined) return gate.decimals
  const key = `${deps.chainId}:${token}`
  const hit = decimalsCache.get(key)
  if (hit !== undefined) return hit
  const d = await deps.publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' })
  decimalsCache.set(key, d)
  return d
}

/** Required amount in raw units: ERC-20 "100" with 18 decimals → 100e18; ERC-721 "2" → 2. */
export function requiredRaw(gate: Gate, decimals: number): bigint {
  return gate.standard === 'erc721' ? BigInt(gate.minBalance) : parseUnits(gate.minBalance, decimals)
}

/**
 * Server-side balance check. Fails closed: if the chain can't be read, the result is 'error', never 'allowed'.
 * `fresh: true` skips the cache (e.g. right after the person bought tokens).
 */
export async function checkGate(gate: Gate, wallet: Address, deps: CheckDeps, opts: { fresh?: boolean } = {}): Promise<GateResult> {
  if (!gateLaunched(gate, deps.chainId)) return { status: 'comingSoon', gate, message: comingSoonText(gate) }
  try {
    const token = gateAddress(gate, deps.chainId)
    const decimals = await decimalsOf(gate, token, deps)
    const required = requiredRaw(gate, decimals)
    if (sampleBalancesEnabled()) {
      const balance = sampleBalance(wallet, required)
      return { status: balance >= required ? 'allowed' : 'denied', gate, balance, required, decimals }
    }
    const now = deps.now?.() ?? Date.now()
    const key = `${deps.chainId}:${token}:${getAddress(wallet)}`
    const hit = balances.get(key)
    let balance: bigint
    if (!opts.fresh && hit && now - hit.at < deps.cacheSeconds * 1000) {
      balance = hit.balance
    } else {
      balance = await deps.publicClient.readContract({
        address: token,
        abi: gate.standard === 'erc721' ? erc721Abi : erc20Abi,
        functionName: 'balanceOf',
        args: [getAddress(wallet)],
      })
      balances.set(key, { at: now, balance })
    }
    return { status: balance >= required ? 'allowed' : 'denied', gate, balance, required, decimals }
  } catch (e) {
    console.warn(`[gating] could not check gate ${gate.id}:`, e instanceof Error ? e.message : e)
    return { status: 'error', gate, message: "We couldn't check your tokens right now. Please try again in a moment." }
  }
}

export function deniedText(gate: Gate): string {
  if (gate.deniedMessage) return gate.deniedMessage
  return gate.standard === 'erc721'
    ? `This is for holders of at least ${gate.minBalance} ${gate.symbol}.`
    : `This is for people holding at least ${gate.minBalance} ${gate.symbol}.`
}

export type { GatingConfig }
