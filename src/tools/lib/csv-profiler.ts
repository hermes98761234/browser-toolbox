// CSV parsing and per-column profiling (type inference, missing values, distributions).

export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 20000).split(/\r?\n/).slice(0, 20)
  let best = ',', bestScore = -1
  for (const d of [',', ';', '\t', '|']) {
    const counts = sample.map((l) => splitLine(l, d).length)
    if (counts[0] < 2) continue
    const same = counts.filter((c) => c === counts[0]).length
    const score = same * 10 + counts[0]
    if (score > bestScore) { bestScore = score; best = d }
  }
  return best
}

function splitLine(line: string, d: string): string[] {
  return parseCsv(line, d)[0] ?? []
}

/** RFC 4180 parser: quotes, escaped quotes, newlines inside quotes. */
export function parseCsv(text: string, delim = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else q = false
      } else field += c
    } else if (c === '"' && field === '') q = true
    else if (c === delim) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

export type ColType = 'integer' | 'number' | 'boolean' | 'date' | 'text' | 'empty'

const MISSING = new Set(['', 'na', 'n/a', 'null', 'none', 'nan', '-', '?', 'missing'])
export const isMissing = (v: string) => MISSING.has(v.trim().toLowerCase())
const BOOL = new Set(['true', 'false', 'yes', 'no', 't', 'f', 'y', 'n'])
const NUM = /^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?([eE][-+]?\d+)?$/
export function toNumber(v: string): number {
  const t = v.trim().replace(/^\$|%$/g, '')
  if (!t || !NUM.test(t) || t === '.' || t === '+' || t === '-') return NaN
  return Number(t.replace(/,/g, ''))
}
const DATE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$|^\d{1,2}[/.]\d{1,2}[/.]\d{4}$/
export function toDate(v: string): number {
  const t = v.trim()
  if (!DATE.test(t)) return NaN
  if (/^\d{1,2}[/.]\d{1,2}[/.]\d{4}$/.test(t)) {
    const [a, b, y] = t.split(/[/.]/).map(Number)
    // assume month/day unless first part > 12
    const [m, d] = a > 12 ? [b, a] : [a, b]
    return Date.UTC(y, m - 1, d)
  }
  return Date.parse(t.length === 10 ? t + 'T00:00:00Z' : t)
}

export function inferType(values: string[]): ColType {
  const v = values.filter((x) => !isMissing(x))
  if (!v.length) return 'empty'
  const share = (f: (x: string) => boolean) => v.filter(f).length / v.length
  if (share((x) => BOOL.has(x.trim().toLowerCase())) === 1 && new Set(v.map((x) => x.trim().toLowerCase())).size <= 2) return 'boolean'
  if (share((x) => Number.isFinite(toNumber(x))) >= 0.95) return share((x) => Number.isInteger(toNumber(x))) === 1 ? 'integer' : 'number'
  if (share((x) => Number.isFinite(toDate(x))) >= 0.95) return 'date'
  return 'text'
}

export interface Profile {
  name: string
  type: ColType
  count: number
  missing: number
  unique: number
  top: [string, number][]
  min?: number
  max?: number
  mean?: number
  median?: number
  std?: number
  q1?: number
  q3?: number
  zeros?: number
  outliers?: number
  minLen?: number
  maxLen?: number
  hist?: { x0: number; x1: number; n: number }[]
  invalid: number
}

export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i), hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

export function histogram(sorted: number[], bins?: number): { x0: number; x1: number; n: number }[] {
  if (!sorted.length) return []
  const lo = sorted[0], hi = sorted[sorted.length - 1]
  if (lo === hi) return [{ x0: lo, x1: hi, n: sorted.length }]
  // Freedman–Diaconis, bounded to 5..30 bins
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25)
  const fd = iqr > 0 ? Math.ceil((hi - lo) / (2 * iqr * Math.cbrt(sorted.length))) : Math.ceil(Math.sqrt(sorted.length))
  const k = bins ?? Math.max(sorted.length >= 50 ? 10 : 5, Math.min(30, fd))
  const w = (hi - lo) / k
  const out = Array.from({ length: k }, (_, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, n: 0 }))
  for (const v of sorted) out[Math.min(k - 1, Math.floor((v - lo) / w))].n++
  return out
}

export function profileColumn(name: string, values: string[]): Profile {
  const type = inferType(values)
  const present = values.filter((x) => !isMissing(x))
  const freq = new Map<string, number>()
  for (const v of present) freq.set(v.trim(), (freq.get(v.trim()) ?? 0) + 1)
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10)
  const p: Profile = { name, type, count: values.length, missing: values.length - present.length, unique: freq.size, top, invalid: 0 }
  if (type === 'integer' || type === 'number' || type === 'date') {
    const conv = type === 'date' ? toDate : toNumber
    const nums = present.map(conv)
    const ok = nums.filter(Number.isFinite).sort((a, b) => a - b)
    p.invalid = nums.length - ok.length
    const n = ok.length
    const mean = ok.reduce((a, b) => a + b, 0) / n
    p.min = ok[0]
    p.max = ok[n - 1]
    p.mean = mean
    p.median = quantile(ok, 0.5)
    p.q1 = quantile(ok, 0.25)
    p.q3 = quantile(ok, 0.75)
    p.std = n > 1 ? Math.sqrt(ok.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0
    if (type !== 'date') {
      p.zeros = ok.filter((x) => x === 0).length
      const iqr = p.q3 - p.q1
      p.outliers = ok.filter((x) => x < p.q1! - 1.5 * iqr || x > p.q3! + 1.5 * iqr).length
    }
    p.hist = histogram(ok)
  } else if (type === 'text') {
    const lens = present.map((x) => x.length)
    p.minLen = Math.min(...lens)
    p.maxLen = Math.max(...lens)
  }
  return p
}

export interface Dataset {
  header: string[]
  rows: string[][]
}

export function toDataset(text: string, delim?: string, hasHeader = true): Dataset {
  const d = delim ?? detectDelimiter(text)
  const all = parseCsv(text.replace(/^﻿/, ''), d)
  if (!all.length) return { header: [], rows: [] }
  const width = Math.max(...all.map((r) => r.length))
  const head = hasHeader ? all[0] : Array.from({ length: width }, (_, i) => `col${i + 1}`)
  const header = Array.from({ length: width }, (_, i) => (head[i]?.trim() || `col${i + 1}`))
  const rows = (hasHeader ? all.slice(1) : all).map((r) => (r.length < width ? [...r, ...new Array<string>(width - r.length).fill('')] : r))
  return { header, rows }
}

export function profileDataset(ds: Dataset): Profile[] {
  return ds.header.map((h, i) => profileColumn(h, ds.rows.map((r) => r[i] ?? '')))
}
