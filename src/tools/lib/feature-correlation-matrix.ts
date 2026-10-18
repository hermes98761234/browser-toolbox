// Feature Correlation Matrix logic: CSV parsing to numeric columns, Pearson / Spearman / Kendall tau-b
// correlations with p-values (t and normal approximations, distributions from statistics-calculator),
// multiple-testing adjustment and average-linkage (UPGMA) hierarchical clustering for ordering.
import { betaI, normCdf, rank } from './statistics-calculator'

export type Method = 'pearson' | 'spearman' | 'kendall'

export interface Dataset { names: string[]; cols: number[][]; rows: number; dropped: string[] }

function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === sep) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/** Parses CSV/TSV with a header row; keeps columns where ≥ 80% of non-empty cells are numbers. Missing → NaN. */
export function parseTable(text: string): Dataset {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { names: [], cols: [], rows: 0, dropped: [] }
  const sep = lines[0].includes('\t') ? '\t' : lines[0].split(';').length > lines[0].split(',').length ? ';' : ','
  const head = splitLine(lines[0], sep)
  const body = lines.slice(1).map((l) => splitLine(l, sep))
  const names: string[] = [], cols: number[][] = [], dropped: string[] = []
  head.forEach((h, j) => {
    const raw = body.map((r) => r[j] ?? '')
    const vals = raw.map((v) => (v === '' || /^(na|nan|null|-)$/i.test(v) ? NaN : Number(v.replace(/,(?=\d{3}\b)/g, ''))))
    const filled = raw.filter((v) => v !== '').length
    const good = vals.filter((v) => Number.isFinite(v)).length
    if (filled && good / filled >= 0.8 && good >= 3) {
      names.push(h || `col${j + 1}`)
      cols.push(vals)
    } else dropped.push(h || `col${j + 1}`)
  })
  return { names, cols, rows: body.length, dropped }
}

/** Pairwise-complete observations. */
export function complete(x: number[], y: number[]): [number[], number[]] {
  const a: number[] = [], b: number[] = []
  for (let i = 0; i < x.length; i++) if (Number.isFinite(x[i]) && Number.isFinite(y[i])) { a.push(x[i]); b.push(y[i]) }
  return [a, b]
}

export function pearson(x: number[], y: number[]): number {
  const n = x.length
  let mx = 0, my = 0
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i] }
  mx /= n; my /= n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN
}

export const spearman = (x: number[], y: number[]) => pearson(rank(x).ranks, rank(y).ranks)

/** Kendall tau-b with the tie-corrected variance of S; returns tau and the normal-approximation z. */
export function kendall(x: number[], y: number[]): { tau: number; z: number } {
  const n = x.length
  let s = 0, n1 = 0, n2 = 0
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = Math.sign(x[i] - x[j]), b = Math.sign(y[i] - y[j])
    s += a * b
    if (a === 0) n1++
    if (b === 0) n2++
  }
  const n0 = (n * (n - 1)) / 2
  const tau = s / Math.sqrt((n0 - n1) * (n0 - n2))
  const tiesOf = (v: number[]) => rank(v).ties
  const tx = tiesOf(x), ty = tiesOf(y)
  const f = (t: number[], g: (k: number) => number) => t.reduce((acc, k) => acc + g(k), 0)
  const v0 = n * (n - 1) * (2 * n + 5)
  const vt = f(tx, (k) => k * (k - 1) * (2 * k + 5)), vu = f(ty, (k) => k * (k - 1) * (2 * k + 5))
  const v1 = (f(tx, (k) => k * (k - 1)) * f(ty, (k) => k * (k - 1))) / (2 * n * (n - 1))
  const v2 = n > 2 ? (f(tx, (k) => k * (k - 1) * (k - 2)) * f(ty, (k) => k * (k - 1) * (k - 2))) / (9 * n * (n - 1) * (n - 2)) : 0
  const varS = (v0 - vt - vu) / 18 + v1 + v2
  return { tau, z: varS > 0 ? s / Math.sqrt(varS) : 0 }
}

export interface Cell { r: number; p: number; n: number }

/** Two-sided p-value of a correlation. Pearson/Spearman: t with n−2 df; Kendall: normal z. */
export function corr(x0: number[], y0: number[], m: Method): Cell {
  const [x, y] = complete(x0, y0)
  const n = x.length
  if (n < 3) return { r: NaN, p: NaN, n }
  if (m === 'kendall') {
    const { tau, z } = kendall(x, y)
    return { r: tau, p: Math.min(1, 2 * normCdf(-Math.abs(z))), n }
  }
  const r = m === 'pearson' ? pearson(x, y) : spearman(x, y)
  if (!Number.isFinite(r)) return { r, p: NaN, n }
  const df = n - 2
  const t2 = (r * r * df) / Math.max(1e-300, 1 - r * r)
  return { r, p: Math.abs(r) >= 1 ? 0 : betaI(df / (df + t2), df / 2, 0.5), n }
}

