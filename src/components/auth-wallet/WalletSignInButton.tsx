'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { afterSignIn, friendlyWalletError, useWalletUser } from './use-wallet-user'

/**
 * Sign in with a wallet signature (no transaction, no gas).
 * Lists every wagmi connector: injected wallets, WalletConnect, and the preview test wallets when present.
 */
export function WalletSignInButton({ redirectTo, className }: { redirectTo?: string | null; className?: string }) {
  const wallet = useWalletUser()
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  const run = async (fn: () => Promise<void>, redirect = true) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      // A client navigation, never a full reload (D308): a reload loses what the person typed, and
      // window.location missed the preview's base path. On the page itself, only its data is refreshed.
      const to = redirect ? afterSignIn(redirectTo, pathname) : null
      if (to) router.push(to)
      else router.refresh()
    } catch (e) {
      setError(friendlyWalletError(e))
    } finally {
      setBusy(false)
      setPicking(false)
    }
  }

  if (wallet.status === 'loading') {
    return <Button className={className} disabled>Checking…</Button>
  }

  if (wallet.status === 'signedIn') {
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        {/* D317: a plain "Signed in", never the wallet's code; the code stays in the tooltip. */}
        <span className="text-sm text-muted-foreground" title={wallet.address}>Signed in</span>
        {wallet.accountMismatch && <span className="text-xs text-amber-600">Your wallet switched accounts.</span>}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(async () => wallet.signOut(), false)}>Sign out</Button>
      </div>
    )
  }

  const connectors = wallet.connectors
  return (
    <div className={`flex flex-col items-start gap-2 ${className ?? ''}`}>
      <Button disabled={busy} onClick={() => (connectors.length > 1 ? setPicking(true) : run(() => wallet.signIn()))}>
        {busy ? 'Check your wallet…' : 'Sign in with wallet'}
      </Button>
      {picking && connectors.length > 1 && (
        // A wallet chooser (D225): one row per wagmi connector, with the wallet's own icon when it
        // announces one (EIP-6963). Test wallets in previews appear here too.
        <div role="dialog" aria-modal="true" aria-label="Choose a wallet" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && !busy && setPicking(false)}>
          <div className="ui-surface w-full max-w-sm rounded-[var(--radius)] bg-[var(--card)] p-5 text-[var(--fg)] shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Choose a wallet</h2>
              <button type="button" aria-label="Close" disabled={busy} onClick={() => setPicking(false)} className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted-fg)] hover:bg-[var(--muted)]">×</button>
            </div>
            <ul className="space-y-2" role="list">
              {connectors.map((c) => (
                <li key={c.uid}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => wallet.signIn(c))}
                    className="flex w-full items-center gap-3 rounded-[calc(var(--radius)*0.75)] border border-[var(--border)] px-3 py-3 text-left text-sm font-medium transition hover:border-[var(--accent)] hover:bg-[var(--muted)] disabled:opacity-50"
                  >
                    {c.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.icon} alt="" width={28} height={28} className="h-7 w-7 rounded-md" />
                    ) : (
                      <span aria-hidden className="grid h-7 w-7 place-items-center rounded-md bg-[var(--muted)] text-xs font-bold">{c.name.slice(0, 1)}</span>
                    )}
                    <span className="flex-1">{c.name}</span>
                    {busy && <span className="text-xs text-[var(--muted-fg)]">Check your wallet…</span>}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-[var(--muted-fg)]">Signing in asks your wallet for a signature. It costs nothing and sends no transaction.</p>
            {error && <p className="mt-3 text-sm text-red-500" role="alert">{error}</p>}
          </div>
        </div>
      )}
      {error && !picking && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  )
}
