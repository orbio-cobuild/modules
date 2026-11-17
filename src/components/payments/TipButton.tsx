'use client'

import { useState } from 'react'
import { parseUnits } from 'viem'
import { Button } from '@/components/ui/button'
import type { TokenSymbol } from '@/lib/payments/config-schema'
import { usePayment, type ConfirmedPayment } from './use-payment'

const fmt = (micro: string) => (Number(micro) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })

/** Tip jar: preset amounts (micro-units, from config) plus a custom amount. */
export function TipButton({
  presetsMicro = ['1000000', '5000000', '20000000'],
  tokens = ['USDG', 'CREDIT'],
  onTipped,
  className,
}: {
  presetsMicro?: string[]
  tokens?: TokenSymbol[]
  onTipped?: (p: ConfirmedPayment) => void
  className?: string
}) {
  const [token, setToken] = useState<TokenSymbol>(tokens[0] ?? 'USDG')
  const [custom, setCustom] = useState('')
  const { step, message, busy, pay } = usePayment({ onConfirmed: onTipped })

  const tipCustom = () => {
    try {
      const micro = parseUnits(custom || '0', 6)
      if (micro <= 0n) return
      void pay({ kind: 'tip', amountMicro: micro.toString(), token })
    } catch {
      /* not a number */
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        {presetsMicro.map((m) => (
          <Button key={m} variant="outline" disabled={busy} onClick={() => pay({ kind: 'tip', amountMicro: m, token })}>
            {fmt(m)} {token}
          </Button>
        ))}
        <input
          aria-label="Custom tip"
          inputMode="decimal"
          placeholder="Other"
          className="h-9 w-24 rounded-md border bg-background px-2 text-sm"
          value={custom}
          disabled={busy}
          onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ''))}
        />
        <Button disabled={busy || !custom} onClick={tipCustom}>Tip</Button>
        {tokens.length > 1 && (
          <select aria-label="Tip with" className="h-9 rounded-md border bg-background px-2 text-sm" value={token} disabled={busy} onChange={(e) => setToken(e.target.value as TokenSymbol)}>
            {tokens.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>
      {message && <p className={`text-sm ${step === 'error' ? 'text-red-600' : 'text-muted-foreground'}`} role="status">{message}</p>}
    </div>
  )
}
