// Heatmap maths: matrix parsing, normalisation, colour scales, seriation ordering.
import { parseCsv, toNumber } from './chart-builder'

export interface Matrix { rows: string[]; cols: string[]; v: number[][] }

/** First row = column labels, first column = row labels; blank or non-numeric cells become NaN. */
export function parseMatrix(text: string): Matrix {
  const t = parseCsv(text.trim())
  if (t.length < 2) return { rows: [], cols: [], v: [] }
  const cols = t[0].slice(1).map((c, i) => c || `C${i + 1}`)
  const rows: string[] = [], v: number[][] = []
  for (const r of t.slice(1)) {
    rows.push(r[0] || `R${rows.length + 1}`)
    v.push(cols.map((_, j) => (r[j + 1] === undefined || r[j + 1] === '' ? NaN : toNumber(r[j + 1]))))
  }
  return { rows, cols, v }
}

export type Norm = 'none' | 'row' | 'col' | 'zrow' | 'zcol' | 'total'

const finite = (a: number[]) => a.filter(Number.isFinite)
const sum = (a: number[]) => finite(a).reduce((x, y) => x + y, 0)
const mean = (a: number[]) => { const f = finite(a); return f.length ? sum(f) / f.length : NaN }
const sd = (a: number[]) => { const f = finite(a), m = mean(f); return f.length > 1 ? Math.sqrt(f.reduce((s, x) => s + (x - m) ** 2, 0) / (f.length - 1)) : NaN }
const col = (v: number[][], j: number) => v.map((r) => r[j])

/** Share of row/column/grand total (0–1), or z-scores (sample SD) within a row/column. */
export function normalise(v: number[][], n: Norm): number[][] {
  if (n === 'none') return v.map((r) => [...r])
  if (n === 'total') { const t = sum(v.flat()); return v.map((r) => r.map((x) => x / t)) }
  if (n === 'row') return v.map((r) => { const t = sum(r); return r.map((x) => x / t) })
  if (n === 'zrow') return v.map((r) => { const m = mean(r), s = sd(r); return r.map((x) => (s ? (x - m) / s : 0)) })
  const nc = v[0]?.length ?? 0
  const stats = Array.from({ length: nc }, (_, j) => { const c = col(v, j); return { t: sum(c), m: mean(c), s: sd(c) } })
  return v.map((r) => r.map((x, j) => (n === 'col' ? x / stats[j].t : stats[j].s ? (x - stats[j].m) / stats[j].s : 0)))
}

// Colour maps as evenly spaced sRGB stops. Viridis/magma stops sampled from matplotlib's colormaps (CC0 1.0, by
// Nathaniel J. Smith, Stefan van der Walt and Eric Firing); the others are simple hand-picked ramps.
export const MAPS: Record<string, string[]> = {
  viridis: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
  magma: ['#000004', '#180f3d', '#440f76', '#721f81', '#9e2f7f', '#cd4071', '#f1605d', '#fd9668', '#feca8d', '#fcfdbf'],
  blues: ['#f7fbff', '#d6e6f4', '#abd0e6', '#6aaed6', '#3787c0', '#105ba4', '#08306b'],
  greens: ['#f7fcf5', '#d3eecd', '#a1d99b', '#5db96b', '#2a924a', '#006227'],
  heat: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#b10026'],
  'red-blue': ['#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac'],
  'purple-green': ['#762a83', '#9970ab', '#c2a5cf', '#e7d4e8', '#f7f7f7', '#d9f0d3', '#a6dba0', '#5aae61', '#1b7837'],
  grey: ['#ffffff', '#000000'],
}
export const DIVERGING = ['red-blue', 'purple-green']

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

/** Colour at t ∈ [0,1] by linear interpolation between stops. */
export function ramp(map: string[], t: number): string {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (map.length - 1)
  const i = Math.min(map.length - 2, Math.floor(x)), f = x - i
  const a = hex(map[i]), b = hex(map[i + 1])
  return `#${a.map((c, k) => Math.round(c + (b[k] - c) * f).toString(16).padStart(2, '0')).join('')}`
}

