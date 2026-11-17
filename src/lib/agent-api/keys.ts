/** Agent API keys: `ak_<8-char prefix>_<secret>`. Only the sha256 of the whole key is stored. */
import { createHash, randomBytes } from 'node:crypto'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const KEY = /^ak_([a-z0-9]{8})_([A-Za-z0-9_-]{32,})$/

function randomString(n: number): string {
  const bytes = randomBytes(n)
  let out = ''
  for (let i = 0; i < n; i++) out += ALPHABET[bytes[i]! % ALPHABET.length]
  return out
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex')
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const prefix = randomString(8)
  const key = `ak_${prefix}_${randomBytes(24).toString('base64url')}`
  return { key, prefix, hash: hashApiKey(key) }
}

export function parseApiKey(key: string): { prefix: string } | null {
  const m = KEY.exec(key)
  return m ? { prefix: m[1]! } : null
}

/** Reads `Authorization: Bearer ak_…` or `X-API-Key: ak_…`. */
export function apiKeyFromRequest(req: Request): string | null {
  const auth = req.headers.get('authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim() || null
  return req.headers.get('x-api-key')?.trim() || null
}

/** Hash of the caller's IP, for rate limits and logs without storing the IP. */
export function clientSubject(req: Request): string {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  return createHash('sha256').update(`ip:${ip}`).digest('hex').slice(0, 32)
}
