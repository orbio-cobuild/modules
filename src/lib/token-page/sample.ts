/**
 * A sample agent for component examples and tests. The token page itself never shows it (D255):
 * before a launch the page says "coming after launch" in the preview and on the live site alike,
 * because illustrative price and market-cap figures read as real ones. Pass it explicitly, with
 * `sample` on TreasuryPanel so it is labelled, if a design example needs filled-in numbers.
 */
import type { LaunchpadAgent } from './launchpad'

export const SAMPLE_AGENT: LaunchpadAgent = {
  kind: 'agent',
  agentId: '0',
  token: '0x0000000000000000000000000000000000000001',
  name: 'Sample Token',
  symbol: 'SAMPLE',
  logo: null,
  description: 'Sample data so you can see how this page looks after launch.',
  decimals: 18,
  totalSupply: '1000000000000000000000000000',
  owner: null,
  agentWallet: null,
  receiver: null,
  feeBps: 500,
  launchedAt: '1790797003',
  launchTx: null,
  launchBlock: null,
  orbioMicroUsd: '28558',
  price: { source: 'pool', graduated: true, priceMicroUsd: '9', marketCapMicroUsd: '9427726409' },
  curve: { graduated: true, progressBps: 10000 },
  stake: {
    orbioWei: '277981981006242171916',
    claimedFeesWei: '528713527699349321023488',
    protocolFeeWei: '31535645197901670383616',
    stakedWei: '264356763849674660511744',
    withdrawnWei: '264078781868668425863168',
  },
  credit: { owedAtoms: '4240', claimedAtoms: '46029887', activatedAtoms: '46029887', mintedAtoms: '15259143709' },
  converted: { orbioWei: '232821118651772994322432', usdgAtoms: '5121128144', pendingOrbioWei: '0' },
  cliff: { unlocksAt: '1790797003', locked: false },
  links: {},
  socials: {},
}

export const isPreviewBuild = () => process.env.NEXT_PUBLIC_PREVIEW === 'true'
