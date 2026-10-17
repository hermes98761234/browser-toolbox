// Filtering, sorting and sizing helpers for the CSV viewer (parsing lives in csv-profiler).
import { isMissing, toDate, toNumber, type ColType } from './csv-profiler'

/**
 * Column filter syntax:
 *   text → contains (case-insensitive) · =text exact · !text doesn't contain
 *   >10, >=10, <10, <=10 (numbers or dates) · 10..20 inclusive range · empty / !empty
 */
export function makeFilter(expr: string): (v: string) => boolean {
  const e = expr.trim()
  if (!e) return () => true
  const low = e.toLowerCase()
  if (low === 'empty') return (v) => isMissing(v)
  if (low === '!empty') return (v) => !isMissing(v)
  const val = (v: string) => {
    const n = toNumber(v)
    return Number.isFinite(n) ? n : toDate(v)
  }
  const cmp = /^(>=|<=|>|<)\s*(.+)$/.exec(e)
  if (cmp) {
    const ref = val(cmp[2])
    if (!Number.isFinite(ref)) return () => false
    const op = cmp[1]
    return (v) => {
      const x = val(v)
      if (!Number.isFinite(x)) return false
      return op === '>' ? x > ref : op === '<' ? x < ref : op === '>=' ? x >= ref : x <= ref
    }
  }
  const range = /^(.+?)\s*\.\.\s*(.+)$/.exec(e)
  if (range) {
    const lo = val(range[1]), hi = val(range[2])
    if (Number.isFinite(lo) && Number.isFinite(hi)) return (v) => {
      const x = val(v)
      return Number.isFinite(x) && x >= lo && x <= hi
    }
  }
  if (e.startsWith('=')) {
    const t = e.slice(1).trim().toLowerCase()
    return (v) => v.trim().toLowerCase() === t
  }
  if (e.startsWith('!')) {
    const t = e.slice(1).toLowerCase()
    return (v) => !v.toLowerCase().includes(t)
  }
  return (v) => v.toLowerCase().includes(low)
}

/** Sort key for a cell given its column type; missing values sort last. */
export function sortKey(v: string, type: ColType): number | string | null {
  if (isMissing(v)) return null
  if (type === 'integer' || type === 'number') {
    const n = toNumber(v)
    return Number.isFinite(n) ? n : null
  }
  if (type === 'date') {
    const d = toDate(v)
    return Number.isFinite(d) ? d : null
  }
  return v.toLowerCase()
}

/** Row indices sorted by column `col` (stable; missing last regardless of direction). */
export function sortRows(rows: string[][], idx: number[], col: number, type: ColType, dir: 1 | -1): number[] {
  const keys = new Map<number, number | string | null>()
  for (const i of idx) keys.set(i, sortKey(rows[i][col] ?? '', type))
  const coll = new Intl.Collator(undefined, { numeric: true })
  return [...idx].sort((a, b) => {
    const ka = keys.get(a)!, kb = keys.get(b)!
    if (ka === null || kb === null) return ka === kb ? a - b : ka === null ? 1 : -1
    const c = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : coll.compare(String(ka), String(kb))
    return c ? c * dir : a - b
  })
}

/** Pixel width for a column from its header and a sample of values. */
export function colWidth(header: string, sample: string[]): number {
  const longest = Math.max(header.length + 2, ...sample.map((s) => s.length))
  return Math.round(Math.min(320, Math.max(70, longest * 7.6 + 24)))
}
