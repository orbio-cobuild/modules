import { z } from 'zod'

/** Config for the auth-wallet module. The pipeline writes the validated value to `src/config/auth-wallet.json`. */
export const configSchema = z.object({
  /**
   * Line shown in the wallet's signing prompt. Plain English, no promises. The shipped
   * src/config/auth-wallet.json always sets it ("Sign in to <project name>…"); this default is
   * only a fallback, with no project placeholder, so the file can ship in @cofounder/modules (D213).
   */
  statement: z.string().min(1).max(200).default('Sign in with your wallet. This is free and does not send a transaction.'),
  /** How long a session lasts, in seconds (default 7 days). */
  sessionTtlSeconds: z.number().int().min(300).max(60 * 60 * 24 * 30).default(60 * 60 * 24 * 7),
  /** How long a sign-in nonce stays valid, in seconds. */
  nonceTtlSeconds: z.number().int().min(60).max(3600).default(600),
  /** Extra hostnames (e.g. a custom domain) accepted as the SIWE `domain`, besides the request's own host. */
  allowedDomains: z.array(z.string().min(1)).default([]),
  /** Record each sign-in in the `wallet_users` table (needs the db module). */
  recordUsers: z.boolean().default(true),
  /** Where the button sends the user after signing in, or null to stay on the page. */
  redirectAfterSignIn: z.string().startsWith('/').nullable().default(null),
})

export type AuthWalletConfig = z.infer<typeof configSchema>
