// Salary bands vs. employee pay: table parsing, compa-ratio, range penetration and outliers.

export interface Band { level: string; min: number; mid: number; max: number }
export interface Emp { name: string; level: string; salary: number; dept: string }
export type Status = 'below' | 'low' | 'mid' | 'high' | 'above' | 'noband'

/** "$85,000", "85k", "85 000", "€72.5K" → number (NaN if not a number). */
export function money(s: unknown): number {
  if (typeof s === 'number') return s
  if (typeof s !== 'string') return NaN
  const t = s.trim().toLowerCase().replace(/[$€£¥₴\s,]|usd|eur|gbp/g, '')
  const m = /^(-?\d+(?:\.\d+)?)(k|m)?$/.exec(t)
  if (!m) return NaN
  return +m[1] * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1)
}

const find = (head: string[], re: RegExp) => head.findIndex((h) => re.test(h.trim().toLowerCase()))

/** Reads a bands table: level/grade, min, [mid|midpoint|target], max. Missing midpoints use (min+max)/2. */
export function parseBands(rows: unknown[][]): { bands: Band[]; errors: string[] } {
  const errors: string[] = []
  if (rows.length < 2) return { bands: [], errors: ['Bands table needs a header row and at least one band.'] }
  const head = rows[0].map((x) => String(x ?? ''))
  const iL = find(head, /^(level|grade|band|job ?level|role)$/), iMin = find(head, /^(min|minimum|low|floor)/), iMid = find(head, /^(mid|midpoint|target|market)/), iMax = find(head, /^(max|maximum|high|ceiling)/)
  if (iL < 0 || iMin < 0 || iMax < 0) return { bands: [], errors: ['Bands need columns: level, min, max (mid optional).'] }
  const bands: Band[] = []
  rows.slice(1).forEach((r, i) => {
    const level = String(r[iL] ?? '').trim()
    const min = money(r[iMin]), max = money(r[iMax])
    let mid = iMid >= 0 ? money(r[iMid]) : NaN
    if (!level) return
    if (!Number.isFinite(min) || !Number.isFinite(max)) return void errors.push(`Band row ${i + 2}: min/max not numeric.`)
    if (min > max) return void errors.push(`Band ${level}: min is above max.`)
    if (!Number.isFinite(mid)) mid = (min + max) / 2
    bands.push({ level, min, mid, max })
  })
  return { bands, errors }
}

/** Reads employees: name, level, salary, [department]. */
export function parseEmps(rows: unknown[][]): { emps: Emp[]; errors: string[] } {
  const errors: string[] = []
  if (rows.length < 2) return { emps: [], errors: ['Employee table needs a header row.'] }
  const head = rows[0].map((x) => String(x ?? ''))
  const iN = find(head, /^(name|employee|person|id)/), iL = find(head, /^(level|grade|band|job ?level)$/), iS = find(head, /^(salary|base|pay|annual|compensation)/), iD = find(head, /^(dept|department|team|function|org)/)
  if (iL < 0 || iS < 0) return { emps: [], errors: ['Employees need columns: level and salary (name, department optional).'] }
  const emps: Emp[] = []
  rows.slice(1).forEach((r, i) => {
    const salary = money(r[iS])
    const level = String(r[iL] ?? '').trim()
    if (!level && !Number.isFinite(salary)) return
    if (!Number.isFinite(salary)) return void errors.push(`Row ${i + 2}: salary “${String(r[iS] ?? '')}” is not a number.`)
    emps.push({ name: iN >= 0 ? String(r[iN] ?? '').trim() || `#${i + 1}` : `#${i + 1}`, level, salary, dept: iD >= 0 ? String(r[iD] ?? '').trim() : '' })
  })
  return { emps, errors }
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo)
}

export interface Row extends Emp { band?: Band; cr: number; pen: number; status: Status; outlier: boolean }
export interface LevelStat { level: string; band?: Band; n: number; median: number; avgCr: number; below: number; above: number; spread: number }

