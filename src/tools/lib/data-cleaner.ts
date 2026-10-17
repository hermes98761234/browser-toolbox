// Data Cleaner core: per-column transform rules, empty-row removal and duplicate detection by key.

export type Case = 'keep' | 'lower' | 'upper' | 'title' | 'sentence'
export type Kind = 'text' | 'number' | 'date' | 'digits' | 'email' | 'bool'

export interface ColRule {
  keep: boolean
  rename: string
  case: Case
  kind: Kind
  fill: string // value for empty cells ('' = leave empty)
}

export interface Options {
  trim: boolean
  collapse: boolean // collapse runs of inner whitespace and strip invisible chars
  nulls: boolean // treat "null", "N/A", "-", "none" as empty
  dropEmpty: boolean
  dedupe: boolean
  keys: number[] // columns forming the duplicate key (empty = whole row)
  ignoreCase: boolean
  keepLast: boolean
}

export const defaultRule = (name: string): ColRule => ({ keep: true, rename: name, case: 'keep', kind: 'text', fill: '' })

const NULLS = new Set(['null', 'n/a', 'na', '-', '--', 'none', 'nil', 'undefined', '#n/a', 'nan'])

export function applyCase(s: string, c: Case): string {
  if (c === 'lower') return s.toLowerCase()
  if (c === 'upper') return s.toUpperCase()
  if (c === 'title') return s.toLowerCase().replace(/(^|[\s\-'(/])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
  if (c === 'sentence') return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  return s
}

/** "$1,234.50" → "1234.5", "(12)" → "-12", "1.234,5" (EU) → "1234.5". Unparseable values stay unchanged. */
export function toNumberText(s: string): string {
  let t = s.replace(/[\s $€£¥₴%]/g, '')
  let neg = false
  if (/^\(.*\)$/.test(t)) {
    neg = true
    t = t.slice(1, -1)
  }
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) || /^-?\d+,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  const n = Number(t)
  if (t === '' || !Number.isFinite(n)) return s
  return String(neg ? -n : n)
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const p2 = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${p2(m)}-${p2(d)}` : null
}

/** Normalises common date spellings to ISO YYYY-MM-DD. Slash dates are read day-first when `dayFirst`. */
export function toIsoDate(s: string, dayFirst = false): string {
  const t = s.trim()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t)
  if (m) return iso(+m[1], +m[2], +m[3]) ?? s
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(t)
  if (m) {
    let a = +m[1], b = +m[2]
    const y = m[3].length === 2 ? 2000 + +m[3] - (+m[3] > 50 ? 100 : 0) : +m[3]
    if (a > 12 || (dayFirst && b <= 12)) [a, b] = [b, a]
    return iso(y, a, b) ?? s
  }
  m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/i.exec(t) ?? null
  if (m) {
    const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1
    return mo ? (iso(+m[3], mo, +m[1]) ?? s) : s
  }
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(t)
  if (m) {
    const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1
    return mo ? (iso(+m[3], mo, +m[2]) ?? s) : s
  }
  return s
}

export function toBool(s: string): string {
  const t = s.trim().toLowerCase()
  if (['y', 'yes', 'true', '1', 'on', 'x', '✓'].includes(t)) return 'true'
  if (['n', 'no', 'false', '0', 'off'].includes(t)) return 'false'
  return s
}

export function cleanCell(v: string, r: ColRule, o: Pick<Options, 'trim' | 'collapse' | 'nulls'>, dayFirst = false): string {
  let s = v
  if (o.collapse) s = s.replace(/[​-‍﻿]/g, '').replace(/[\s ]+/g, ' ')
  if (o.trim) s = s.trim()
  if (o.nulls && NULLS.has(s.trim().toLowerCase())) s = ''
  if (s !== '') {
    if (r.kind === 'number') s = toNumberText(s)
    else if (r.kind === 'date') s = toIsoDate(s, dayFirst)
    else if (r.kind === 'digits') s = s.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')
    else if (r.kind === 'email') s = s.trim().toLowerCase().replace(/\s+/g, '')
    else if (r.kind === 'bool') s = toBool(s)
    s = applyCase(s, r.case)
  }
  if (s === '' && r.fill) s = r.fill
  return s
}

export interface Result {
  header: string[]
  rows: string[][]
  srcIndex: number[] // original row index for every output row
  changed: Set<string> // "outRow:outCol" cells whose value changed
  empty: number[] // original indexes of removed empty rows
  dups: { row: number; of: number }[] // original indexes: removed row and the row it duplicates
}

export function clean(header: string[], rows: string[][], rules: ColRule[], o: Options, dayFirst = false): Result {
  const cols = header.map((_, i) => i).filter((i) => rules[i]?.keep !== false)
  const cleaned = rows.map((r) => header.map((_, i) => cleanCell(r[i] ?? '', rules[i] ?? defaultRule(header[i]), o, dayFirst)))
  const empty: number[] = []
  let idx = cleaned.map((_, i) => i)
  const blank = defaultRule('')
  const isEmpty = (i: number) => rows[i].every((v) => cleanCell(v, blank, { ...o, trim: true }) === '')
  if (o.dropEmpty) idx = idx.filter((i) => (isEmpty(i) ? (empty.push(i), false) : true))
  const dups: Result['dups'] = []
  if (o.dedupe) {
    const keyCols = o.keys.length ? o.keys : header.map((_, i) => i)
    const seen = new Map<string, number>()
    const order = o.keepLast ? [...idx].reverse() : idx
    const keep = new Set<number>()
    for (const i of order) {
      let k = JSON.stringify(keyCols.map((c) => cleaned[i][c]))
      if (o.ignoreCase) k = k.toLowerCase()
      const prev = seen.get(k)
      if (prev === undefined) {
        seen.set(k, i)
        keep.add(i)
      } else dups.push({ row: i, of: prev })
    }
    idx = idx.filter((i) => keep.has(i))
  }
  const changed = new Set<string>()
  const out = idx.map((i, ri) =>
    cols.map((c, ci) => {
      if (cleaned[i][c] !== (rows[i][c] ?? '')) changed.add(`${ri}:${ci}`)
      return cleaned[i][c]
    }),
  )
  return { header: cols.map((c) => rules[c]?.rename || header[c]), rows: out, srcIndex: idx, changed, empty, dups: dups.sort((a, b) => a.row - b.row) }
}
