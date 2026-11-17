/**
 * Keys derived from ORBIO_AUTH_SECRET with HKDF-SHA256, one per purpose:
 *  - "session"  HS256 key for the session cookie
 *  - "flow"     AES-256-GCM key for the short-lived login cookie (PKCE verifier, state, nonce)
 *  - "tokens"   AES-256-GCM key for access and refresh tokens at rest
 * Uses Web Crypto only, so it runs on the Node and Edge runtimes.
 */

const enc = new TextEncoder()
const dec = new TextDecoder()

type Bytes = Uint8Array<ArrayBuffer>

function secret(): Bytes {
  const s = process.env.ORBIO_AUTH_SECRET
  if (!s || s.length < 32) throw new Error('Sign in with Orbio is not set up yet: ORBIO_AUTH_SECRET must be at least 32 characters.')
  return new Uint8Array(enc.encode(s))
}

const cache = new Map<string, Promise<Bytes>>()

export function deriveKeyBytes(purpose: 'session' | 'flow' | 'tokens'): Promise<Bytes> {
  const raw = secret()
  const id = `${purpose}:${dec.decode(raw)}`
  let p = cache.get(id)
  if (!p) {
    p = (async () => {
      const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits'])
      const bits = await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('cofounder-auth-orbio-v1'), info: enc.encode(purpose) },
        base,
        256,
      )
      return new Uint8Array(bits)
    })()
    cache.set(id, p)
  }
  return p
}

const b64u = {
  encode: (b: Uint8Array) => Buffer.from(b).toString('base64url'),
  decode: (s: string): Bytes => new Uint8Array(Buffer.from(s, 'base64url')),
}

/** AES-256-GCM. `aad` binds the ciphertext to its row (the session id), so it can't be swapped into another row. */
export async function encryptToken(plaintext: string, aad: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', await deriveKeyBytes('tokens'), 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(plaintext))
  return `v1.${b64u.encode(iv)}.${b64u.encode(new Uint8Array(ct))}`
}

export async function decryptToken(blob: string, aad: string): Promise<string> {
  const [v, iv, ct] = blob.split('.')
  if (v !== 'v1' || !iv || !ct) throw new Error('Unreadable stored token')
  const key = await crypto.subtle.importKey('raw', await deriveKeyBytes('tokens'), 'AES-GCM', false, ['decrypt'])
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64u.decode(iv), additionalData: enc.encode(aad) }, key, b64u.decode(ct))
  return dec.decode(pt)
}

/** PKCE (RFC 7636), S256 only. */
export function randomUrlSafe(bytes = 32): string {
  return b64u.encode(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return b64u.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier))))
}
