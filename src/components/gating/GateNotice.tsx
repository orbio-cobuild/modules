import { WalletSignInButton } from '@/components/auth-wallet/WalletSignInButton'

/** What people see instead of gated content (including "coming after launch" before the token exists). Plain English, no price talk. */
export function GateNotice({ status, message }: { status: 'signedOut' | 'denied' | 'comingSoon' | 'error'; message: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border p-4" role="status">
      <p className="text-sm">{message}</p>
      {status === 'signedOut' && <WalletSignInButton />}
      {status === 'denied' && <p className="text-xs text-muted-foreground">Already hold them in another wallet? Sign out and sign in with that one.</p>}
    </div>
  )
}
