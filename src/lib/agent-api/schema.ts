/**
 * A small JSON Schema validator for operation inputs, so the template needs no extra dependency.
 * Supported: type (object, string, number, integer, boolean, array, null), properties, required,
 * additionalProperties (boolean), enum, const, minLength, maxLength, pattern, minimum, maximum,
 * items, minItems, maxItems, default (applied to missing object properties).
 * Errors are plain English, e.g. "symbol: must match ^[A-Z]{2,10}$".
 */
import type { JsonSchema } from './types'

const typeOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' && Number.isInteger(v) ? 'integer' : typeof v

function matchesType(v: unknown, t: string): boolean {
  const actual = typeOf(v)
  if (t === 'number') return actual === 'number' || actual === 'integer'
  return actual === t
}

function check(schema: JsonSchema, value: unknown, path: string, errors: string[]): unknown {
  const at = path || 'input'
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type]
  if (types.length && !types.some((t) => matchesType(value, t))) {
    errors.push(`${at}: must be ${types.join(' or ')}`)
    return value
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => e === value)) errors.push(`${at}: must be one of ${schema.enum.map(String).join(', ')}`)
  if ('const' in schema && schema.const !== value) errors.push(`${at}: must be ${String(schema.const)}`)

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) errors.push(`${at}: must be at least ${schema.minLength} characters`)
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) errors.push(`${at}: must be at most ${schema.maxLength} characters`)
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${at}: must match ${schema.pattern}`)
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${at}: must be ${schema.minimum} or more`)
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${at}: must be ${schema.maximum} or less`)
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errors.push(`${at}: needs at least ${schema.minItems} items`)
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push(`${at}: allows at most ${schema.maxItems} items`)
    const items = schema.items as JsonSchema | undefined
    if (items) return value.map((v, i) => check(items, v, `${at}[${i}]`, errors))
  }
  if (typeOf(value) === 'object') {
    const obj = { ...(value as Record<string, unknown>) }
    const props = (schema.properties ?? {}) as Record<string, JsonSchema>
    for (const req of (schema.required as string[] | undefined) ?? []) {
      if (obj[req] === undefined) errors.push(`${path ? path + '.' : ''}${req}: is required`)
    }
    for (const [k, v] of Object.entries(obj)) {
      const sub = props[k]
      if (sub) obj[k] = check(sub, v, path ? `${path}.${k}` : k, errors)
      else if (schema.additionalProperties === false) errors.push(`${path ? path + '.' : ''}${k}: isn't an accepted field`)
    }
    for (const [k, sub] of Object.entries(props)) {
      if (obj[k] === undefined && sub.default !== undefined) obj[k] = sub.default
    }
    return obj
  }
  return value
}

export function validateInput(schema: JsonSchema, value: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const input = value === undefined || value === null ? {} : value
  if (typeOf(input) !== 'object') return { ok: false, errors: ['input: must be a JSON object'] }
  const out = check({ ...schema, type: 'object' }, input, '', errors)
  return errors.length ? { ok: false, errors } : { ok: true, value: out as Record<string, unknown> }
}

/** Query-string values are all strings; turn them into the types the schema expects. */
export function coerceQuery(schema: JsonSchema, params: URLSearchParams): Record<string, unknown> {
  const props = (schema.properties ?? {}) as Record<string, JsonSchema>
  const out: Record<string, unknown> = {}
  for (const [k, raw] of params) {
    const t = props[k]?.type
    const types = Array.isArray(t) ? t : t ? [t] : []
    if ((types.includes('integer') || types.includes('number')) && raw.trim() !== '' && !Number.isNaN(Number(raw))) out[k] = Number(raw)
    else if (types.includes('boolean') && (raw === 'true' || raw === 'false')) out[k] = raw === 'true'
    else out[k] = raw
  }
  return out
}