export function matrix(d: Dataset, m: Method): Cell[][] {
  const k = d.cols.length
  const out: Cell[][] = Array.from({ length: k }, () => new Array<Cell>(k))
  for (let i = 0; i < k; i++) {
    out[i][i] = { r: 1, p: 0, n: d.cols[i].filter(Number.isFinite).length }
    for (let j = i + 1; j < k; j++) out[i][j] = out[j][i] = corr(d.cols[i], d.cols[j], m)
  }
  return out
}

export type Adjust = 'none' | 'holm' | 'bh'

/** Holm step-down or Benjamini–Hochberg step-up adjusted p-values (same order as input). */
export function adjust(ps: number[], how: Adjust): number[] {
  if (how === 'none') return ps.slice()
  const m = ps.length
  const idx = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(m)
  if (how === 'holm') {
    let run = 0
    idx.forEach(([p, i], k) => {
      run = Math.max(run, Math.min(1, (m - k) * p))
      out[i] = run
    })
  } else {
    let run = 1
    for (let k = m - 1; k >= 0; k--) {
      const [p, i] = idx[k]
      run = Math.min(run, (p * m) / (k + 1))
      out[i] = Math.min(1, run)
    }
  }
  return out
}

export interface Merge { a: number; b: number; h: number; size: number }
export interface Tree { merges: Merge[]; order: number[] }

/**
 * Average-linkage (UPGMA) agglomerative clustering on a distance matrix.
 * Leaves are 0..k-1; merged clusters get ids k, k+1, … in merge order.
 */
export function upgma(dist: number[][]): Tree {
  const k = dist.length
  if (k === 0) return { merges: [], order: [] }
  const D = new Map<number, Map<number, number>>()
  const size = new Map<number, number>()
  const members = new Map<number, number[]>()
  for (let i = 0; i < k; i++) {
    D.set(i, new Map())
    size.set(i, 1)
    members.set(i, [i])
  }
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) if (i !== j) D.get(i)!.set(j, dist[i][j])
  const merges: Merge[] = []
  let next = k
  while (D.size > 1) {
    let best = Infinity, ba = -1, bb = -1
    for (const [a, row] of D) for (const [b, v] of row) if (a < b && v < best) { best = v; ba = a; bb = b }
    const sa = size.get(ba)!, sb = size.get(bb)!
    const nrow = new Map<number, number>()
    for (const c of D.keys()) {
      if (c === ba || c === bb) continue
      const v = (D.get(ba)!.get(c)! * sa + D.get(bb)!.get(c)! * sb) / (sa + sb)
      nrow.set(c, v)
      D.get(c)!.delete(ba)
      D.get(c)!.delete(bb)
      D.get(c)!.set(next, v)
    }
    D.delete(ba)
    D.delete(bb)
    D.set(next, nrow)
    size.set(next, sa + sb)
    members.set(next, [...members.get(ba)!, ...members.get(bb)!])
    merges.push({ a: ba, b: bb, h: best, size: sa + sb })
    next++
  }
  return { merges, order: members.get(next - 1)! }
}

/** Distance between features: 1 − |r| (sign-agnostic) or 1 − r. NaN correlations count as unrelated. */
export function corrDistance(M: Cell[][], signed: boolean): number[][] {
  return M.map((row) => row.map((c) => {
    const r = Number.isFinite(c.r) ? c.r : 0
    return signed ? 1 - r : 1 - Math.abs(r)
  }))
}

// ---------- sample data ----------

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Synthetic housing data set with deliberate structure (generated, not real listings). */
export function sampleCsv(n = 150): string {
  const r = rng(42)
  const g = () => {
    const u = Math.max(1e-9, r()), v = r()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const rows = ['area_m2,bedrooms,bathrooms,age_years,lot_m2,dist_center_km,school_rating,crime_index,noise_db,price_k']
  for (let i = 0; i < n; i++) {
    const area = Math.round(60 + 90 * Math.exp(0.35 * g()))
    const bed = Math.max(1, Math.round(area / 45 + 0.6 * g()))
    const bath = Math.max(1, Math.round(bed * 0.55 + 0.5 * g()))
    const dist = Math.max(0.5, +(8 + 5 * g()).toFixed(1))
    const lot = Math.round(200 + 45 * dist + 120 * g() + area)
    const age = Math.max(0, Math.round(35 - 1.6 * dist + 14 * g()))
    const school = Math.min(10, Math.max(1, +(6 + 0.15 * dist - 0.04 * age + 1.4 * g()).toFixed(1)))
    const crime = Math.max(5, Math.round(70 - 3.5 * dist + 10 * g()))
    const noise = Math.round(68 - 1.3 * dist + 0.1 * crime + 4 * g())
    const price = Math.round(2.6 * area + 18 * school - 9 * dist - 1.1 * crime - 1.2 * age + 30 * bath + 60 + 35 * g())
    rows.push([area, bed, bath, age, lot, dist, i % 37 === 5 ? '' : school, crime, noise, price].join(','))
  }
  return rows.join('\n')
}
