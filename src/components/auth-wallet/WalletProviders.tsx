'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { WagmiProvider, type CreateConnectorFn } from 'wagmi'
import { createWalletConfig } from '@/lib/auth-wallet/wagmi'

/** Wrap the app (or just the pages that need wallets) in this, unless the template already provides wagmi. */
export function WalletProviders({ children, extraConnectors }: { children: ReactNode; extraConnectors?: CreateConnectorFn[] }) {
  const [config] = useState(() => createWalletConfig({ extraConnectors }))
  const [queryClient] = useState(() => new QueryClient())
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
