// Data Profiler: loads CSV/TSV/JSON/NDJSON into a table and adds dataset-level checks
// (duplicates, correlations, missing-value patterns, quality score) on top of csv-profiler's column stats.
import { isMissing, toDataset, toNumber, type Dataset, type Profile } from './csv-profiler'

export type Format = 'csv' | 'json' | 'ndjson'

const cell = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** Flattens nested objects to dot paths ({a:{b:1}} → {"a.b":"1"}); arrays stay JSON text. */
export function flatten(o: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    const entries = Object.entries(o as Record<string, unknown>)
    if (!entries.length && prefix) out[prefix] = ''
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out)
  } else out[prefix || 'value'] = cell(o)
  return out
}

function fromRecords(recs: unknown[]): Dataset {
  const flat = recs.map((r) => flatten(r))
  const header: string[] = []
  const seen = new Set<string>()
  for (const r of flat) for (const k of Object.keys(r)) if (!seen.has(k)) {
    seen.add(k)
    header.push(k)
  }
  return { header, rows: flat.map((r) => header.map((h) => r[h] ?? '')) }
}

/** Detects the format and parses text into a header + string rows. */
export function parseAny(text: string): { ds: Dataset; format: Format } {
  const t = text.replace(/^﻿/, '').trim()
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      const v = JSON.parse(t) as unknown
      if (Array.isArray(v)) return { ds: fromRecords(v), format: 'json' }
      // {"data":[…]} or {"rows":[…]} wrappers: take the first array of objects
      const arr = Object.values(v as Record<string, unknown>).find((x) => Array.isArray(x) && x.length && typeof x[0] === 'object')
      return { ds: fromRecords((arr as unknown[]) ?? [v]), format: 'json' }
    } catch {
      const lines = t.split(/\r?\n/).filter((l) => l.trim())
      try {
        return { ds: fromRecords(lines.map((l) => JSON.parse(l) as unknown)), format: 'ndjson' }
      } catch {
        /* fall through to CSV */
      }
    }
  }
  return { ds: toDataset(t), format: 'csv' }
}

/** Number of rows that exactly repeat an earlier row. */
export function duplicateRows(ds: Dataset): number {
  const seen = new Set<string>()
  let d = 0
  for (const r of ds.rows) {
    const k = JSON.stringify(r)
    if (seen.has(k)) d++
    else seen.add(k)
  }
  return d
}

/** Pearson correlation over rows where both values are present. */
export function pearson(a: number[], b: number[]): number {
  let n = 0, sa = 0, sb = 0
  for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
    n++
    sa += a[i]
    sb += b[i]
  }
  if (n < 3) return NaN
  const ma = sa / n, mb = sb / n
  let cov = 0, va = 0, vb = 0
  for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
    cov += (a[i] - ma) * (b[i] - mb)
    va += (a[i] - ma) ** 2
    vb += (b[i] - mb) ** 2
  }
  return va && vb ? cov / Math.sqrt(va * vb) : NaN
}

/** Numeric vectors (NaN for missing/invalid) for integer and number columns. */
export function numericColumns(ds: Dataset, prof: Profile[]): { name: string; v: number[] }[] {
  return prof
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.type === 'integer' || p.type === 'number')
    .map(({ p, i }) => ({ name: p.name, v: ds.rows.map((r) => (isMissing(r[i] ?? '') ? NaN : toNumber(r[i]))) }))
}

export function correlationMatrix(cols: { name: string; v: number[] }[]): number[][] {
  return cols.map((a, i) => cols.map((b, j) => (i === j ? 1 : pearson(a.v, b.v))))
}

/** Strongest off-diagonal pairs by |r|. */
export function topPairs(cols: { name: string }[], m: number[][], k = 5): [string, string, number][] {
  const out: [string, string, number][] = []
  for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) if (Number.isFinite(m[i][j])) out.push([cols[i].name, cols[j].name, m[i][j]])
  return out.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2])).slice(0, k)
}

export interface Issue { col: string; level: 'warn' | 'info'; text: string }

/** Plain-language data-quality findings per column. */
export function issues(prof: Profile[], rows: number): Issue[] {
  const out: Issue[] = []
  for (const p of prof) {
    const miss = p.missing / (rows || 1)
    if (p.type === 'empty') out.push({ col: p.name, level: 'warn', text: 'is completely empty' })
    else if (miss >= 0.2) out.push({ col: p.name, level: 'warn', text: `is ${Math.round(miss * 100)}% missing` })
    if (p.unique === 1 && p.count - p.missing > 1) out.push({ col: p.name, level: 'info', text: 'has a single constant value' })
    if (p.unique === p.count && p.missing === 0 && rows > 10 && p.type !== 'number') out.push({ col: p.name, level: 'info', text: 'is unique per row (likely an ID)' })
    if (p.invalid > 0) out.push({ col: p.name, level: 'warn', text: `has ${p.invalid} value(s) that do not match its ${p.type} type` })
    if ((p.outliers ?? 0) > 0) out.push({ col: p.name, level: 'info', text: `has ${p.outliers} outlier(s) beyond 1.5×IQR` })
    if (p.type === 'text' && p.unique > 1 && p.unique <= Math.max(2, Math.min(20, (p.count - p.missing) / 10))) out.push({ col: p.name, level: 'info', text: `looks categorical (${p.unique} levels)` })
  }
  return out
}

/** 0–100 score: completeness (60%), type validity (25%), uniqueness of rows (15%). */
export function qualityScore(prof: Profile[], rows: number, dups: number): number {
  if (!prof.length || !rows) return 0
  const cells = prof.length * rows
  const missing = prof.reduce((a, p) => a + p.missing, 0)
  const invalid = prof.reduce((a, p) => a + p.invalid, 0)
  const s = 0.6 * (1 - missing / cells) + 0.25 * (1 - invalid / cells) + 0.15 * (1 - dups / rows)
  return Math.round(s * 100)
}

/** Down-sampled missingness map: `bands` row groups × columns, each cell = share missing. */
export function missingMap(ds: Dataset, bands = 40): number[][] {
  const n = ds.rows.length
  const k = Math.max(1, Math.min(bands, n))
  return Array.from({ length: k }, (_, b) => {
    const r0 = Math.floor((b * n) / k), r1 = Math.floor(((b + 1) * n) / k)
    return ds.header.map((_, c) => {
      let m = 0
      for (let r = r0; r < r1; r++) if (isMissing(ds.rows[r][c] ?? '')) m++
      return r1 > r0 ? m / (r1 - r0) : 0
    })
  })
}