/** Readable text colour (black/white) over a background, by WCAG relative luminance. */
export function inkFor(bg: string): string {
  const [r, g, b] = hex(bg).map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#111111' : '#ffffff'
}

export type ScaleKind = 'linear' | 'log' | 'quantile'

/**
 * Maps a value to [0,1]. Diverging scales centre on `mid` (each side stretched independently),
 * log needs positive values, quantile uses the rank among all finite values.
 */
export function scaler(values: number[], kind: ScaleKind, lo: number, hi: number, mid?: number): (x: number) => number {
  if (kind === 'quantile') {
    const s = finite(values).sort((a, b) => a - b)
    return (x) => {
      if (s.length < 2) return 0.5
      let a = 0, b = s.length
      while (a < b) { const m = (a + b) >> 1; if (s[m] < x) a = m + 1; else b = m }
      let e = a
      while (e < s.length && s[e] === x) e++
      return ((a + e - 1) / 2) / (s.length - 1)
    }
  }
  if (kind === 'log') {
    const l0 = Math.log10(Math.max(lo, 1e-12)), l1 = Math.log10(Math.max(hi, 1e-12))
    return (x) => (x > 0 && l1 > l0 ? (Math.log10(x) - l0) / (l1 - l0) : 0)
  }
  if (mid !== undefined && lo < mid && hi > mid) return (x) => (x < mid ? 0.5 * ((x - lo) / (mid - lo)) : 0.5 + 0.5 * ((x - mid) / (hi - mid)))
  return (x) => (hi > lo ? (x - lo) / (hi - lo) : 0.5)
}

/** Euclidean distance between two vectors, ignoring positions where either is NaN (rescaled to full length). */
export function dist(a: number[], b: number[]): number {
  let s = 0, n = 0
  for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i]) && Number.isFinite(b[i])) { s += (a[i] - b[i]) ** 2; n++ }
  return n ? Math.sqrt((s * a.length) / n) : Infinity
}

/**
 * Seriation: greedy nearest-neighbour path from every start, improved by 2-opt; returns the shortest order found.
 * Similar rows end up next to each other, revealing blocks in the heatmap.
 */
export function seriate(vecs: number[][]): number[] {
  const n = vecs.length
  if (n < 3) return vecs.map((_, i) => i)
  const D = vecs.map((a) => vecs.map((b) => dist(a, b)))
  const len = (o: number[]) => o.slice(1).reduce((s, x, i) => s + (Number.isFinite(D[o[i]][x]) ? D[o[i]][x] : 1e9), 0)
  let best: number[] = [], bestL = Infinity
  const small = n <= 80 // keep large matrices fast: fewer starts and no 2-opt
  for (let st = 0; st < (small ? n : Math.min(n, 8)); st++) {
    const o = [st], used = new Set(o)
    while (o.length < n) {
      const last = o[o.length - 1]
      let k = -1
      for (let j = 0; j < n; j++) if (!used.has(j) && (k < 0 || D[last][j] < D[last][k])) k = j
      o.push(k)
      used.add(k)
    }
    const L = len(o)
    if (L < bestL) { best = o; bestL = L }
  }
  for (let improved = small, guard = 0; improved && guard < 50; guard++) {
    improved = false
    for (let i = 0; i < n - 1; i++)
      for (let j = i + 1; j < n; j++) {
        const c = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)]
        const L = len(c)
        if (L < bestL - 1e-9) { best = c; bestL = L; improved = true }
      }
  }
  return best
}

export type Order = 'original' | 'total' | 'alpha' | 'cluster'
export function order(labels: string[], vecs: number[][], o: Order): number[] {
  const idx = labels.map((_, i) => i)
  if (o === 'alpha') return idx.sort((a, b) => labels[a].localeCompare(labels[b], undefined, { numeric: true }))
  if (o === 'total') return idx.sort((a, b) => sum(vecs[b]) - sum(vecs[a]))
  if (o === 'cluster') return seriate(vecs)
  return idx
}

export const transpose = (v: number[][]) => (v[0] ?? []).map((_, j) => v.map((r) => r[j]))
export { sum as total }
