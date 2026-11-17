'use client'
/**
 * Keeps the feed live. Subscribes to new and updated agent_runs through Supabase Realtime and refreshes
 * the server-rendered page; also polls every `pollSeconds` in case Realtime isn't available.
 * Only the first page refreshes (older pages are history).
 */
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getBrowserDb } from '@/lib/db/client'

export interface LiveRefreshProps {
  agent: string
  realtime: boolean
  pollSeconds: number
}

export function LiveRefresh({ agent, realtime, pollSeconds }: LiveRefreshProps) {
  const router = useRouter()
  const [mode, setMode] = useState<'live' | 'polling'>('polling')

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    const timer = setInterval(refresh, pollSeconds * 1000)
    let cleanup: (() => void) | undefined
    if (realtime) {
      try {
        const db = getBrowserDb()
        const channel = db
          .channel(`mind-feed-${agent}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_runs', filter: `agent=eq.${agent}` }, refresh)
          .subscribe((status) => setMode(status === 'SUBSCRIBED' ? 'live' : 'polling'))
        cleanup = () => void db.removeChannel(channel)
      } catch {
        setMode('polling')
      }
    }
    return () => {
      clearInterval(timer)
      cleanup?.()
    }
  }, [agent, realtime, pollSeconds, router])

  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      {mode === 'live' ? 'Live: new runs appear automatically.' : `Updates every ${pollSeconds} seconds.`}
    </p>
  )
}
