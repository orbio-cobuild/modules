/**
 * Claims filter (CLAUDE.md guardrail): agent-written text must not claim token price moves, returns or
 * profit. Deterministic rules only; the platform's LLM claims pass can run on top.
 * Flagged sentences are replaced in the public version; flagged outbound text is never sent.
 */
export interface ClaimRule {
  id: string
  pattern: RegExp
}

export const CLAIM_RULES: ClaimRule[] = [
  { id: 'guarantee', pattern: /\b(guaranteed?|risk[- ]free|can'?t lose|cannot lose|sure thing|no[- ]brainer)\b/i },
  { id: 'moon', pattern: /\b(to the moon|moon(ing|shot)?|will pump|pump(ing)? soon|going parabolic|send it|lambo)\b/i },
  { id: 'multiplier', pattern: /\b\d{1,4}\s?x\s+(gains?|returns?|profit|potential|from here|soon)\b|\b(10|20|50|100|1000)x\b(?!\s+(faster|slower|cheaper|smaller|larger|bigger|more efficient))/i },
  {
    id: 'price-prediction',
    pattern:
      /(?:\b(?:price|token|coin|it)|\$[A-Za-z]{2,10})\s+(will|is going to|gonna|should|could easily)\s+(hit|reach|go up|rise|climb|double|triple|moon|pump|soar|explode|skyrocket|rally)\b|\bprice target\b/i,
  },
  {
    id: 'returns',
    pattern:
      /\b(guaranteed|expected|high|huge|massive|daily|weekly|monthly|annual|passive|stable)\s+(returns?|profits?|yields?|gains?|income)\b|\b(returns?|profits?|gains?|yields?|roi|apy|apr)\s+(of|up to|around|over)\s+\d|\b\d+(\.\d+)?\s?%\s+(apy|apr|returns?|profits?|gains?|yields?|roi)\b/i,
  },
  { id: 'investment', pattern: /\b(great|good|solid|safe|smart|best)\s+investment\b|\binvestment opportunity\b|\bbuy (it )?now\b|\bdon'?t miss (out|this)\b|\bget rich\b/i },
]

export interface ClaimsResult {
  ok: boolean
  /** Rule ids that matched. */
  flags: string[]
  /** The text with flagged sentences replaced. */
  redacted: string
}

export const REDACTION = '[Removed: this app does not publish claims about price, returns or profit.]'

export function checkClaims(text: string | null | undefined, rules: ClaimRule[] = CLAIM_RULES): ClaimsResult {
  if (!text) return { ok: true, flags: [], redacted: text ?? '' }
  const flags = new Set<string>()
  const sentences = text.split(/(?<=[.!?])\s+/)
  const kept = sentences.map((s) => {
    const hits = rules.filter((r) => r.pattern.test(s)).map((r) => r.id)
    hits.forEach((h) => flags.add(h))
    return hits.length ? REDACTION : s
  })
  // collapse repeated redactions
  const redacted = kept.filter((s, i) => !(s === REDACTION && kept[i - 1] === REDACTION)).join(' ')
  return { ok: flags.size === 0, flags: [...flags], redacted }
}

/** Runs checkClaims on the named string fields of an object; returns a redacted copy and all flags. */
export function redactFields<T extends Record<string, unknown>>(obj: T, fields: readonly string[]): { value: T; flags: string[] } {
  const out: Record<string, unknown> = { ...obj }
  const flags = new Set<string>()
  for (const f of fields) {
    const v = out[f]
    if (typeof v !== 'string') continue
    const r = checkClaims(v)
    r.flags.forEach((x) => flags.add(x))
    out[f] = r.redacted
  }
  return { value: out as T, flags: [...flags] }
}