export function analyze(bands: Band[], emps: Emp[]) {
  const byLevel = new Map(bands.map((b) => [b.level.toLowerCase(), b]))
  const rows: Row[] = emps.map((e) => {
    const band = byLevel.get(e.level.toLowerCase())
    if (!band) return { ...e, cr: NaN, pen: NaN, status: 'noband', outlier: false }
    const cr = e.salary / band.mid
    const pen = band.max > band.min ? (e.salary - band.min) / (band.max - band.min) : NaN
    const status: Status = e.salary < band.min ? 'below' : e.salary > band.max ? 'above' : cr < 0.95 ? 'low' : cr > 1.05 ? 'high' : 'mid'
    return { ...e, band, cr, pen, status, outlier: false }
  })
  // Tukey fences within each level (needs ≥ 4 people); out-of-band pay is always flagged.
  const levels = [...new Set([...bands.map((b) => b.level), ...rows.map((r) => r.level)])]
  const stats: LevelStat[] = levels.map((lv) => {
    const rs = rows.filter((r) => r.level.toLowerCase() === lv.toLowerCase())
    const sal = rs.map((r) => r.salary).sort((a, b) => a - b)
    if (sal.length >= 4) {
      const q1 = quantile(sal, 0.25), q3 = quantile(sal, 0.75), iqr = q3 - q1
      for (const r of rs) if (r.salary < q1 - 1.5 * iqr || r.salary > q3 + 1.5 * iqr) r.outlier = true
    }
    for (const r of rs) if (r.status === 'below' || r.status === 'above') r.outlier = true
    const crs = rs.filter((r) => Number.isFinite(r.cr)).map((r) => r.cr)
    const band = byLevel.get(lv.toLowerCase())
    return { level: lv, band, n: rs.length, median: quantile(sal, 0.5), avgCr: crs.length ? crs.reduce((a, b) => a + b, 0) / crs.length : NaN, below: rs.filter((r) => r.status === 'below').length, above: rs.filter((r) => r.status === 'above').length, spread: band ? (band.max - band.min) / band.min : NaN }
  })
  const banded = rows.filter((r) => r.band)
  return {
    rows,
    stats,
    avgCr: banded.length ? banded.reduce((a, r) => a + r.cr, 0) / banded.length : NaN,
    costToMin: banded.reduce((a, r) => a + (r.status === 'below' ? r.band!.min - r.salary : 0), 0),
    overMax: banded.reduce((a, r) => a + (r.status === 'above' ? r.salary - r.band!.max : 0), 0),
    noBand: rows.filter((r) => !r.band).length,
  }
}

export const SAMPLE_BANDS = `level,min,mid,max
L1 Associate,48000,56000,64000
L2 Specialist,58000,68000,78000
L3 Senior,72000,85000,98000
L4 Lead,90000,106000,122000
L5 Principal,112000,132000,152000
M1 Manager,98000,116000,134000`

export const SAMPLE_EMPS = `name,level,salary,department
Avery Stone,L1 Associate,52000,Support
Blake Rivera,L1 Associate,47000,Support
Casey Morgan,L1 Associate,58500,Operations
Devon Price,L1 Associate,55000,Support
Emery Clarke,L2 Specialist,66000,Engineering
Finley Hart,L2 Specialist,71500,Engineering
Gray Ellis,L2 Specialist,61000,Operations
Harper Quinn,L2 Specialist,69000,Support
Indy Walsh,L2 Specialist,80500,Engineering
Jordan Lee,L3 Senior,83000,Engineering
Kai Bennett,L3 Senior,90500,Engineering
Logan Fox,L3 Senior,76000,Operations
Morgan Diaz,L3 Senior,87000,Design
Noel Park,L3 Senior,99500,Engineering
Oakley Shaw,L3 Senior,81000,Design
Parker Young,L4 Lead,104000,Engineering
Quinn Hayes,L4 Lead,118000,Engineering
Reese Cole,L4 Lead,96000,Design
Sage Murphy,L4 Lead,88000,Operations
Taylor Brooks,L5 Principal,128000,Engineering
Uma Grant,L5 Principal,149000,Engineering
Vic Moreno,M1 Manager,112000,Operations
Wren Patel,M1 Manager,121000,Engineering
Xen Foster,M1 Manager,138500,Design`
