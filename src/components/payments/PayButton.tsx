'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { TokenSymbol } from '@/lib/payments/config-schema'
import { usePayment, type ConfirmedPayment } from './use-payment'

const LABEL: Record<string, string> = { preparing: 'Preparing…', wallet: 'Confirm in your wallet…', confirming: 'Confirming payment…' }

/**
 * Checkout button for a configured product. Price, name and accepted tokens come from src/config/payments.json;
 * the server decides the amount, the client never does.
 */
export function PayButton({
  productId,
  label,
  tokens = ['USDG', 'CREDIT'],
  onPaid,
  className,
}: {
  productId: string
  label?: string
  tokens?: TokenSymbol[]
  onPaid?: (p: ConfirmedPayment) => void
  className?: string
}) {
  const [token, setToken] = useState<TokenSymbol>(tokens[0] ?? 'USDG')
  const { step, message, busy, pay } = usePayment({ onConfirmed: onPaid })
  return (
    <div className={`flex flex-col items-start gap-2 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        {tokens.length > 1 && (
          <select aria-label="Pay with" className="h-9 rounded-md border bg-background px-2 text-sm" value={token} disabled={busy} onChange={(e) => setToken(e.target.value as TokenSymbol)}>
            {tokens.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        <Button disabled={busy || step === 'confirmed'} onClick={() => pay({ kind: 'checkout', productId, token })}>
          {LABEL[step] ?? (step === 'confirmed' ? 'Paid' : (label ?? `Pay with ${token}`))}
        </Button>
      </div>
      {message && <p className={`text-sm ${step === 'error' ? 'text-red-600' : 'text-muted-foreground'}`} role="status">{message}</p>}
    </div>
  )
}
