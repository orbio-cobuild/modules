// Server Component: the latest tips, read through the public recent-payments function (no secrets needed).
import { getChainId } from '@/lib/payments/chain'
import { formatAmount, getPaymentStore } from '@/lib/payments/server'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export async function RecentTips({ limit = 10 }: { limit?: number }) {
  let tips: Awaited<ReturnType<ReturnType<typeof getPaymentStore>['recent']>> = []
  try {
    tips = await getPaymentStore().recent('tip', getChainId(), limit)
  } catch {
    return null
  }
  if (!tips.length) return <p className="text-sm text-muted-foreground">No tips yet. Be the first!</p>
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {tips.map((t) => (
        <li key={t.txHash} className="flex justify-between gap-4">
          <span className="font-mono">{short(t.payer)}</span>
          <span>{formatAmount(t.amountRaw)} {t.token}</span>
        </li>
      ))}
    </ul>
  )
}
