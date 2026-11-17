import type { Address } from 'viem'
import { createServerDb } from '@/lib/db/server'

/** Records sign-ins for the "is it working?" dashboard (UX #22). Never blocks sign-in. */
export interface WalletUserStore {
  recordSignIn(address: Address, chainId: number): Promise<void>
}

export const noopWalletUserStore: WalletUserStore = { recordSignIn: async () => {} }

export function supabaseWalletUserStore(): WalletUserStore {
  return {
    async recordSignIn(address, chainId) {
      let db
      try {
        db = createServerDb() // db module: publishable key + x-app-server-key
      } catch {
        return // no database in this project (or not connected yet): sign-in still works
      }
      const { error } = await db.rpc('cofounder_wallet_user_sign_in', {
        p_address: address.toLowerCase(),
        p_chain_id: chainId,
      })
      if (error) console.warn('[auth-wallet] could not record sign-in:', error.message)
    },
  }
}

export class MemoryWalletUserStore implements WalletUserStore {
  users = new Map<string, { address: string; chainId: number; signIns: number }>()
  async recordSignIn(address: Address, chainId: number) {
    const key = `${chainId}:${address.toLowerCase()}`
    const prev = this.users.get(key)
    this.users.set(key, { address: address.toLowerCase(), chainId, signIns: (prev?.signIns ?? 0) + 1 })
  }
}
