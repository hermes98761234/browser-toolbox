// Data prep for the 3D scatter explorer: CSV → columns, numeric detection, scaling, lasso hit-test.
import { detectDelimiter, parseCsv } from './csv-profiler'

export interface Table3 {
  headers: string[]
  rows: string[][]
  numeric: number[] // indexes of numeric columns
  categorical: number[] // indexes of low-cardinality text columns
}

const isNum = (v: string) => v.trim() !== '' && Number.isFinite(Number(v))

export function loadTable(text: string): Table3 {
  const all = parseCsv(text.trim(), detectDelimiter(text)).filter((r) => r.some((c) => c.trim() !== ''))
  if (all.length < 2) return { headers: all[0] ?? [], rows: [], numeric: [], categorical: [] }
  const headers = all[0].map((h, i) => h.trim() || `col${i + 1}`)
  const rows = all.slice(1).map((r) => headers.map((_, i) => (r[i] ?? '').trim()))
  const numeric: number[] = []
  const categorical: number[] = []
  headers.forEach((_, i) => {
    const vals = rows.map((r) => r[i]).filter((v) => v !== '' && v.toUpperCase() !== 'NA')
    if (vals.length && vals.filter(isNum).length / vals.length >= 0.9) numeric.push(i)
    const distinct = new Set(vals).size
    if (vals.length && distinct <= Math.min(24, Math.max(2, rows.length / 2)) && (!numeric.includes(i) || distinct <= 8)) categorical.push(i)
  })
  return { headers, rows, numeric, categorical }
}

export interface Range {
  min: number
  max: number
}

export function range(vals: number[]): Range {
  let min = Infinity, max = -Infinity
  for (const v of vals) if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v }
  if (!Number.isFinite(min)) return { min: 0, max: 1 }
  if (min === max) return { min: min - 1, max: max + 1 }
  return { min, max }
}

/** Maps v from range r into [-half, half]. */
export const scale = (v: number, r: Range, half: number) => ((v - r.min) / (r.max - r.min) - 0.5) * 2 * half

/** Ray-casting point-in-polygon test (polygon in screen pixels). */
export function inPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Viridis-like ramp for numeric colouring, t in [0,1]. */
export function ramp(t: number): [number, number, number] {
  const stops: [number, number, number][] = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]]
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x)), f = x - i
  return stops[i].map((a, k) => (a + (stops[i + 1][k] - a) * f) / 255) as [number, number, number]
}

/** Pearson correlation of two numeric arrays (ignores non-finite pairs). */
export function pearson(a: number[], b: number[]): number {
  const p = a.map((x, i) => [x, b[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  const n = p.length
  if (n < 2) return NaN
  const mx = p.reduce((s, [x]) => s + x, 0) / n, my = p.reduce((s, [, y]) => s + y, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (const [x, y] of p) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2 }
  return sxy / Math.sqrt(sxx * syy)
}

/** Deterministic penguin-like sample (species means from the Palmer Penguins dataset). */
export function sampleCsv(): string {
  let seed = 42
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd())
  const sp: [string, string[], number, number[], number[]][] = [
    ['Adelie', ['Torgersen', 'Biscoe', 'Dream'], 90, [38.8, 18.3, 190, 3700], [2.7, 1.2, 6.5, 460]],
    ['Chinstrap', ['Dream'], 50, [48.8, 18.4, 196, 3733], [3.3, 1.1, 7.1, 384]],
    ['Gentoo', ['Biscoe'], 75, [47.5, 15.0, 217, 5076], [3.1, 1.0, 6.5, 504]],
  ]
  const out = ['species,island,bill_length_mm,bill_depth_mm,flipper_length_mm,body_mass_g,sex']
  for (const [name, islands, n, mu, sd] of sp)
    for (let i = 0; i < n; i++) {
      const male = rnd() < 0.5
      const k = male ? 0.6 : -0.6 // males are larger
      const v = mu.map((m, j) => m + sd[j] * (gauss() * 0.8 + k))
      out.push([name, islands[Math.floor(rnd() * islands.length)], v[0].toFixed(1), v[1].toFixed(1), Math.round(v[2]), Math.round(v[3] / 25) * 25, male ? 'male' : 'female'].join(','))
    }
  return out.join('\n')
}
