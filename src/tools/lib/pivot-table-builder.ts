// Pivot engine: CSV parsing, group-by over row/column fields, many aggregations
// (incl. median, std, percentiles) computed from raw values so totals stay correct.

export interface Dataset { cols: string[]; rows: string[][]; numeric: boolean[] }

/** RFC 4180-ish CSV/TSV parser (quotes, escaped quotes, CRLF). Delimiter is auto-detected. */
export function parseCsv(text: string): Dataset {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const delim = [',', ';', '\t', '|'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const out: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else q = false
      } else cell += c
    } else if (c === '"' && cell === '') q = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x !== '')) out.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x !== '')) out.push(row)
  if (!out.length) return { cols: [], rows: [], numeric: [] }
  const cols = out[0].map((c, i) => c.trim() || `Column ${i + 1}`)
  const rows = out.slice(1).map((r) => cols.map((_, i) => (r[i] ?? '').trim()))
  const numeric = cols.map((_, i) => {
    const vals = rows.map((r) => r[i]).filter((v) => v !== '')
    return vals.length > 0 && vals.every((v) => Number.isFinite(toNum(v)))
  })
  return { cols, rows, numeric }
}

export const toNum = (v: string) => (v === '' ? NaN : Number(v.replace(/[$€£,\s%]/g, '')))

export const AGGS = ['sum', 'count', 'distinct', 'mean', 'median', 'min', 'max', 'std', 'var', 'p10', 'p25', 'p75', 'p90'] as const
export type Agg = (typeof AGGS)[number]
export const AGG_LABEL: Record<Agg, string> = {
  sum: 'Sum', count: 'Count', distinct: 'Count distinct', mean: 'Mean', median: 'Median', min: 'Min', max: 'Max',
  std: 'Std. dev.', var: 'Variance', p10: '10th pct', p25: '25th pct (Q1)', p75: '75th pct (Q3)', p90: '90th pct',
}
/** Aggregations for which "% of total" shares make sense. */
export const ADDITIVE: Agg[] = ['sum', 'count']

/** Linear-interpolated quantile (Excel PERCENTILE.INC / R type 7) of a sorted array. */
export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN
  const h = (sorted.length - 1) * p
  const lo = Math.floor(h)
  return sorted[lo] + (h - lo) * ((sorted[Math.min(lo + 1, sorted.length - 1)] ?? sorted[lo]) - sorted[lo])
}

export function aggregate(agg: Agg, raw: string[]): number {
  if (agg === 'count') return raw.length
  if (agg === 'distinct') return new Set(raw).size
  const v = raw.map(toNum).filter(Number.isFinite)
  if (!v.length) return NaN
  const n = v.length
  const sum = v.reduce((a, b) => a + b, 0)
  switch (agg) {
    case 'sum': return sum
    case 'mean': return sum / n
    case 'min': return Math.min(...v)
    case 'max': return Math.max(...v)
    case 'std':
    case 'var': {
      if (n < 2) return NaN
      const m = sum / n
      const s2 = v.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)
      return agg === 'var' ? s2 : Math.sqrt(s2)
    }
    default: {
      const s = [...v].sort((a, b) => a - b)
      const p = agg === 'median' ? 0.5 : Number(agg.slice(1)) / 100
      return quantile(s, p)
    }
  }
}

export interface ValueSpec { field: number; agg: Agg }
export interface PivotSpec { rows: number[]; cols: number[]; values: ValueSpec[]; filters: Record<number, string[]> /* excluded values */ }

export interface Pivot {
  rowKeys: string[][]
  colKeys: string[][]
  /** row indices of the source data per cell; key = rowKey + '\u0001' + colKey */
  cells: Map<string, number[]>
  rowIdx: Map<string, number[]>
  colIdx: Map<string, number[]>
  all: number[]
}

const SEP = '\u0000'
export const keyOf = (k: string[]) => k.join(SEP)
export const cellKey = (r: string[], c: string[]) => keyOf(r) + '\u0001' + keyOf(c)

const cmp = (a: string, b: string) => {
  const x = toNum(a), y = toNum(b)
  return Number.isFinite(x) && Number.isFinite(y) ? x - y : a.localeCompare(b, undefined, { numeric: true })
}
const cmpKeys = (a: string[], b: string[]) => {
  for (let i = 0; i < a.length; i++) { const c = cmp(a[i], b[i]); if (c) return c }
  return 0
}

