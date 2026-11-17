/** Turns a launchpad agent into the rows the treasury panel shows. Pure, so it's easy to test. */
import type { LaunchpadAgent } from './launchpad'
import { DASH, formatAtoms, formatBps, formatDate, formatUsdMicro, formatWei, orbioWeiToMicroUsd, toBig } from './format'

export interface TreasuryRow {
  id: string
  label: string
  value: string
  /** Approximate dollar value, when it can be worked out. */
  usd?: string
  hint?: string
}

export interface TreasurySummary {
  rows: TreasuryRow[]
  cliff: { locked: boolean | null; unlocks: string }
  links: Array<{ label: string; href: string }>
}

const LINK_LABELS: Record<string, string> = { token: 'Token on explorer', owner: 'Owner wallet', launchTx: 'Launch transaction' }
const SOCIAL_LABELS: Record<string, string> = { website: 'Website', twitter: 'X', telegram: 'Telegram', discord: 'Discord', farcaster: 'Farcaster' }

function orbioRow(id: string, label: string, wei: string | null | undefined, orbioMicroUsd: string | null | undefined, hint?: string): TreasuryRow {
  const usd = orbioWeiToMicroUsd(wei, orbioMicroUsd)
  return { id, label, value: wei == null ? DASH : `${formatWei(wei)} ORBIO`, ...(usd !== null ? { usd: `≈ ${formatUsdMicro(usd)}` } : {}), ...(hint ? { hint } : {}) }
}

function sixRow(id: string, label: string, atoms: string | null | undefined, unit: 'CREDIT' | 'USDG', hint?: string): TreasuryRow {
  return { id, label, value: atoms == null ? DASH : `${formatAtoms(atoms)} ${unit}`, ...(hint ? { hint } : {}) }
}

export function treasurySummary(agent: LaunchpadAgent): TreasurySummary {
  const p = agent.orbioMicroUsd
  const rows: TreasuryRow[] = [
    orbioRow('feesClaimed', 'Creator fees collected', agent.stake?.claimedFeesWei, p, 'Trading fees harvested into the agent vault so far.'),
    orbioRow('stakedNow', 'Staked for the agent now', agent.stake?.orbioWei, p),
    orbioRow('stakedTotal', 'Staked in total', agent.stake?.stakedWei, p),
    orbioRow('withdrawn', 'Withdrawn by the owner', agent.stake?.withdrawnWei, p),
    orbioRow('protocolFee', 'Protocol share', agent.stake?.protocolFeeWei, p),
    sixRow('creditMinted', 'CREDIT earned', agent.credit?.mintedAtoms, 'CREDIT', 'CREDIT pays for the agent’s AI and tools (1 CREDIT = $1 of usage).'),
    sixRow('creditClaimed', 'CREDIT claimed', agent.credit?.claimedAtoms, 'CREDIT'),
    sixRow('creditOwed', 'CREDIT waiting to be claimed', agent.credit?.owedAtoms, 'CREDIT'),
    sixRow('usdgConverted', 'Converted to USDG', agent.converted?.usdgAtoms, 'USDG', 'Fees converted into the agent’s gateway balance.'),
    { id: 'creatorFee', label: 'Creator fee on trades', value: formatBps(agent.feeBps) },
  ]

  const links: Array<{ label: string; href: string }> = []
  for (const [k, v] of Object.entries(agent.links ?? {})) if (v && /^https:\/\//.test(v)) links.push({ label: LINK_LABELS[k] ?? k, href: v })
  for (const [k, v] of Object.entries(agent.socials ?? {})) if (v && /^https:\/\//.test(v)) links.push({ label: SOCIAL_LABELS[k] ?? k, href: v })

  return { rows, cliff: { locked: agent.cliff?.locked ?? null, unlocks: formatDate(agent.cliff?.unlocksAt) }, links }
}

/** Market facts (shown as data, never as a forecast). */
export function marketFacts(agent: LaunchpadAgent) {
  const progress = agent.curve?.progressBps
  return {
    price: agent.price?.priceMicroUsd ?? null,
    marketCap: agent.price?.marketCapMicroUsd ?? null,
    totalSupply: toBig(agent.totalSupply),
    decimals: agent.decimals ?? 18,
    stage: agent.curve?.graduated === true || agent.price?.graduated === true ? 'Trading on the open pool' : progress != null ? `Bonding curve ${formatBps(progress)} filled` : DASH,
    launched: formatDate(agent.launchedAt),
  }
}
