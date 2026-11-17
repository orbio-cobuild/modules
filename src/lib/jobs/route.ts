/**
 * Route handlers for a job. In src/app/api/jobs/<name>/route.ts (or a (project) route group):
 *
 *   import { createJobRoute } from '@/lib/jobs/route'
 *   import { myJob } from '@/jobs/my-job'
 *   export const dynamic = 'force-dynamic'
 *   export const maxDuration = 60
 *   export const { GET, POST } = createJobRoute(myJob)
 *
 * GET  = the cron tick (Vercel cron calls GET).
 * POST = a manual run: { "key"?: string, "trigger"?: "manual" | "check" }.
 * Both need `Authorization: Bearer <CRON_SECRET>`.
 */
import { NextResponse } from 'next/server'
import { createServerDb } from '@/lib/db/server'
import { verifyCronRequest } from './auth'
import { runJob, runScheduled } from './runner'
import { supabaseJobStore, type JobStore } from './store'
import type { JobDefinition, RunOutcome } from './types'

export interface JobRouteOptions {
  store?: () => JobStore
  secret?: () => string | undefined
  now?: () => Date
}

const httpStatus = (o: RunOutcome) => (o.status === 'failed' || o.status === 'dead' ? 500 : 200)
const deny = () => NextResponse.json({ error: 'Not allowed.' }, { status: 401 })

export function createJobRoute(job: JobDefinition, opts: JobRouteOptions = {}) {
  const store = () => (opts.store ? opts.store() : supabaseJobStore(createServerDb()))
  const allowed = (req: Request) => verifyCronRequest(req, opts.secret ? opts.secret() : process.env.CRON_SECRET)
  const now = () => (opts.now ? opts.now() : new Date())

  async function GET(req: Request) {
    if (!allowed(req)) return deny()
    const { current, retries } = await runScheduled(job, { store: store(), now: now() })
    return NextResponse.json({ ok: httpStatus(current) === 200, current, retries }, { status: httpStatus(current) })
  }

  async function POST(req: Request) {
    if (!allowed(req)) return deny()
    const body = (await req.json().catch(() => ({}))) as { key?: unknown; trigger?: unknown }
    const key = typeof body.key === 'string' && body.key.length > 0 && body.key.length <= 200 ? body.key : undefined
    const trigger = body.trigger === 'check' ? 'check' : 'manual'
    const at = now()
    const current = await runJob(job, { store: store(), now: at, trigger, key: key ?? `${job.name}:manual:${at.toISOString().slice(0, 16)}Z` })
    return NextResponse.json({ ok: httpStatus(current) === 200, current }, { status: httpStatus(current) })
  }

  return { GET, POST }
}
