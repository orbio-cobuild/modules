/** Sample data controls (UX #11). Server-only: both calls need the app server key. */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SampleDataStatus {
  total: number
  tables: Record<string, number>
}

export async function sampleDataStatus(db: SupabaseClient): Promise<SampleDataStatus> {
  const { data, error } = await db.rpc('sample_data_status')
  if (error) throw new Error(`sample_data_status failed: ${error.message}`)
  return data as SampleDataStatus
}

/** Deletes every row marked is_sample in every registered table. Real rows are never touched. */
export async function clearSampleData(db: SupabaseClient): Promise<Record<string, number>> {
  const { data, error } = await db.rpc('clear_sample_data')
  if (error) throw new Error(`clear_sample_data failed: ${error.message}`)
  return data as Record<string, number>
}
