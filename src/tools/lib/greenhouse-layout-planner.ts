// Greenhouse bench layout: longitudinal or peninsula benches with aisles, plant counts per bench for
// square or triangular (offset) spacing, and growing-area stats. Metres; length along x, width along z.

export interface GhOpts {
  length: number
  width: number
  layout: 'longitudinal' | 'peninsula'
  benchW: number // bench depth across (m)
  aisle: number // aisle between benches (m)
  mainAisle: number // central aisle in peninsula layout (m)
  endClear: number // clearance at each gable end (m)
  spacing: number // plant centre-to-centre spacing (m)
  pattern: 'square' | 'triangular'
  edge: number // margin from bench edge to first plant centre minus half spacing (m)
}

export interface Bench { x: number; z: number; lx: number; lz: number } // centre and size along x / z

/** Benches that fit the floor with the given aisles, centred on the floor. */
export function layoutBenches(o: GhOpts): Bench[] {
  const out: Bench[] = []
  const L = o.length - 2 * o.endClear
  if (L <= 0 || o.benchW <= 0) return out
  if (o.layout === 'longitudinal') {
    const n = Math.floor((o.width + o.aisle) / (o.benchW + o.aisle) + 1e-9)
    const used = n * o.benchW + (n - 1) * o.aisle
    for (let i = 0; i < n; i++) out.push({ x: 0, z: -used / 2 + o.benchW / 2 + i * (o.benchW + o.aisle), lx: L, lz: o.benchW })
  } else {
    const lz = (o.width - o.mainAisle) / 2
    if (lz <= 0.2) return out
    const m = Math.floor((L + o.aisle) / (o.benchW + o.aisle) + 1e-9)
    const used = m * o.benchW + (m - 1) * o.aisle
    for (let i = 0; i < m; i++) {
      const x = -used / 2 + o.benchW / 2 + i * (o.benchW + o.aisle)
      out.push({ x, z: -o.width / 2 + lz / 2, lx: o.benchW, lz }, { x, z: o.width / 2 - lz / 2, lx: o.benchW, lz })
    }
  }
  return out
}

/** Plant centres on a bench of a × b (local coords from the corner). */
export function plantGrid(a: number, b: number, s: number, pattern: GhOpts['pattern'], edge = 0): [number, number][] {
  const out: [number, number][] = []
  const ua = a - 2 * edge, ub = b - 2 * edge
  if (s <= 0 || ua < s || ub < s) return out
  if (pattern === 'square') {
    const na = Math.floor(ua / s + 1e-9), nb = Math.floor(ub / s + 1e-9)
    const oa = edge + (ua - na * s) / 2 + s / 2, ob = edge + (ub - nb * s) / 2 + s / 2
    for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) out.push([oa + i * s, ob + j * s])
    return out
  }
  const pitch = (s * Math.sqrt(3)) / 2
  const rows = Math.floor((ub - s) / pitch + 1e-9) + 1
  const ob = edge + (ub - ((rows - 1) * pitch + s)) / 2 + s / 2
  for (let j = 0; j < rows; j++) {
    const shift = j % 2 ? s / 2 : 0
    const na = Math.floor((ua - shift) / s + 1e-9)
    const oa = edge + shift + s / 2
    for (let i = 0; i < na; i++) out.push([oa + i * s, ob + j * pitch])
  }
  return out
}

export function stats(o: GhOpts, benches: Bench[]) {
  const floor = o.length * o.width
  const bench = benches.reduce((a, b) => a + b.lx * b.lz, 0)
  const plants = benches.reduce((a, b) => a + plantGrid(Math.max(b.lx, b.lz), Math.min(b.lx, b.lz), o.spacing, o.pattern, o.edge).length, 0)
  return { floor, bench, plants, util: floor ? bench / floor : 0, perM2: bench ? plants / bench : 0 }
}

/** Gable roof height at distance d (0..width/2) from the centre line; hoop = circular arc through eave and ridge. */
export function roofY(shape: 'gable' | 'hoop', width: number, eave: number, ridge: number, d: number): number {
  const h = Math.max(0, ridge - eave), w = width / 2
  if (shape === 'gable') return ridge - (h * Math.min(w, Math.abs(d))) / w
  if (h <= 0) return eave
  // circle through (±w, eave) and (0, ridge): centre at (0, ridge − R)
  const R = (w * w + h * h) / (2 * h)
  return ridge - R + Math.sqrt(Math.max(0, R * R - d * d))
}
