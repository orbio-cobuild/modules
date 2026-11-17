/**
 * Server-side Supabase clients. Never import this from a client component.
 *
 * - createServerDb(): acts as the app server (sends x-app-server-key). RLS lets it read and
 *   write every table through the cf_server_all policy. Pass `actingWallet` (after verifying the
 *   wallet's signature, e.g. with the auth-wallet module) to act *for* that wallet, so
 *   wallet_owned policies apply to it.
 * - createPublicDb(): plain publishable-key client for public reads from server components.
 */
import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { publicDbEnv, serverKey } from './env'

export interface ServerDbOptions {
  /** A wallet address this request has already verified. Lower-cased before sending. */
  actingWallet?: string
  /** Custom fetch (tests, tracing). */
  fetch?: typeof fetch
}

const WALLET = /^0x[0-9a-fA-F]{40}$/

export function serverDbHeaders(opts: ServerDbOptions = {}): Record<string, string> {
  const headers: Record<string, string> = { 'x-app-server-key': serverKey() }
  if (opts.actingWallet !== undefined) {
    if (!WALLET.test(opts.actingWallet)) throw new Error('That wallet address does not look right.')
    headers['x-app-wallet'] = opts.actingWallet.toLowerCase()
  }
  return headers
}

export function createServerDb(opts: ServerDbOptions = {}): SupabaseClient {
  const { url, publishableKey } = publicDbEnv()
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: serverDbHeaders(opts), ...(opts.fetch ? { fetch: opts.fetch } : {}) },
  })
}

export function createPublicDb(opts: Pick<ServerDbOptions, 'fetch'> = {}): SupabaseClient {
  const { url, publishableKey } = publicDbEnv()
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(opts.fetch ? { global: { fetch: opts.fetch } } : {}),
  })
}
