/** Where tool calls and their costs are logged. supabaseToolStore is the real one; memoryToolStore is for tests and previews. */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ToolCallRow {
  tool: string
  ok: boolean
  costMicro: bigint
  /** True when Orbio didn't report the charge and we logged the cap instead. */
  estimated: boolean
  error: string | null
}

export interface ToolStore {
  /** Total logged cost since this moment (sample rows excluded). */
  spentSince(since: Date): Promise<bigint>
  record(row: ToolCallRow): Promise<void>
}

export function supabaseToolStore(db: SupabaseClient): ToolStore {
  return {
    async spentSince(since) {
      const { data, error } = await db.rpc('orbio_tools_spent_since', { p_since: since.toISOString() })
      if (error) throw new Error(`orbio_tools_spent_since failed: ${error.message}`)
      return BigInt((data as number | string | null) ?? 0)
    },
    async record(row) {
      const { error } = await db.from('orbio_tool_calls').insert({
        tool: row.tool,
        ok: row.ok,
        cost_micro: row.costMicro.toString(),
        estimated: row.estimated,
        error: row.error?.slice(0, 500) ?? null,
      })
      if (error) throw new Error(`Logging the Orbio tool call failed: ${error.message}`)
    },
  }
}

export function memoryToolStore(): ToolStore & { rows: (ToolCallRow & { at: Date })[] } {
  const rows: (ToolCallRow & { at: Date })[] = []
  return {
    rows,
    async spentSince(since) {
      return rows.filter((r) => r.at >= since).reduce((s, r) => s + r.costMicro, 0n)
    },
    async record(row) {
      rows.push({ ...row, at: new Date() })
    },
  }
}
