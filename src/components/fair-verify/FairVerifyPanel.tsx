'use client'

import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { getChainId, getPublicClient } from '@/lib/fair-verify/chain'
import { getFairVerifyConfig } from '@/lib/fair-verify/config'
import { sampleRound, sampleRoundsEnabled } from '@/lib/fair-verify/sample'
import { checkRound, verifyRoundOnChain, type VerifyReport } from '@/lib/fair-verify/verify'

const ICON = { pass: '✓', fail: '✗', skipped: '–' } as const

/**
 * Verifies one round entirely in the visitor's browser: it reads the round from the chain through the public RPC
 * and recomputes the result locally. Our server is not involved, so visitors don't have to trust it.
 */
export function FairVerifyPanel({ roundId }: { roundId: string }) {
  const [report, setReport] = useState<VerifyReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const config = getFairVerifyConfig()
        const chainId = getChainId()
        if (!/^\d{1,30}$/.test(roundId)) throw new Error('That round number is not valid.')
        const id = BigInt(roundId)
        let r: VerifyReport
        if (sampleRoundsEnabled()) {
          const round = sampleRound(id, chainId)
          r = round ? checkRound(round, config.outcome, round.lockBlockHash) : { verdict: 'not_found', summary: `There is no sample round ${id}. Try 1 to 5.`, checks: [] }
        } else {
          const contract = config.contractByChain[String(chainId)] as Address | undefined
          if (!contract) throw new Error("This app's fairness contract isn't set up on this network yet.")
          r = await verifyRoundOnChain(getPublicClient(), { contract, roundId: id, chainId, outcome: config.outcome })
        }
        if (!cancelled) setReport(r)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong checking this round.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [roundId])

  if (error) return <p className="text-red-600" role="alert">{error}</p>
  if (!report) return <p className="text-muted-foreground">Checking round {roundId} on the network…</p>

  const tone = report.verdict === 'verified' ? 'border-green-600 bg-green-50 dark:bg-green-950' : report.verdict === 'failed' ? 'border-red-600 bg-red-50 dark:bg-red-950' : 'border-muted'
  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-lg border-2 p-4 ${tone}`} role="status">
        <p className="font-medium">{report.summary}</p>
        {report.outcome && (
          <p className="mt-2 text-2xl font-semibold">
            {report.outcome.label}: {report.outcome.value}
          </p>
        )}
        {sampleRoundsEnabled() && <p className="mt-1 text-xs text-amber-700">Sample round for this preview.</p>}
      </div>

      {report.checks.length > 0 && (
        <ol className="flex flex-col gap-2">
          {report.checks.map((c) => (
            <li key={c.id} className="rounded-md border p-3">
              <p className="text-sm font-medium">
                <span aria-hidden className={c.status === 'pass' ? 'text-green-600' : c.status === 'fail' ? 'text-red-600' : 'text-muted-foreground'}>{ICON[c.status]}</span>{' '}
                {c.label} <span className="sr-only">({c.status})</span>
              </p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{c.detail}</p>
            </li>
          ))}
        </ol>
      )}

      {report.outcome && <p className="text-sm text-muted-foreground">How the result becomes the outcome: {report.outcome.formula}.</p>}

      {report.round && report.round.status === 'Revealed' && (
        <details className="text-sm">
          <summary className="cursor-pointer">Raw values (to check it yourself)</summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-all font-mono text-xs">
            <dt>contract</dt><dd>{report.round.contract}</dd>
            <dt>chain</dt><dd>{report.round.chainId}</dd>
            <dt>round</dt><dd>{report.round.roundId.toString()}</dd>
            <dt>commitment</dt><dd>{report.round.commitment}</dd>
            <dt>seed</dt><dd>{report.round.seed}</dd>
            <dt>lock block</dt><dd>{report.round.lockBlock.toString()}</dd>
            <dt>lock block hash</dt><dd>{report.round.lockBlockHash}</dd>
            <dt>result</dt><dd>{report.round.result}</dd>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            commitment = keccak256(abi.encodePacked(seed)); result = keccak256(abi.encode(seed, lockBlockHash, round, contract, chain)).
          </p>
        </details>
      )}
    </div>
  )
}
