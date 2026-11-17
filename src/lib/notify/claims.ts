/**
 * Claims filter and token detection for outbound text (CLAUDE.md guardrails).
 * - checkClaims: blocks price, returns, profit, "guaranteed" and investment language. Blocked text is never sent.
 * - isTokenRelated: token-related text always needs human approval and can't be pre-approved.
 */

const RULES: Array<[RegExp, string]> = [
  [/\bguarantee(d|s)?\b|\brisk[- ]?free\b|\bno risk\b|\bcan(?:'|’)?t lose\b|\bcannot lose\b|\bsure thing\b/i, 'Guarantees an outcome'],
  [/\breturns?\b(?! (?:policy|label|address))|\bprofits?\b|\bprofitable\b|\bROI\b|\bAPY\b|\bAPR\b|\byield(s|ing)?\b|\bearn(ings)? up to\b/i, 'Promises returns or profit'],
  [/\b\d+(\.\d+)?\s?x\b(?!\s?(faster|cheaper|more|smaller|bigger))|\bto the moon\b|\bmoon(ing)?\b|\bpump(ing|ed)?\b|\bprice (will|is going to|target)\b|\bgoing to (go up|rise|explode)\b|\bnext \d+x\b/i, 'Predicts the price'],
  [/\binvest(ment|ments|ing|or|ors)?\b|\bpassive income\b|\bget rich\b|\bfinancial freedom\b|\bbuy (now|before)\b|\bdon(?:'|’)?t miss out\b|\bfomo\b/i, 'Reads like investment advice'],
]

export function checkClaims(text: string): { ok: boolean; reasons: string[] } {
  const reasons = RULES.filter(([re]) => re.test(text)).map(([, why]) => why)
  return { ok: reasons.length === 0, reasons }
}

const TOKEN_WORDS =
  /\$[A-Za-z][A-Za-z0-9]{1,9}\b|\btokens?\b|\bprice\b|\bbuy(ing|s)?\b|\bsell(ing|s)?\b|\blaunch(ed|es|ing)?\b|\bairdrop\b|\bpre-?sale\b|\bstak(e|ed|ing)\b|\bmarket ?cap\b|\bmcap\b|\bchart\b|\bliquidity\b|\btrading\b|\bswap\b|\bcontract address\b|\bholders?\b|\btreasury\b|\bbuyback\b/i
const TOKEN_CASED = /\bCREDIT\b|\bCA\b|\bORBIO\b|\bUSDG\b/

export function isTokenRelated(text: string): boolean {
  return TOKEN_WORDS.test(text) || TOKEN_CASED.test(text)
}
