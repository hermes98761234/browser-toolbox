// Word splitting and case transforms.

/** Splits identifiers and prose into words: handles camelCase, PascalCase, ACRONYMS, digits and separators. */
export function splitWords(s: string): string[] {
  return (
    s
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-zA-Z])(\d)/g, '$1 $2')
      .replace(/(\d)([a-zA-Z])/g, '$1 $2')
      .match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) ?? []
  )
}

/** Same as splitWords but keeps letter–digit runs together (e.g. "utf8", "v2"). */
const idWords = (s: string) =>
  s
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .match(/[\p{L}\p{N}]+/gu) ?? []

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
const SMALL = new Set('a an and as at but by en for if in nor of on or per the to v vs via with'.split(' '))

/** Title Case (Chicago-style): small words stay lowercase unless first or last; ALL-CAPS acronyms kept. */
export function titleCase(s: string): string {
  const parts = s.split(/(\s+|-)/)
  const wordIdx = parts.map((p, i) => (/[\p{L}\p{N}]/u.test(p) ? i : -1)).filter((i) => i >= 0)
  const first = wordIdx[0], last = wordIdx[wordIdx.length - 1]
  return parts
    .map((p, i) => {
      if (!/[\p{L}\p{N}]/u.test(p)) return p
      if (/^[A-Z\d]{2,}$/.test(p.replace(/[^\p{L}\p{N}]/gu, ''))) return p
      const lead = p.match(/^[^\p{L}\p{N}]*/u)![0]
      const core = p.slice(lead.length)
      const lower = core.toLowerCase()
      const prevEnd = i > 0 && /[:.!?]\s*$/.test(parts.slice(0, i).join(''))
      if (i !== first && i !== last && !prevEnd && SMALL.has(lower.replace(/[^\p{L}]/gu, ''))) return lead + lower
      return lead + cap(core)
    })
    .join('')
}

export function sentenceCase(s: string): string {
  return s.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\bi\b/g, 'I')
}

export interface CaseDef {
  id: string
  name: string
  fn: (s: string) => string
}

/** Prose cases on a bare identifier ("getUserName") first spell it out as words. */
const prose = (f: (s: string) => string) => (s: string) =>
  !/\s/.test(s.trim()) && /[_\-.]|[a-z][A-Z]/.test(s) ? f(idWords(s).join(' ').toLowerCase()) : f(s)

const join = (sep: string, f: (w: string, i: number) => string) => (s: string) => idWords(s).map(f).join(sep)

export const CASES: CaseDef[] = [
  { id: 'title', name: 'Title Case', fn: prose(titleCase) },
  { id: 'sentence', name: 'Sentence case', fn: prose(sentenceCase) },
  { id: 'lower', name: 'lower case', fn: (s) => s.toLowerCase() },
  { id: 'upper', name: 'UPPER CASE', fn: (s) => s.toUpperCase() },
  { id: 'capital', name: 'Capitalize Each Word', fn: prose((s) => s.replace(/[\p{L}\p{N}]+(?:['’]\p{L}+)*/gu, cap)) },
  { id: 'camel', name: 'camelCase', fn: join('', (w, i) => (i ? cap(w) : w.toLowerCase())) },
  { id: 'pascal', name: 'PascalCase', fn: join('', cap) },
  { id: 'snake', name: 'snake_case', fn: join('_', (w) => w.toLowerCase()) },
  { id: 'constant', name: 'CONSTANT_CASE', fn: join('_', (w) => w.toUpperCase()) },
  { id: 'kebab', name: 'kebab-case', fn: join('-', (w) => w.toLowerCase()) },
  { id: 'train', name: 'Train-Case', fn: join('-', cap) },
  { id: 'dot', name: 'dot.case', fn: join('.', (w) => w.toLowerCase()) },
  { id: 'path', name: 'path/case', fn: join('/', (w) => w.toLowerCase()) },
  { id: 'flat', name: 'flatcase', fn: join('', (w) => w.toLowerCase()) },
  { id: 'inverse', name: 'iNVERSE cASE', fn: (s) => [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('') },
  { id: 'alt', name: 'aLtErNaTiNg', fn: (s) => { let i = 0; return [...s].map((c) => (/\p{L}/u.test(c) ? (i++ % 2 ? c.toUpperCase() : c.toLowerCase()) : c)).join('') } },
]

/** Applies a case to the whole text, or to every line separately. */
export function convert(text: string, id: string, perLine: boolean): string {
  const def = CASES.find((c) => c.id === id) ?? CASES[0]
  return perLine ? text.split('\n').map(def.fn).join('\n') : def.fn(text)
}

/** Guesses the case style of a single identifier / phrase. */
export function detect(s: string): string {
  const t = s.trim()
  if (!t) return '—'
  if (/^[a-z][a-z\d]*(?:[A-Z][a-z\d]*)+$/.test(t)) return 'camelCase'
  if (/^(?:[A-Z][a-z\d]+){2,}$/.test(t)) return 'PascalCase'
  if (/^[a-z\d]+(?:_[a-z\d]+)+$/.test(t)) return 'snake_case'
  if (/^[A-Z\d]+(?:_[A-Z\d]+)+$/.test(t)) return 'CONSTANT_CASE'
  if (/^[a-z\d]+(?:-[a-z\d]+)+$/.test(t)) return 'kebab-case'
  if (/^[A-Z][a-z\d]*(?:-[A-Z][a-z\d]*)+$/.test(t)) return 'Train-Case'
  if (/^[a-z\d]+(?:\.[a-z\d]+)+$/.test(t)) return 'dot.case'
  if (t === t.toUpperCase() && /\p{L}/u.test(t)) return 'UPPER CASE'
  if (t === t.toLowerCase()) return 'lower case'
  if (t === titleCase(t)) return 'Title Case'
  if (t === sentenceCase(t)) return 'Sentence case'
  return 'Mixed'
}