export function pivot(d: Dataset, spec: PivotSpec): Pivot {
  const cells = new Map<string, number[]>(), rowIdx = new Map<string, number[]>(), colIdx = new Map<string, number[]>()
  const rk = new Map<string, string[]>(), ck = new Map<string, string[]>()
  const all: number[] = []
  const excluded = Object.entries(spec.filters).map(([f, vals]) => [Number(f), new Set(vals)] as const).filter(([, s]) => s.size)
  const push = (m: Map<string, number[]>, k: string, i: number) => { const a = m.get(k); if (a) a.push(i); else m.set(k, [i]) }
  d.rows.forEach((r, i) => {
    for (const [f, s] of excluded) if (s.has(r[f])) return
    const rkey = spec.rows.map((f) => r[f] || '(blank)'), ckey = spec.cols.map((f) => r[f] || '(blank)')
    const a = keyOf(rkey), b = keyOf(ckey)
    rk.set(a, rkey); ck.set(b, ckey)
    push(cells, a + '\u0001' + b, i); push(rowIdx, a, i); push(colIdx, b, i)
    all.push(i)
  })
  return { rowKeys: [...rk.values()].sort(cmpKeys), colKeys: [...ck.values()].sort(cmpKeys), cells, rowIdx, colIdx, all }
}

export const valuesAt = (d: Dataset, idx: number[] | undefined, field: number) => (idx ?? []).map((i) => d.rows[i][field])

export type Show = 'value' | 'row' | 'col' | 'total'

/** Value displayed in a cell, optionally as a share of its row / column / grand total. */
export function display(d: Dataset, p: Pivot, v: ValueSpec, idx: number[] | undefined, show: Show, rowKey: string[] | null, colKey: string[] | null): number {
  const x = aggregate(v.agg, valuesAt(d, idx, v.field))
  if (show === 'value' || !idx) return idx ? x : NaN
  const denomIdx = show === 'row' ? (rowKey ? p.rowIdx.get(keyOf(rowKey)) : p.all) : show === 'col' ? (colKey ? p.colIdx.get(keyOf(colKey)) : p.all) : p.all
  const den = aggregate(v.agg, valuesAt(d, denomIdx, v.field))
  return den ? x / den : NaN
}

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** Deterministic sales dataset (one row per order line). */
export function sampleCsv(): string {
  const r = rng(7)
  const regions = ['North', 'South', 'East', 'West']
  const cats: [string, string[], number][] = [['Electronics', ['Headphones', 'Monitor', 'Keyboard'], 120], ['Home', ['Lamp', 'Chair', 'Rug'], 70], ['Outdoor', ['Tent', 'Backpack'], 90], ['Books', ['Novel', 'Cookbook'], 18]]
  const channels = ['Online', 'Retail', 'Partner']
  const lines = ['Month,Region,Category,Product,Channel,Units,Revenue,Discount %']
  for (let i = 0; i < 480; i++) {
    const m = 1 + Math.floor(r() * 12)
    const reg = regions[Math.floor(r() * regions.length)]
    const [cat, prods, price] = cats[Math.floor(r() * cats.length)]
    const ch = channels[Math.floor(Math.pow(r(), 1.4) * channels.length)]
    const units = 1 + Math.floor(Math.pow(r(), 2) * (cat === 'Books' ? 40 : 15))
    const disc = r() < 0.6 ? 0 : [5, 10, 15, 20][Math.floor(r() * 4)]
    const season = cat === 'Outdoor' ? 1 + 0.6 * Math.sin(((m - 3) / 12) * Math.PI * 2) : cat === 'Electronics' && m >= 11 ? 1.4 : 1
    const rev = units * price * (0.8 + r() * 0.4) * season * (1 - disc / 100) * (reg === 'West' ? 1.15 : 1)
    lines.push(`2026-${String(m).padStart(2, '0')},${reg},${cat},${prods[Math.floor(r() * prods.length)]},${ch},${units},${rev.toFixed(2)},${disc}`)
  }
  return lines.join('\n')
}
