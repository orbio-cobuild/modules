import { parseAbi } from 'viem'

/** The parts of WS-contracts' CofounderCommitReveal ABI that fair-verify reads. */
export const commitRevealAbi = parseAbi([
  'struct Round { bytes32 commitment; uint64 commitBlock; uint64 lockBlock; uint8 status; bytes32 seed; bytes32 lockBlockHash; bytes32 result; bytes32 tag; }',
  'function getRound(uint256 id) view returns (Round)',
  'function blockSource() view returns (uint8)',
  'function isExpired(uint256 id) view returns (bool)',
  'event RoundCommitted(uint256 indexed id, bytes32 indexed tag, bytes32 commitment, uint64 lockBlock)',
  'event RoundRevealed(uint256 indexed id, bytes32 seed, bytes32 lockBlockHash, bytes32 result)',
  'event RoundExpired(uint256 indexed id)',
])

export const ROUND_STATUS = ['None', 'Committed', 'Revealed', 'Expired'] as const
export const BLOCK_SOURCE = ['evm', 'arbsys'] as const
