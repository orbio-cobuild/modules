'use client'

import { useCallback, useEffect, useState } from 'react'

/** This app's own route, under the builder preview's path prefix when there is one ('' on the live site). */
const api = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`

export interface GateStatusJson {
  status: 'signedOut' | 'allowed' | 'denied' | 'comingSoon' | 'error'
  gateId: string
  message: string
  balance?: string
  required?: string
  decimals?: number
}

/**
 * Gate status for client components: for hints only (hide a button, show "you need 100 more").
 * Real protection is server-side (<Gated>, requireGate, withGate).
 */
export function useGate(gateId: string) {
  const [state, setState] = useState<GateStatusJson | null>(null)
  const refresh = useCallback(
    async (fresh = false) => {
      const res = await fetch(api(`/api/gates/${encodeURIComponent(gateId)}${fresh ? '?fresh=1' : ''}`), { cache: 'no-store' }).catch(() => null)
      setState(res ? await res.json() : { status: 'error', gateId, message: "We couldn't check your tokens right now." })
    },
    [gateId],
  )
  useEffect(() => {
    void refresh()
  }, [refresh])
  return { ...(state ?? { status: 'loading' as const }), refresh }
}
