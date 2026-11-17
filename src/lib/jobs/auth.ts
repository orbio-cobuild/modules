import { timingSafeEqual } from 'node:crypto'

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * True when the request carries `Authorization: Bearer <CRON_SECRET>`.
 * Vercel sends exactly this to cron paths when CRON_SECRET is set on the project.
 * Fails closed when the secret isn't set.
 */
export function verifyCronRequest(req: Request, secret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secret || secret.length < 16) return false
  return safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`)
}
