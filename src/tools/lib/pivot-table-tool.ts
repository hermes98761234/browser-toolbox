// Pivot engine: group rows × columns, aggregate a value field, totals and "show as" percentages.

export type Agg = 'sum' | 'count' | 'countUnique' | 'avg' | 'min' | 'max' | 'median' | 'first'
export type ShowAs = 'value' | 'pctTotal' | 'pctRow' | 'pctCol'
export type Rec = Record<string, string>

export const AGGS: [Agg, string][] = [['sum', 'Sum'], ['count', 'Count'], ['countUnique', 'Count unique'], ['avg', 'Average'], ['min', 'Min'], ['max', 'Max'], ['median', 'Median'], ['first', 'First value']]

/** Parses "1,234.50", "$12", "(30)", "45%" → number, else NaN. */
export function toNum(s: string): number {
  let t = (s ?? '').trim()
  if (!t) return NaN
  let neg = false
  if (/^\(.*\)$/.test(t)) {
    neg = true
    t = t.slice(1, -1)
  }
  t = t.replace(/[\s$€£¥₴%]/g, '').replace(/,(?=\d{3}(\D|$))/g, '')
  if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.')
  const v = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : NaN
  return neg ? -v : v
}

class Acc {
  vals: number[] = []
  raw = new Set<string>()
  n = 0
  firstV = ''
  push(v: string) {
    if (this.n === 0) this.firstV = v
    this.n++
    this.raw.add(v)
    const x = toNum(v)
    if (Number.isFinite(x)) this.vals.push(x)
  }
  value(a: Agg): number | string {
    const v = this.vals
    switch (a) {
      case 'count': return this.n
      case 'countUnique': return this.raw.size
      case 'sum': return v.reduce((s, x) => s + x, 0)
      case 'avg': return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN
      case 'min': return v.length ? Math.min(...v) : NaN
      case 'max': return v.length ? Math.max(...v) : NaN
      case 'median': {
        if (!v.length) return NaN
        const s = [...v].sort((p, q) => p - q), m = s.length >> 1
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
      }
      case 'first': return this.firstV
    }
  }
}

const SEP = '\u0001'
const coll = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
/** Natural compare: numbers numerically, ISO dates and text naturally. */
export const natural = (a: string, b: string) => {
  const x = toNum(a), y = toNum(b)
  return Number.isFinite(x) && Number.isFinite(y) ? x - y : coll.compare(a, b)
}
const cmpKeys = (a: string[], b: string[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const c = natural(a[i] ?? '', b[i] ?? '')
    if (c) return c
  }
  return 0
}

export interface PivotCfg { rows: string[]; cols: string[]; val: string; agg: Agg; exclude: Record<string, string[]> }
export interface PivotResult {
  rowKeys: string[][]
  colKeys: string[][]
  cell: (r: string[], c: string[]) => number | string
  rowTotal: (r: string[]) => number | string
  colTotal: (c: string[]) => number | string
  grand: number | string
  count: number
}

export function applyFilters(data: Rec[], exclude: Record<string, string[]>): Rec[] {
  const ex = Object.entries(exclude).filter(([, v]) => v.length).map(([k, v]) => [k, new Set(v)] as const)
  return ex.length ? data.filter((r) => ex.every(([k, s]) => !s.has(r[k] ?? ''))) : data
}

export function pivot(data: Rec[], cfg: PivotCfg): PivotResult {
  const rows = applyFilters(data, cfg.exclude)
  const cells = new Map<string, Acc>(), rt = new Map<string, Acc>(), ct = new Map<string, Acc>(), all = new Acc()
  const rk = new Map<string, string[]>(), ck = new Map<string, string[]>()
  const get = (m: Map<string, Acc>, k: string) => {
    let a = m.get(k)
    if (!a) m.set(k, (a = new Acc()))
    return a
  }
  for (const r of rows) {
    const rKey = cfg.rows.map((f) => r[f] ?? ''), cKey = cfg.cols.map((f) => r[f] ?? '')
    const rs = rKey.join(SEP), cs = cKey.join(SEP)
    rk.set(rs, rKey)
    ck.set(cs, cKey)
    const v = cfg.val ? (r[cfg.val] ?? '') : '1'
    get(cells, rs + SEP + SEP + cs).push(v)
    get(rt, rs).push(v)
    get(ct, cs).push(v)
    all.push(v)
  }
  const val = (a: Acc | undefined) => (a ? a.value(cfg.agg) : NaN)
  return {
    rowKeys: [...rk.values()].sort(cmpKeys),
    colKeys: [...ck.values()].sort(cmpKeys),
    cell: (r, c) => val(cells.get(r.join(SEP) + SEP + SEP + c.join(SEP))),
    rowTotal: (r) => val(rt.get(r.join(SEP))),
    colTotal: (c) => val(ct.get(c.join(SEP))),
    grand: val(all),
    count: rows.length,
  }
}

/** Converts a cell into its "show as" representation (fractions for percentages). */
export function showAs(v: number | string, mode: ShowAs, rowT: number | string, colT: number | string, grand: number | string): number | string {
  if (mode === 'value' || typeof v !== 'number') return v
  const d = mode === 'pctTotal' ? grand : mode === 'pctRow' ? rowT : colT
  return typeof d === 'number' && d !== 0 ? v / d : NaN
}

/** Flat 2D table (header rows + body) for CSV export. */
export function toGrid(p: PivotResult, cfg: PivotCfg, mode: ShowAs): (string | number)[][] {
  const head = [...cfg.rows, ...p.colKeys.map((c) => c.join(' / ') || 'Value'), 'Total']
  const body = p.rowKeys.map((r) => {
    const rt = p.rowTotal(r)
    return [...r, ...p.colKeys.map((c) => fmtRaw(showAs(p.cell(r, c), mode, rt, p.colTotal(c), p.grand))), fmtRaw(showAs(rt, mode, rt, p.grand, p.grand))]
  })
  const foot = ['Total', ...cfg.rows.slice(1).map(() => ''), ...p.colKeys.map((c) => fmtRaw(showAs(p.colTotal(c), mode, p.grand, p.colTotal(c), p.grand))), fmtRaw(showAs(p.grand, mode, p.grand, p.grand, p.grand))]
  return [head, ...body, foot]
}
const fmtRaw = (v: number | string) => (typeof v === 'number' ? (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : '') : v)

/** Distinct values of a field (sorted) with counts. */
export function distinct(data: Rec[], f: string): [string, number][] {
  const m = new Map<string, number>()
  for (const r of data) m.set(r[f] ?? '', (m.get(r[f] ?? '') ?? 0) + 1)
  return [...m].sort((a, b) => natural(a[0], b[0]))
}

export function isNumericField(data: Rec[], f: string): boolean {
  const vals = data.slice(0, 200).map((r) => r[f]).filter((v) => v !== undefined && v.trim() !== '')
  return vals.length > 0 && vals.filter((v) => Number.isFinite(toNum(v))).length / vals.length > 0.9
}
