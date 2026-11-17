/**
 * Server wiring: `callOrbioTool(name, args, { maxCostMicro? })` for route handlers, server
 * actions and jobs. Server-only: it reads ORBIO_API_KEY and writes the cost log.
 *
 *   import { callOrbioTool } from '@/lib/orbio-tools/server'
 *   const { result } = await callOrbioTool<{ results: { url: string; title: string }[] }>('web.search', { query, limit: 5 })
 */
import 'server-only'
import rawConfig from '@/config/modules/orbio-tools.json'
import { createServerDb } from '@/lib/db/server'
import { orbioToolsConfigSchema, type OrbioToolsConfig } from './config'
import { createOrbioTools, type OrbioToolResult } from './core'
import { supabaseToolStore } from './store'

let cachedConfig: OrbioToolsConfig | undefined
export function orbioToolsConfig(): OrbioToolsConfig {
  cachedConfig ??= orbioToolsConfigSchema.parse(rawConfig)
  return cachedConfig
}

export function orbioTools() {
  return createOrbioTools({ config: orbioToolsConfig(), apiKey: process.env.ORBIO_API_KEY ?? '', store: supabaseToolStore(createServerDb()) })
}

export function callOrbioTool<T = unknown>(tool: string, args: Record<string, unknown>, opts?: { maxCostMicro?: bigint }): Promise<OrbioToolResult<T>> {
  return orbioTools().call<T>(tool, args, opts)
}
