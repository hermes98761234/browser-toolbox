// Lighting Layout Calculator logic: lumen (zonal cavity) method, typical coefficient-of-utilization
// tables, grid layout and a direct-component point-by-point check with a cos^m intensity model.
// The CU values are typical figures for generic luminaire classes, not from any specific product.

export type Kind = 'troffer' | 'highbay' | 'pendant'
export const KINDS: Record<Kind, { name: string; m: number; shr: number; up: number }> = {
  troffer: { name: 'Recessed LED troffer / panel (wide direct)', m: 1, shr: 1.4, up: 0 },
  highbay: { name: 'LED high-bay (medium-narrow direct)', m: 3, shr: 1.0, up: 0 },
  pendant: { name: 'Direct/indirect pendant (≈ 30% up)', m: 1, shr: 1.3, up: 0.3 },
}

// CU × 100 for ceiling reflectance 80%, wall 50/30/10%, floor 20%, RCR 0..10.
const CU80: Record<Kind, [number, number, number][]> = {
  troffer: [[118, 118, 118], [109, 105, 101], [100, 93, 87], [92, 83, 76], [84, 74, 67], [77, 67, 59], [71, 60, 53], [65, 54, 47], [60, 49, 43], [56, 45, 39], [52, 41, 36]],
  highbay: [[110, 110, 110], [104, 101, 98], [97, 92, 88], [91, 85, 80], [86, 78, 73], [80, 72, 67], [75, 67, 62], [71, 62, 57], [66, 58, 53], [62, 54, 49], [59, 50, 46]],
  pendant: [[105, 105, 105], [95, 91, 87], [86, 80, 74], [78, 70, 64], [71, 62, 56], [64, 55, 49], [58, 49, 43], [53, 44, 38], [49, 40, 34], [45, 36, 31], [41, 33, 28]],
}
// Typical scaling for darker ceilings (indirect light depends much more on the ceiling).
const CEIL: Record<Kind, [number, number][]> = {
  troffer: [[80, 1], [70, 0.97], [50, 0.92], [30, 0.88], [0, 0.82]],
  highbay: [[80, 1], [70, 0.98], [50, 0.94], [30, 0.91], [0, 0.86]],
  pendant: [[80, 1], [70, 0.93], [50, 0.8], [30, 0.68], [0, 0.52]],
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
function interp(pts: [number, number][], x: number): number {
  const s = [...pts].sort((a, b) => a[0] - b[0])
  if (x <= s[0][0]) return s[0][1]
  for (let i = 1; i < s.length; i++) if (x <= s[i][0]) return lerp(s[i - 1][1], s[i][1], (x - s[i - 1][0]) / (s[i][0] - s[i - 1][0]))
  return s[s.length - 1][1]
}

/** Room cavity ratio: 5·h_rc·(L + W)/(L·W), h_rc = luminaire height above the work plane. */
export const rcr = (L: number, W: number, hrc: number) => (5 * hrc * (L + W)) / (L * W)
/** European room index K = L·W / (h_m·(L + W)) = 5 / RCR. */
export const roomIndex = (L: number, W: number, hm: number) => (L * W) / (hm * (L + W))

/** Typical CU, interpolated on RCR (0–10), wall reflectance (10–50%) and ceiling reflectance (0–80%). */
export function cu(kind: Kind, r: number, ceiling: number, wall: number): number {
  const x = Math.min(10, Math.max(0, r))
  const i = Math.min(9, Math.floor(x)), t = x - i
  const row = [0, 1, 2].map((k) => lerp(CU80[kind][i][k], CU80[kind][i + 1][k], t))
  const atWall = interp([[50, row[0]], [30, row[1]], [10, row[2]]], wall)
  return (atWall / 100) * interp(CEIL[kind], ceiling)
}

export function fixtureCount(E: number, area: number, lumens: number, CU: number, MF: number): number {
  return (E * area) / (lumens * CU * MF)
}

/** Grid close to the room's aspect ratio with at least n fixtures. */
export function grid(n: number, L: number, W: number): { cols: number; rows: number } {
  if (n <= 0) return { cols: 0, rows: 0 }
  let best = { cols: 1, rows: n, score: Infinity }
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    const sx = L / cols, sy = W / rows
    const score = cols * rows - n + 2 * Math.abs(Math.log(sx / sy))
    if (score < best.score) best = { cols, rows, score }
  }
  return { cols: best.cols, rows: best.rows }
}

export interface Fixture { x: number; y: number }
export function positions(cols: number, rows: number, L: number, W: number): Fixture[] {
  const out: Fixture[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: (L / cols) * (c + 0.5), y: (W / rows) * (r + 0.5) })
  return out
}

/**
 * Direct horizontal illuminance on the work plane at (x, y) from fixtures with intensity I(θ) = I0·cos^m θ.
 * I0 follows from the downward flux: Φ_down = 2π·I0/(m + 1).
 */
export function directLux(fx: Fixture[], x: number, y: number, h: number, flux: number, m: number): number {
  const I0 = (flux * (m + 1)) / (2 * Math.PI)
  let e = 0
  for (const f of fx) {
    const d2 = (f.x - x) ** 2 + (f.y - y) ** 2 + h * h
    const cos = h / Math.sqrt(d2)
    e += (I0 * cos ** m * cos) / d2
  }
  return e
}

export interface PointGrid { nx: number; ny: number; values: number[]; min: number; avg: number; max: number }
/** Illuminance grid over the room; min/avg/max exclude a border strip (EN 12464-1 uses 0.5 m). */
export function pointGrid(fx: Fixture[], L: number, W: number, h: number, flux: number, m: number, n = 24, border = 0.5): PointGrid {
  const nx = Math.max(4, Math.round(n * Math.sqrt(L / W))), ny = Math.max(4, Math.round(n * Math.sqrt(W / L)))
  const values: number[] = [], inner: number[] = []
  const b = Math.min(border, L / 4, W / 4)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = ((i + 0.5) * L) / nx, y = ((j + 0.5) * W) / ny
    const e = directLux(fx, x, y, h, flux, m)
    values.push(e)
    if (x >= b && x <= L - b && y >= b && y <= W - b) inner.push(e)
  }
  const use = inner.length ? inner : values
  const avg = use.reduce((a, v) => a + v, 0) / use.length
  return { nx, ny, values, min: Math.min(...use), avg, max: Math.max(...use) }
}

export const SPACES: [string, number][] = [
  ['Office – general / open plan', 500], ['Office – CAD / detailed work', 750], ['Meeting room', 500], ['Classroom', 300], ['Lecture hall', 500],
  ['Corridor', 100], ['Stairs', 150], ['Restroom', 200], ['Retail – sales floor', 750], ['Supermarket', 750], ['Warehouse – bulk storage', 150],
  ['Warehouse – picking', 300], ['Workshop – general', 300], ['Workshop – fine assembly', 750], ['Commercial kitchen', 500], ['Hospital ward (general)', 100],
  ['Sports hall – recreational', 300], ['Car park (indoor)', 75], ['Laboratory', 500], ['Residential kitchen', 300],
]
