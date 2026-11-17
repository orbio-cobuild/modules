'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Address } from 'viem'
import { useAccount, useConnect, useSignMessage, useSwitchChain, type Connector } from 'wagmi'
import { buildSignInMessage } from '@/lib/auth-wallet/message'

/** This app's own route, under the builder preview's path prefix when there is one ('' on the live site). */
const api = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`

export type WalletUserState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; address: Address; chainId: number; expiresAt: number }

// One shared state for every component on the page.
let state: WalletUserState = { status: 'loading' }
let inflight: Promise<void> | null = null
// The player a Play-as sign-in is following right now (one at a time for the whole page; D316).
let followingTo: string | null = null
// The player whose follow sign-in gave up, so it isn't retried on every render (cleared by the next switch).
let followFailed: string | null = null
// The test-wallet account this page last saw, so a switch can be told apart from a page load (D289).
let lastPlayer: string | null = null
// One sign-in at a time for the whole page (D308): the nonce is a single cookie, so two sign-ins at
// once (a button press and the automatic Play-as sign-in) would refuse each other.
let signingIn: Promise<void> | null = null
// The person signed out on purpose: the automatic Play-as sign-in waits for their next player switch.
let optedOut = false
// The test wallet the automatic sign-in last tried, so a refusal is not retried in a loop.
let autoTried: string | null = null

/**
 * The preview's player switcher (devchain's "Play as"), when the page has one. Read off globalThis
 * so this module never imports the devchain package, which live builds don't have.
 */
function previewPlayers(): { getCurrent(): { address: string }; switchPlayer(q: string): unknown; players: readonly { address: string }[]; subscribe?(listener: () => void): () => void } | undefined {
  return (globalThis as Record<string, unknown>).__cofounderPreviewPlayers as ReturnType<typeof previewPlayers>
}

/**
 * What to do when the signed-in account and the test wallet's player differ (D289). On a page load
 * (no switch seen yet on this page) the player goes back to the signed-in one: the live test's
 * "Play as Bob" turned back into Alice after every reload, because the default player signed in
 * over Bob's session. After the person switched, the session follows the new player (D274).
 */
export function followPlayer(sessionAddress: string, connected: string, previous: string | null, playerAddresses: readonly string[]): 'sign_in' | 'switch_player' | 'none' {
  if (sessionAddress.toLowerCase() === connected.toLowerCase()) return 'none'
  const isPlayer = playerAddresses.some((a) => a.toLowerCase() === sessionAddress.toLowerCase())
  if (previous === null && isPlayer) return 'switch_player'
  if (previous !== null && previous.toLowerCase() === connected.toLowerCase()) return 'none'
  return 'sign_in'
}
const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

/**
 * A person's name for visitor copy ("Posted by …", D319), never a wallet code: "You" for the signed-in
 * wallet, the practice player's name in a preview (Alice, Bob, Carol), else a short member label.
 */
export function personLabel(address: string | null | undefined, me?: string | null): string {
  if (!address) return 'Someone'
  if (same(address, me)) return 'You'
  const player = (previewPlayers()?.players as readonly { address: string; name?: string }[] | undefined)?.find((p) => same(p.address, address))
  if (player?.name) return player.name
  return `Member ${address.slice(-4).toUpperCase()}`
}

/**
 * A Play-as switch signs in as the new player by itself (D316, round 9 M2). Round 9's switch to
 * Alice kept Carol signed in ("Your wallet switched accounts.", Carol's data): the old follow marked
 * the new player as seen before its sign-in ran, so one failed or overlapping sign-in left the old
 * session in place for good. Now the old session is signed out first, the new player signs in (with
 * a retry), the player counts as followed only once that worked, and the page reloads so everything
 * on it is the new player's.
 */
async function followSwitch(target: string, signIn: (connector?: Connector) => Promise<void>, connector: Connector | undefined): Promise<void> {
  if (same(followingTo, target) || same(followFailed, target)) return
  followingTo = target
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      // Another sign-in (the automatic one, a button) finishes first: the nonce is one cookie.
      if (signingIn) await signingIn.catch(() => undefined)
      const now = previewPlayers()?.getCurrent().address
      if (now && !same(now, target)) return // a newer switch took over
      if (state.status === 'signedIn' && same(state.address, target)) {
        lastPlayer = target
        return
      }
      const before = state.status === 'signedIn' ? state.address : null
      try {
        // The old player's session ends first, so a sign-in that fails never leaves them signed in.
        if (before) await fetch(api('/api/auth/wallet/logout'), { method: 'POST', credentials: 'same-origin' })
        await signIn(connector)
        if (state.status !== 'signedIn' || !same(state.address, target)) throw new Error('Sign-in failed')
        lastPlayer = target
        // Everything the page loaded was the old player's: show the new player's own data.
        if (before && typeof window !== 'undefined') window.location.reload()
        return
      } catch {
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)))
      }
    }
    followFailed = target
    await refreshSession()
  } finally {
    if (same(followingTo, target)) followingTo = null
  }
}

const listeners = new Set<() => void>()
const setState = (next: WalletUserState) => {
  state = next
  listeners.forEach((l) => l())
}

async function refreshSession(): Promise<void> {
  inflight ??= fetch(api('/api/auth/wallet/me'), { cache: 'no-store', credentials: 'same-origin' })
    .then((r) => r.json())
    .then((me) => setState(me.signedIn ? { status: 'signedIn', address: me.address, chainId: me.chainId, expiresAt: me.expiresAt } : { status: 'signedOut' }))
    .catch(() => setState({ status: 'signedOut' }))
    .finally(() => {
      inflight = null
    })
  return inflight
}

/**
 * Did the person say no in their wallet? Only EIP-1193's "user rejected" (code 4001), viem/wagmi's
 * UserRejectedRequestError, or a wallet's own "user rejected / denied / cancelled" wording counts
 * (D274). The old test matched any message with "reject", "denied" or "cancel" anywhere, so a wrong
 * network or a failed request read "You cancelled the request in your wallet."
 */
export function isUserRejection(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    const x = e as { code?: unknown; name?: unknown; message?: unknown }
    if (x.code === 4001 || x.code === 'ACTION_REJECTED') return true
    if (x.name === 'UserRejectedRequestError') return true
    if (typeof x.message === 'string' && /\buser (?:rejected|denied|cancel+ed)\b|\brejected by (?:the )?user\b|\buser cancel+ed\b/i.test(x.message)) return true
  }
  return false
}

/**
 * The app's own sign-in route said no, in words written for people (D289): "This sign-in request was
 * made for a different website.", "Your sign-in request expired…". Shown as it is, never replaced
 * by a generic line, so a refusal can be told apart from a wallet problem.
 */
export class SignInRefusedError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
    this.name = 'SignInRefusedError'
  }
}

/** Plain-English text for wallet errors (UX #6). */
export function friendlyWalletError(err: unknown): string {
  if (err instanceof SignInRefusedError) return err.message
  if (isUserRejection(err)) return 'You cancelled the request in your wallet.'
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err)
  if (/not running|local chain|test wallets only/i.test(msg)) return 'The test chain isn’t answering. Reload the preview and try again.'
  if (/chain|network/i.test(msg)) return 'Please switch your wallet to the right network and try again.'
  if (/connector|provider not found|no.*wallet/i.test(msg)) return 'No wallet found. Install a wallet app or use WalletConnect.'
  if (/Could not start sign-in|Sign-in failed|fetch/i.test(msg)) return 'The sign-in didn’t go through. Please try again.'
  return 'Something went wrong signing in. Please try again.'
}

/**
 * Which connector signIn must connect first (D274): the one the person picked when it isn't the one
 * already connected (a previously connected wallet must not stand in for their choice), the first
 * connector when nothing is connected, or null when the right one is already connected.
 */
export function connectorToConnect<C extends { uid: string }>(picked: C | undefined, current: C | undefined, isConnected: boolean, all: readonly C[]): C | null {
  if (picked) return isConnected && current?.uid === picked.uid ? null : picked
  if (isConnected && current) return null
  return all[0] ?? null
}

/**
 * Where to go after signing in (D308). Nowhere when the person is already on that page: round 5's
 * "/post" sign-in reloaded the page and wiped the form they had filled in. `redirectTo` is an app path
 * ("/dashboard"); `pathname` is Next's, without the preview's base path.
 */
export function afterSignIn(redirectTo: string | null | undefined, pathname: string | null): string | null {
  if (!redirectTo || !redirectTo.startsWith('/')) return null
  const target = redirectTo.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/'
  const here = (pathname ?? '').replace(/\/+$/, '') || '/'
  return target === here ? null : redirectTo
}

/** Test wallets (the preview's Alice, Bob, Carol) sign with no prompt, so a new player can be signed in by itself. */
export const isTestWallet = (c: { type?: string } | undefined) => c?.type === 'previewWallets'

/**
 * The signed-in wallet user, plus signIn / signOut.
 * `accountMismatch` is true when the wallet now shows a different address than the session.
 */
export function useWalletUser() {
  const user = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => state,
  )
  const { address: connected, chainId: walletChainId, isConnected, connector: current } = useAccount()
  const { connectAsync, connectors } = useConnect()
  const { signMessageAsync } = useSignMessage()
  const { switchChainAsync } = useSwitchChain()

  useEffect(() => {
    if (state.status === 'loading') void refreshSession()
  }, [])

  const signInOnce = useCallback(
    async (connector?: Connector) => {
      optedOut = false
      const appChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID)
      let address = connected
      let chainId = walletChainId
      // The picked wallet, even when another one is connected already (D274): in a preview the
      // person's real wallet may be remembered as connected while they chose the test wallets.
      const toConnect = connectorToConnect(connector, current, isConnected && !!address, connectors)
      if (toConnect) {
        const res = await connectAsync({ connector: toConnect, chainId: appChainId })
        address = res.accounts[0]
        chainId = res.chainId
      } else if (!isConnected || !address) {
        throw new Error('No wallet found')
      }
      // A test wallet signs as the player chosen in the bar: wagmi's account can lag a switch (D316).
      if (isTestWallet(toConnect ?? current)) address = (previewPlayers()?.getCurrent().address as Address | undefined) ?? address
      if (!address) throw new Error('No wallet account')
      if (chainId !== appChainId) await switchChainAsync({ chainId: appChainId })

      const nonceRes = await fetch(api('/api/auth/wallet/nonce'), { cache: 'no-store', credentials: 'same-origin' })
      if (!nonceRes.ok) throw new Error('Could not start sign-in')
      const { nonce, statement } = (await nonceRes.json()) as { nonce: string; statement: string }
      const message = buildSignInMessage({
        address,
        chainId: appChainId,
        nonce,
        statement,
        host: window.location.host,
        origin: window.location.origin,
      })
      const signature = await signMessageAsync({ message, account: address })
      const verify = await fetch(api('/api/auth/wallet/verify'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      })
      if (!verify.ok) {
        const body = (await verify.json().catch(() => ({}))) as { error?: string; code?: string }
        if (body.error) throw new SignInRefusedError(body.error, body.code)
        throw new Error('Sign-in failed')
      }
      await refreshSession()
    },
    [connected, walletChainId, isConnected, current, connectors, connectAsync, switchChainAsync, signMessageAsync],
  )
  const signIn = useCallback(
    (connector?: Connector): Promise<void> => {
      if (signingIn) return signingIn
      signingIn = signInOnce(connector).finally(() => {
        signingIn = null
      })
      return signingIn
    },
    [signInOnce],
  )

  // "Play as" (the preview's player switcher) changes the test wallet's account. The session follows
  // it: the new player signs in by itself, since a test wallet signs with no prompt (D274).
  useEffect(() => {
    if (user.status !== 'signedIn' || !connected || !isTestWallet(current) || followingTo) return
    const players = previewPlayers()
    const what = followPlayer(user.address, connected, lastPlayer, players?.players.map((p) => p.address) ?? [])
    if (what === 'switch_player') {
      // The signed-in player stays the one playing; the wallet follows on the controller's change.
      try {
        players!.switchPlayer(user.address)
      } catch {
        // not a player after all: leave it
      }
      lastPlayer = user.address
      return
    }
    if (what === 'none') {
      lastPlayer = connected
      return
    }
    void followSwitch(connected, signIn, current)
  }, [user, connected, current, signIn])

  // D319: the project-data helper saveRow() asks for this when the app's route answers "not signed in"
  // (round 10's second bounty lost its title that way: the wallet was connected, the session was gone).
  // It signs in again (a test wallet with no prompt; a real wallet asks once) and says whether it worked.
  useEffect(() => {
    const g = globalThis as { __cofounderSignInAgain?: () => Promise<boolean> }
    g.__cofounderSignInAgain = async () => {
      await refreshSession()
      if (state.status === 'signedIn') return true
      const test = connectors.find((c) => isTestWallet(c))
      await signIn(previewPlayers() && test ? test : undefined)
      return (state.status as WalletUserState['status']) === 'signedIn'
    }
  }, [signIn, connectors])

  const signOut = useCallback(async () => {
    optedOut = true
    await fetch(api('/api/auth/wallet/logout'), { method: 'POST', credentials: 'same-origin' })
    setState({ status: 'signedOut' })
  }, [])

  const accountMismatch = user.status === 'signedIn' && !!connected && connected.toLowerCase() !== user.address.toLowerCase()
  return { ...user, user, accountMismatch, signIn, signOut, refresh: refreshSession, connectors }
}

/**
 * Preview only (D308): the test wallet being played (devchain's "Play as") gets a real sign-in session
 * by itself, signed with its test key, with no prompt. Round 5's bounty titles and descriptions were
 * never saved: Play-as wallets sent transactions without a session, so the app's own data route
 * answered 401 and the cards said "Task #N". The site module's providers call this once per page.
 *
 * It signs in when the page plays as a test wallet (connected through it, or a player was just chosen
 * in the bar) and nobody is signed in. A real wallet that is connected is left alone, and after the
 * person signs out it waits until they choose a player again.
 */
export function usePreviewPlayerSession(): void {
  const wallet = useWalletUser()
  const { isConnected, connector } = useAccount()
  const [switches, setSwitches] = useState(0)
  const status = wallet.status
  const { signIn, connectors } = wallet
  // The bar's own switch event, so the follow never waits on wagmi's account change (D316).
  const signInRef = useRef(signIn)
  signInRef.current = signIn
  const connectorsRef = useRef(connectors)
  connectorsRef.current = connectors
  useEffect(
    () =>
      previewPlayers()?.subscribe?.(() => {
        optedOut = false
        autoTried = null
        followFailed = null
        setSwitches((n) => n + 1)
        const next = previewPlayers()?.getCurrent().address
        const test = connectorsRef.current.find((c) => isTestWallet(c))
        if (next && test && state.status === 'signedIn' && !same(state.address, next)) void followSwitch(next, signInRef.current, test)
      }),
    [],
  )
  useEffect(() => {
    const players = previewPlayers()
    if (status !== 'signedOut' || optedOut || signingIn || !players) return
    const test = connectors.find((c) => isTestWallet(c))
    if (!test) return
    if (isConnected ? !isTestWallet(connector) : switches === 0) return
    const who = players.getCurrent().address.toLowerCase()
    if (autoTried === who) return
    autoTried = who
    void signIn(test).catch(() => undefined)
  }, [status, isConnected, connector, switches, signIn, connectors])
}
