/** Tiny cookie helpers so the route handlers work on any standard Request/Response. */

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim())
  }
  return undefined
}

export interface CookieOptions {
  maxAgeSeconds: number
  httpOnly?: boolean
  path?: string
  sameSite?: 'Lax' | 'Strict' | 'None'
  secure?: boolean
}

export function serializeCookie(name: string, value: string, opts: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path ?? '/'}`, `Max-Age=${opts.maxAgeSeconds}`]
  if (opts.httpOnly !== false) parts.push('HttpOnly')
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`)
  if (opts.secure ?? process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

export const clearCookie = (name: string) => serializeCookie(name, '', { maxAgeSeconds: 0 })
