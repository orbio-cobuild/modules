'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Hex } from 'viem'
import { useAccount, useConfig, useSendTransaction, useSignTypedData, useSwitchChain } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { Button } from '@/components/ui/button'
import raw from '@/config/swap.json'
import { buildSwapTx, permitFromJson, type PermitSingleJson } from '@/lib/swap/encode'
import type { UnsignedTxJson } from '@/lib/swap/unsigned-tx'

/** This app's own route, under the builder preview's path prefix when there is one ('' on the live site). */
const api = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`

interface QuoteResponse {
  sample?: boolean
  quote: { from: string; to: string; amountIn: string; amountOut: string; route: string }
  minAmountOut: string | null
  slippageBps?: number
  approvals: UnsignedTxJson[]
  permit: { permitSingle: PermitSingleJson; typedData: { domain: { name: string; chainId: number; verifyingContract: Hex } } } | null
  swapInput: (Omit<Parameters<typeof buildSwapTx>[0], 'amountIn' | 'minAmountOut' | 'deadline' | 'permit'> & { amountIn: string; minAmountOut: string; deadline: string }) | null
  swap: UnsignedTxJson | null
  error?: string
}

const tokens = (raw as { tokens: { symbol: string }[] }).tokens.map((t) => t.symbol)

function friendly(err: unknown): string {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err)
  if (/reject|denied|cancel/i.test(msg)) return 'You cancelled in your wallet. Nothing was swapped.'
  if (/insufficient|exceeds balance/i.test(msg)) return "Your wallet doesn't have enough for this swap (or for the network fee)."
  if (/Too little received|V3TooLittleReceived|slippage/i.test(msg)) return 'The price moved too much. Get a new quote and try again.'
  return 'The swap did not go through. Get a new quote and try again.'
}

/**
 * Uniswap swap widget. Quotes come from the server (/api/swap/quote, Uniswap QuoterV2); every step is an
 * unsigned transaction or a Permit2 message that the user's own wallet sends or signs.
 */
export function SwapWidget({ defaultFrom, defaultTo, className }: { defaultFrom?: string; defaultTo?: string; className?: string }) {
  const cfg = raw as { defaultFrom: string; defaultTo: string }
  const [from, setFrom] = useState(defaultFrom ?? cfg.defaultFrom)
  const [to, setTo] = useState(defaultTo ?? cfg.defaultTo)
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { address, chainId } = useAccount()
  const wagmiConfig = useConfig()
  const { sendTransactionAsync } = useSendTransaction()
  const { signTypedDataAsync } = useSignTypedData()
  const { switchChainAsync } = useSwitchChain()

  useEffect(() => {
    setQuote(null)
    setError(null)
    if (!amount || Number(amount) <= 0 || from === to) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(api('/api/swap/quote'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ from, to, amount, owner: address }),
          signal: ctrl.signal,
        })
        const body = (await res.json()) as QuoteResponse
        if (!res.ok) setError(body.error ?? 'No quote right now.')
        else setQuote(body)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError('No quote right now.')
      }
    }, 400)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [from, to, amount, address])

  const steps = useMemo(() => (quote ? quote.approvals.length + (quote.permit ? 1 : 0) + 1 : 0), [quote])

  async function send(tx: UnsignedTxJson) {
    const hash = await sendTransactionAsync({ chainId: tx.chainId, to: tx.to, data: tx.data, value: BigInt(tx.value) })
    const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: tx.chainId })
    if (receipt.status !== 'success') throw new Error('Transaction failed')
    return hash
  }

  async function swap() {
    if (!quote?.swapInput) return
    setBusy(true)
    setError(null)
    try {
      const target = quote.swapInput.chainId
      if (chainId !== target) await switchChainAsync({ chainId: target })
      let n = 1
      for (const a of quote.approvals) {
        setStatus(`Step ${n++} of ${steps}: ${a.description}. Confirm in your wallet.`)
        await send(a)
      }
      let tx: UnsignedTxJson | null = quote.swap
      if (quote.permit) {
        setStatus(`Step ${n++} of ${steps}: sign a permission message (free, no transaction).`)
        const permitSingle = permitFromJson(quote.permit.permitSingle)
        const signature = await signTypedDataAsync({
          domain: quote.permit.typedData.domain,
          types: {
            PermitDetails: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint160' },
              { name: 'expiration', type: 'uint48' },
              { name: 'nonce', type: 'uint48' },
            ],
            PermitSingle: [
              { name: 'details', type: 'PermitDetails' },
              { name: 'spender', type: 'address' },
              { name: 'sigDeadline', type: 'uint256' },
            ],
          },
          primaryType: 'PermitSingle',
          message: permitSingle,
        })
        const s = quote.swapInput
        const built = buildSwapTx({ ...s, amountIn: BigInt(s.amountIn), minAmountOut: BigInt(s.minAmountOut), deadline: BigInt(s.deadline), permit: { permitSingle, signature } })
        tx = { ...built, value: built.value.toString() }
      }
      if (!tx) throw new Error('No swap transaction')
      setStatus(`Step ${n} of ${steps}: confirm the swap in your wallet.`)
      await send(tx)
      setStatus(`Swapped ${quote.quote.amountIn} ${quote.quote.from} for ${quote.quote.to}. It may take a moment to show in your wallet.`)
      setAmount('')
    } catch (e) {
      setStatus(null)
      setError(friendly(e))
    } finally {
      setBusy(false)
    }
  }

  const select = (value: string, onChange: (v: string) => void, label: string) => (
    <select aria-label={label} className="h-10 rounded-md border bg-background px-2 text-sm" value={value} disabled={busy} onChange={(e) => onChange(e.target.value)}>
      {tokens.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  )

  return (
    <div className={`flex w-full max-w-sm flex-col gap-3 rounded-xl border p-4 ${className ?? ''}`}>
      <div className="flex gap-2">
        <input
          aria-label="Amount to swap"
          inputMode="decimal"
          placeholder="0.0"
          className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3"
          value={amount}
          disabled={busy}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
        />
        {select(from, setFrom, 'From token')}
      </div>
      <button type="button" className="self-center text-sm text-muted-foreground" disabled={busy} onClick={() => { setFrom(to); setTo(from) }} aria-label="Switch tokens">
        ↓↑
      </button>
      <div className="flex items-center gap-2">
        <div className="h-10 flex-1 rounded-md border bg-muted px-3 py-2 text-sm" aria-live="polite">
          {quote ? `≈ ${Number(quote.quote.amountOut).toLocaleString(undefined, { maximumFractionDigits: 6 })}` : '—'}
        </div>
        {select(to, setTo, 'To token')}
      </div>
      {quote?.sample && <p className="text-xs text-amber-600">Sample quote for this preview. Swaps are off until the app is live.</p>}
      {quote?.minAmountOut && (
        <p className="text-xs text-muted-foreground">
          At least {quote.minAmountOut} {quote.quote.to} after up to {(quote.slippageBps ?? 50) / 100}% price movement. Route: {quote.quote.route}.
        </p>
      )}
      <Button disabled={!quote?.swapInput || busy} onClick={swap}>
        {!address ? 'Connect a wallet to swap' : busy ? 'Working…' : steps > 1 ? `Swap (${steps} steps)` : 'Swap'}
      </Button>
      {status && <p className="text-sm" role="status">{status}</p>}
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <p className="text-xs text-muted-foreground">Swaps run on Uniswap. Prices move; you always confirm in your own wallet.</p>
    </div>
  )
}
