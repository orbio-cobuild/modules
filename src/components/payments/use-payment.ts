'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, useSendTransaction, useSwitchChain } from 'wagmi'
import type { TokenSymbol } from '@/lib/payments/config-schema'
import type { UnsignedTxJson } from '@/lib/payments/unsigned-tx'

/** This app's own route, under the builder preview's path prefix when there is one ('' on the live site). */
const api = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`

export type PaymentStep = 'idle' | 'preparing' | 'wallet' | 'confirming' | 'confirmed' | 'error'

export type PayRequest = { kind: 'checkout'; productId: string; token: TokenSymbol } | { kind: 'tip'; amountMicro: string; token: TokenSymbol }

export interface ConfirmedPayment {
  id: string
  kind: 'checkout' | 'tip'
  productId: string | null
  token: TokenSymbol
  amount: string
  payer: string
  txHash: string
}

const PENDING_KEY = 'cf_pending_payment'
const POLL_MS = 3000
const MAX_WAIT_MS = 5 * 60 * 1000

function friendly(err: unknown): string {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err)
  if (/reject|denied|cancel/i.test(msg)) return 'You cancelled the payment in your wallet. Nothing was sent.'
  if (/insufficient|exceeds balance/i.test(msg)) return "Your wallet doesn't have enough for this payment (or for the network fee)."
  if (/chain|network/i.test(msg)) return 'Please switch your wallet to the right network and try again.'
  return 'Something went wrong with the payment. If your wallet shows it was sent, wait a moment and refresh.'
}

/**
 * Pay with USDG or CREDIT: ask the server for a signed checkout, have the wallet send the ERC-20 transfer,
 * then poll the server until it has verified the transfer on-chain. A pending check survives a page reload.
 */
export function usePayment(opts: { onConfirmed?: (p: ConfirmedPayment) => void } = {}) {
  const [step, setStep] = useState<PaymentStep>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [payment, setPayment] = useState<ConfirmedPayment | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const { isConnected, chainId } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()
  const onConfirmed = useRef(opts.onConfirmed)
  onConfirmed.current = opts.onConfirmed

  const poll = useCallback(async (intent: string, hash: string) => {
    setStep('confirming')
    setTxHash(hash)
    const started = Date.now()
    while (Date.now() - started < MAX_WAIT_MS) {
      const res = await fetch(api('/api/payments/verify'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intent, txHash: hash }),
      }).catch(() => null)
      const body = res ? await res.json().catch(() => ({})) : {}
      if (res?.status === 200) {
        try {
          localStorage.removeItem(PENDING_KEY)
        } catch {}
        setPayment(body.payment)
        setStep('confirmed')
        setMessage('Payment confirmed. Thank you!')
        onConfirmed.current?.(body.payment)
        return
      }
      if (res && res.status !== 202 && res.status < 500) {
        try {
          localStorage.removeItem(PENDING_KEY)
        } catch {}
        setStep('error')
        setMessage(body.error ?? 'That payment could not be confirmed.')
        return
      }
      setMessage(body.message ?? 'Waiting for the network to confirm your payment…')
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
    setStep('error')
    setMessage('Your payment is taking longer than usual to confirm. Refresh this page in a minute to check again.')
  }, [])

  // Resume a check that was interrupted by a reload.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PENDING_KEY)
      if (saved) {
        const { intent, txHash: hash } = JSON.parse(saved) as { intent: string; txHash: string }
        void poll(intent, hash)
      }
    } catch {}
  }, [poll])

  const pay = useCallback(
    async (req: PayRequest) => {
      setMessage(null)
      setPayment(null)
      if (!isConnected) {
        setStep('error')
        setMessage('Connect your wallet first.')
        return
      }
      try {
        setStep('preparing')
        const res = await fetch(api('/api/payments/intent'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) })
        const body = (await res.json()) as { intent: string; tx: UnsignedTxJson; error?: string }
        if (!res.ok) throw Object.assign(new Error(body.error ?? 'Could not start the payment'), { userFacing: true })
        if (chainId !== body.tx.chainId) await switchChainAsync({ chainId: body.tx.chainId })
        setStep('wallet')
        const hash = await sendTransactionAsync({ chainId: body.tx.chainId, to: body.tx.to, data: body.tx.data, value: BigInt(body.tx.value) })
        try {
          localStorage.setItem(PENDING_KEY, JSON.stringify({ intent: body.intent, txHash: hash }))
        } catch {}
        await poll(body.intent, hash)
      } catch (e) {
        setStep('error')
        setMessage((e as { userFacing?: boolean }).userFacing ? (e as Error).message : friendly(e))
      }
    },
    [isConnected, chainId, switchChainAsync, sendTransactionAsync, poll],
  )

  return { step, message, payment, txHash, pay, busy: step === 'preparing' || step === 'wallet' || step === 'confirming' }
}
