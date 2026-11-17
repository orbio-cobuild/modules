/**
 * Key issuance.
 * - Owner: POST /api/agent/keys { label, scopes, ownerWallet? } and DELETE /api/agent/keys?prefix=…,
 *   with `Authorization: Bearer <APP_ADMIN_TOKEN>`. Without APP_ADMIN_TOKEN the route is a 404.
 * - Self-registration (only if config.selfRegistration.enabled): POST /api/agent/register { name, wallet? }.
 * A new key is returned once and never stored in plain form.
 */
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { clientSubject, generateApiKey } from './keys'
import type { AgentApiDeps } from './types'

const WALLET = /^0x[0-9a-fA-F]{40}$/
const SCOPE = /^[a-z][a-z0-9:_-]{0,40}$/

function bearerMatches(req: Request, token: string): boolean {
  const got = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${token}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

const cleanLabel = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) : '')

export function createKeyAdminHandlers(getDeps: () => Pick<AgentApiDeps, 'keys'>, adminToken: () => string | undefined = () => process.env.APP_ADMIN_TOKEN) {
  const guard = (req: Request) => {
    const token = adminToken()
    if (!token) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    if (!bearerMatches(req, token)) return NextResponse.json({ error: 'Please sign in as the owner.' }, { status: 401 })
    return null
  }

  async function POST(req: Request) {
    const denied = guard(req)
    if (denied) return denied
    const body = (await req.json().catch(() => ({}))) as { label?: unknown; scopes?: unknown; ownerWallet?: unknown }
    const label = cleanLabel(body.label)
    const scopes = Array.isArray(body.scopes) ? body.scopes.filter((s): s is string => typeof s === 'string' && SCOPE.test(s)) : ['read']
    const ownerWallet = typeof body.ownerWallet === 'string' && WALLET.test(body.ownerWallet) ? body.ownerWallet.toLowerCase() : null
    if (!label) return NextResponse.json({ error: 'Give the key a name.' }, { status: 400 })
    if (scopes.length === 0) return NextResponse.json({ error: 'Give the key at least one scope.' }, { status: 400 })
    const k = generateApiKey()
    await getDeps().keys.issue({ prefix: k.prefix, keyHash: k.hash, label, scopes, ownerWallet, source: 'owner' })
    return NextResponse.json({ key: k.key, prefix: k.prefix, scopes, note: "Save this key now. It won't be shown again." }, { status: 201 })
  }

  async function DELETE(req: Request) {
    const denied = guard(req)
    if (denied) return denied
    const prefix = new URL(req.url).searchParams.get('prefix') ?? ''
    if (!/^[a-z0-9]{8}$/.test(prefix)) return NextResponse.json({ error: 'Say which key to revoke (its 8-character prefix).' }, { status: 400 })
    const revoked = await getDeps().keys.revoke(prefix)
    return NextResponse.json({ revoked }, { status: revoked ? 200 : 404 })
  }

  return { POST, DELETE }
}

export function createRegisterHandler(getDeps: () => Pick<AgentApiDeps, 'keys' | 'rate' | 'settings'>) {
  async function POST(req: Request) {
    const deps = getDeps()
    const reg = deps.settings.selfRegistration
    if (!reg.enabled) return NextResponse.json({ error: 'Agents can’t register themselves here. Ask the owner for a key.' }, { status: 404 })
    const rate = await deps.rate.hit(`register:${clientSubject(req)}`, '_register', 3600, reg.perHour)
    if (!rate.allowed) return NextResponse.json({ error: 'Too many registrations from here. Try again later.' }, { status: 429, headers: { 'retry-after': '3600' } })
    const body = (await req.json().catch(() => ({}))) as { name?: unknown; wallet?: unknown }
    const label = cleanLabel(body.name)
    if (!label) return NextResponse.json({ error: 'Send your agent’s name as "name".' }, { status: 400 })
    const ownerWallet = typeof body.wallet === 'string' && WALLET.test(body.wallet) ? body.wallet.toLowerCase() : null
    const k = generateApiKey()
    await deps.keys.issue({ prefix: k.prefix, keyHash: k.hash, label, scopes: reg.scopes, ownerWallet, source: 'self' })
    return NextResponse.json({ key: k.key, prefix: k.prefix, scopes: reg.scopes, note: "Save this key now. It won't be shown again." }, { status: 201 })
  }
  return { POST }
}
