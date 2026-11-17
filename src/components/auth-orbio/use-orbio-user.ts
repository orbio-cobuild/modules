'use client'

import { useCallback, useEffect, useState } from 'react'

/** This app's own route, under the builder preview's path prefix when there is one ('' on the live site). */
const api = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`

export interface OrbioUser {
  sub: string
  name?: string
  preferredUsername?: string
  picture?: string
  email?: string
  walletAddress?: string
}

export type OrbioUserState =
  | { status: 'loading' }
  | { status: 'signedOut'; reconnect?: boolean }
  | { status: 'signedIn'; user: OrbioUser }

const ERROR_TEXT: Record<string, string> = {
  cancelled: 'You cancelled signing in with Orbio.',
  expired: 'That sign-in took too long. Please try again.',
  failed: "We couldn't sign you in with Orbio. Please try again.",
  not_configured: 'Sign in with Orbio is not set up for this app yet.',
}

/** The Orbio user for client components. Tokens never reach the browser; only the profile does. */
export function useOrbioUser() {
  const [state, setState] = useState<OrbioUserState>({ status: 'loading' })
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const me = await (await fetch(api('/api/auth/orbio/me'), { cache: 'no-store', credentials: 'same-origin' })).json()
      setState(me.signedIn ? { status: 'signedIn', user: me.user } : { status: 'signedOut', reconnect: !!me.reconnect })
    } catch {
      setState({ status: 'signedOut' })
    }
  }, [])

  useEffect(() => {
    void refresh()
    const code = new URLSearchParams(window.location.search).get('orbio_error')
    if (code) setError(ERROR_TEXT[code] ?? ERROR_TEXT.failed!)
  }, [refresh])

  const signIn = useCallback((returnTo?: string) => {
    const to = returnTo ?? window.location.pathname + window.location.search.replace(/[?&]orbio_error=[^&]*/, '')
    window.location.assign(`/api/auth/orbio/login?returnTo=${encodeURIComponent(to)}`)
  }, [])

  const signOut = useCallback(async () => {
    await fetch(api('/api/auth/orbio/logout'), { method: 'POST', credentials: 'same-origin' })
    setState({ status: 'signedOut' })
  }, [])

  return { ...state, state, error, signIn, signOut, refresh }
}
