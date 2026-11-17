import { http, createConfig, createStorage, injected, noopStorage, type CreateConnectorFn } from 'wagmi'
import { getChain, getChainId, getRpcUrl } from './chain'

/**
 * WalletConnect, only when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set.
 *
 * `wagmi/connectors` is one file that re-exports every wallet's connector (Coinbase / Base
 * Account, MetaMask SDK, Gemini, Porto, Safe, WalletConnect). The dev server has no tree
 * shaking, so a top-level import of it puts all of them in every page's first compile (D269:
 * about 4x the compile time and twice the memory, which a small preview machine never finished).
 * So it is required here, inside the `if`. The template's next.config.ts sets the variable to ''
 * when it has no value, and the bundler then drops this whole branch and never reads the file.
 */
function walletConnectConnector(): CreateConnectorFn | null {
  if (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { walletConnect } = require('wagmi/connectors') as typeof import('wagmi/connectors')
    return walletConnect({ projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, showQrModal: true })
  }
  return null
}

/**
 * The key wagmi keeps its state under in localStorage (D274). Every builder preview is served from the
 * builder's own origin (`/api/preview/<project>/…`), so with wagmi's default key ("wagmi") all previews
 * and the builder's own wallet share one record of "the connected wallet": a preview picked up the
 * person's real wallet as already connected and ignored the test wallet they chose. The preview's
 * path prefix makes the key its own; the live site (no prefix) keeps wagmi's default.
 */
export function walletStorageKey(basePath: string = process.env.NEXT_PUBLIC_BASE_PATH ?? ''): string {
  const scope = basePath.replace(/[^A-Za-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
  return scope ? `wagmi.${scope}` : 'wagmi'
}

function browserStorage(): Storage | typeof noopStorage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    // storage blocked (a sandboxed frame, private mode): nothing is remembered
  }
  return noopStorage
}

/**
 * Which connectors the app offers (D274). On the preview's local chain (31337) with test wallets,
 * only the test wallets: a real wallet can't use that chain, and offering it only asks the person's
 * own wallet to switch to a network it doesn't have. Otherwise injected wallets, WalletConnect when
 * configured, then any extra connectors.
 */
export function walletConnectors(chainId: number, extra: CreateConnectorFn[], real: () => CreateConnectorFn[]): CreateConnectorFn[] {
  if (chainId === 31337 && extra.length) return [...extra]
  return [...real(), ...extra]
}

/**
 * A wagmi config for the app's one chain (NEXT_PUBLIC_CHAIN_ID) with:
 *  - injected wallets (MetaMask, Rabby, Coinbase extension, ...)
 *  - WalletConnect, when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set
 *  - any extra connectors, e.g. the devchain preview wallets (Alice, Bob, Carol) in preview builds only.
 * In a preview with test wallets those are the only connectors, and wallets that announce themselves
 * (EIP-6963) are not looked for, so no real wallet is offered or touched (D274).
 * Skip this if the project already has a wagmi config (template or chain module); the components only need a WagmiProvider.
 */
export function createWalletConfig(opts: { extraConnectors?: CreateConnectorFn[] } = {}) {
  const chain = getChain()
  const extra = opts.extraConnectors ?? []
  const testOnly = getChainId() === 31337 && extra.length > 0
  const connectors = walletConnectors(getChainId(), extra, () => {
    const real: CreateConnectorFn[] = [injected()]
    const walletConnect = walletConnectConnector()
    if (walletConnect) real.push(walletConnect)
    return real
  })
  return createConfig({
    chains: [chain],
    connectors,
    multiInjectedProviderDiscovery: !testOnly,
    storage: createStorage({ key: walletStorageKey(), storage: browserStorage() }),
    transports: { [getChainId()]: http(getRpcUrl()) },
    ssr: true,
  })
}
