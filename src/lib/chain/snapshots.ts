/**
 * Cached chain reads (needs the db module). refreshSnapshots() reads every watched value and upserts it;
 * readSnapshots() is what pages use.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Address } from 'viem'
import { isLaunchedToken } from './format'
import type { ChainReader } from './reader'

export type Watch =
  | { kind: 'block_number'; key: string }
  | { kind: 'native_balance'; key: string; address: string }
  | { kind: 'erc20_balance'; key: string; token: string; address: string }
  | { kind: 'erc20_supply'; key: string; token: string }
  | { kind: 'erc20_metadata'; key: string; token: string }

export interface SnapshotRow {
  chain_id: number
  key: string
  kind: Watch['kind']
  value: string | null
  data: Record<string, unknown> | null
  block_number: string | null
  error: string | null
  updated_at?: string
}

async function readOne(reader: ChainReader, w: Watch): Promise<{ value: bigint | null; data: Record<string, unknown> | null }> {
  switch (w.kind) {
    case 'block_number':
      return { value: await reader.getBlockNumber(), data: null }
    case 'native_balance':
      return { value: await reader.getBalance(w.address as Address), data: null }
    case 'erc20_balance':
      return { value: await reader.getErc20Balance(w.token as Address, w.address as Address), data: null }
    case 'erc20_supply':
      return { value: (await reader.getErc20Metadata(w.token as Address)).totalSupply, data: null }
    case 'erc20_metadata': {
      const m = await reader.getErc20Metadata(w.token as Address)
      return { value: null, data: { name: m.name, symbol: m.symbol, decimals: m.decimals } }
    }
  }
}

/** A watch on a token that has no contract yet (the "not launched yet" value, D252): nothing to read until the launch. */
export const awaitsLaunch = (w: Watch): boolean => 'token' in w && !isLaunchedToken(w.token)

/**
 * Reads every watch. A failed read keeps its previous value and records the error. Throws only if all fail.
 * Watches on a token that isn't launched yet are skipped, not failed: they get no row, so pages show
 * "Coming after launch" for them.
 */
export async function refreshSnapshots(reader: ChainReader, all: Watch[], db: SupabaseClient) {
  const watch = all.filter((w) => !awaitsLaunch(w))
  const waiting = all.length - watch.length
  if (watch.length === 0) return { updated: 0, failed: 0, waiting }
  const block = await reader.getBlockNumber()
  const rows: SnapshotRow[] = []
  const failures: Array<{ key: string; error: string }> = []
  for (const w of watch) {
    try {
      const { value, data } = await readOne(reader, w)
      rows.push({ chain_id: reader.chainId, key: w.key, kind: w.kind, value: value?.toString() ?? null, data, block_number: block.toString(), error: null })
    } catch (err) {
      failures.push({ key: w.key, error: err instanceof Error ? err.message : String(err) })
    }
  }
  if (rows.length) {
    const { error } = await db.from('chain_snapshots').upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'chain_id,key' })
    if (error) throw new Error(`Saving chain snapshots failed: ${error.message}`)
  }
  for (const f of failures) {
    await db.from('chain_snapshots').update({ error: f.error.slice(0, 500) }).eq('chain_id', reader.chainId).eq('key', f.key)
  }
  if (rows.length === 0) throw new Error(`Every chain read failed. First error: ${failures[0]?.error}`)
  return { updated: rows.length, failed: failures.length, waiting, block: block.toString() }
}

export async function readSnapshots(db: SupabaseClient, chainId: number, keys?: string[]): Promise<Record<string, SnapshotRow>> {
  let q = db.from('chain_snapshots').select('chain_id, key, kind, value, data, block_number, error, updated_at').eq('chain_id', chainId)
  if (keys?.length) q = q.in('key', keys)
  const { data, error } = await q
  if (error) throw new Error(`Reading chain snapshots failed: ${error.message}`)
  return Object.fromEntries(((data ?? []) as SnapshotRow[]).map((r) => [r.key, r]))
}
