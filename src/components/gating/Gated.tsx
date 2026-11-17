// Server Component. Renders children only for wallets that pass the gate; the check runs on the server, so gated
// content is never sent to people who don't qualify.
import type { ReactNode } from 'react'
import { getGateStatus } from '@/lib/gating/server'
import { GateNotice } from './GateNotice'

export async function Gated({ gate, children, fallback }: { gate: string; children: ReactNode; fallback?: ReactNode }) {
  const status = await getGateStatus(gate)
  if (status.status === 'allowed') return <>{children}</>
  return <>{fallback ?? <GateNotice status={status.status} message={status.message} />}</>
}
