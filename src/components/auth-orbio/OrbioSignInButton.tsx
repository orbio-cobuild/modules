'use client'

import { Button } from '@/components/ui/button'
import { useOrbioUser } from './use-orbio-user'

/** "Sign in with Orbio". Signed in: shows the person's name or handle and a sign-out button. */
export function OrbioSignInButton({ returnTo, className }: { returnTo?: string; className?: string }) {
  const orbio = useOrbioUser()

  if (orbio.status === 'loading') return <Button className={className} disabled>Checking…</Button>

  if (orbio.status === 'signedIn') {
    const label = orbio.user.name ?? (orbio.user.preferredUsername ? `@${orbio.user.preferredUsername}` : 'Orbio account')
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        {orbio.user.picture && <img src={orbio.user.picture} alt="" className="h-6 w-6 rounded-full" />}
        <span className="text-sm">{label}</span>
        <Button variant="outline" size="sm" onClick={() => void orbio.signOut()}>Sign out</Button>
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-start gap-2 ${className ?? ''}`}>
      <Button onClick={() => orbio.signIn(returnTo)}>{orbio.reconnect ? 'Reconnect Orbio' : 'Sign in with Orbio'}</Button>
      {orbio.error && <p className="text-sm text-red-600" role="alert">{orbio.error}</p>}
    </div>
  )
}
