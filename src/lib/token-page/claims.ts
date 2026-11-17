/**
 * Banned-claims scan for token copy. Token pages describe what the token is; they never promise
 * price moves, returns or profit (CLAUDE.md guardrails). Used by checks.ts and by project code.
 */
const BANNED: Array<[RegExp, string]> = [
  [/\bguarantee(d|s)?\b/i, 'guarantee'],
  [/\b(returns|return on|high returns?)\b/i, 'returns'],
  [/\bprofit(s|able)?\b/i, 'profit'],
  [/\bmoon(ing|shot)?\b/i, 'moon'],
  [/\b\d{2,}x\b/i, 'multiplier (e.g. 100x)'],
  [/\binvest(ment|ments|ing|ors?)?\b/i, 'investment'],
  [/\bpassive income\b/i, 'passive income'],
  [/\brisk[- ]free\b/i, 'risk-free'],
  [/\b(can'?t|cannot|won'?t) lose\b/i, "can't lose"],
  [/\bget rich\b/i, 'get rich'],
  [/\bprice (will|is going to)\b/i, 'price prediction'],
  [/\b(apy|apr)\b/i, 'APY/APR'],
  [/\blambo\b/i, 'lambo'],
  [/\bto the moon\b/i, 'to the moon'],
]

export interface ClaimHit {
  phrase: string
  excerpt: string
}

export function findBannedClaims(text: string): ClaimHit[] {
  const hits: ClaimHit[] = []
  for (const [re, phrase] of BANNED) {
    const m = re.exec(text)
    if (m) hits.push({ phrase, excerpt: text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).replace(/\s+/g, ' ').trim() })
  }
  return hits
}

/**
 * Roughly the text a user would see in a source file: string literals and JSX text, without comments,
 * imports, classNames or URLs. Good enough for a checker; the claims filter agent does the real pass.
 */
export function visibleText(source: string): string {
  const src = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^\s*(import|export \* from|export \{[^}]*\} from).*$/gm, ' ')
    .replace(/className=(\{`[^`]*`\}|"[^"]*"|'[^']*')/g, ' ')
  const parts: string[] = []
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) parts.push(m[1] ?? m[2] ?? m[3] ?? '')
  for (const m of src.matchAll(/>([^<>{}]+)</g)) parts.push(m[1]!)
  return parts.filter((p) => !/^https?:\/\//.test(p.trim())).join('\n')
}
