// Electrostatics of point charges: Coulomb field and potential, field-line tracing and
// equipotential isosurfaces (marching tetrahedra). Positions in cm, charges in nC, SI results.

export type V3 = [number, number, number]
export interface Charge { id: string; q: number; p: V3 }

export const K = 8.9875517923e9 // N·m²/C²
const CM = 0.01, NC = 1e-9

/** Electric field in V/m at point p (cm). */
export function field(cs: Charge[], p: V3): V3 {
  let ex = 0, ey = 0, ez = 0
  for (const c of cs) {
    const dx = (p[0] - c.p[0]) * CM, dy = (p[1] - c.p[1]) * CM, dz = (p[2] - c.p[2]) * CM
    const r2 = dx * dx + dy * dy + dz * dz
    if (r2 < 1e-14) continue
    const k = (K * c.q * NC) / (r2 * Math.sqrt(r2))
    ex += k * dx; ey += k * dy; ez += k * dz
  }
  return [ex, ey, ez]
}

/** Potential in volts at point p (cm), zero at infinity. */
export function potential(cs: Charge[], p: V3): number {
  let v = 0
  for (const c of cs) {
    const r = Math.hypot(p[0] - c.p[0], p[1] - c.p[1], p[2] - c.p[2]) * CM
    v += r < 1e-7 ? Math.sign(c.q) * 1e12 : (K * c.q * NC) / r
  }
  return v
}

export const mag = (v: V3) => Math.hypot(v[0], v[1], v[2])

/** Fibonacci sphere directions. */
export function sphereDirs(n: number): V3[] {
  const out: V3[] = []
  const ga = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y)
    out.push([Math.cos(ga * i) * r, y, Math.sin(ga * i) * r])
  }
  return out
}

/**
 * Traces a field line from `start` along +E (dir = 1) or −E (dir = −1) with RK4 on the unit direction field.
 * Stops near a charge of opposite sense, outside the box |x|,|y|,|z| ≤ L, or after maxSteps.
 */
export function traceLine(cs: Charge[], start: V3, dir: 1 | -1, L: number, h = 0.08, maxSteps = 1500): { pts: V3[]; end: 'charge' | 'box' | 'steps' } {
  const unit = (p: V3): V3 => { const e = field(cs, p); const m = mag(e) || 1; return [(dir * e[0]) / m, (dir * e[1]) / m, (dir * e[2]) / m] }
  const pts: V3[] = [start]
  let p = start
  for (let i = 0; i < maxSteps; i++) {
    // smaller steps close to charges
    let dmin = Infinity
    for (const c of cs) dmin = Math.min(dmin, Math.hypot(p[0] - c.p[0], p[1] - c.p[1], p[2] - c.p[2]))
    const s = Math.max(0.01, Math.min(h, dmin * 0.25))
    const k1 = unit(p)
    const k2 = unit([p[0] + (s / 2) * k1[0], p[1] + (s / 2) * k1[1], p[2] + (s / 2) * k1[2]])
    const k3 = unit([p[0] + (s / 2) * k2[0], p[1] + (s / 2) * k2[1], p[2] + (s / 2) * k2[2]])
    const k4 = unit([p[0] + s * k3[0], p[1] + s * k3[1], p[2] + s * k3[2]])
    p = [p[0] + (s / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), p[1] + (s / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]), p[2] + (s / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])]
    pts.push(p)
    for (const c of cs) if (c.q * dir < 0 && Math.hypot(p[0] - c.p[0], p[1] - c.p[1], p[2] - c.p[2]) < 0.12) return { pts: [...pts, [...c.p] as V3], end: 'charge' }
    if (Math.abs(p[0]) > L || Math.abs(p[1]) > L || Math.abs(p[2]) > L) return { pts, end: 'box' }
  }
  return { pts, end: 'steps' }
}

/** Field lines: seeded around positive charges (∝ |q|), plus lines from negative charges that no positive line reaches. */
export function fieldLines(cs: Charge[], perNc: number, L: number): V3[][] {
  const lines: V3[][] = []
  const qmax = Math.max(1e-9, ...cs.map((c) => Math.abs(c.q)))
  const pos = cs.filter((c) => c.q > 0), neg = cs.filter((c) => c.q < 0)
  const seed = (c: Charge, dir: 1 | -1) => {
    const n = Math.max(4, Math.round((perNc * Math.abs(c.q)) / qmax))
    for (const d of sphereDirs(n)) lines.push(traceLine(cs, [c.p[0] + 0.15 * d[0], c.p[1] + 0.15 * d[1], c.p[2] + 0.15 * d[2]], dir, L).pts)
  }
  pos.forEach((c) => seed(c, 1))
  const qp = pos.reduce((a, c) => a + c.q, 0), qn = -neg.reduce((a, c) => a + c.q, 0)
  // when negative charge dominates (or there are no positives), trace backwards from negatives too
  if (!pos.length || qn > qp * 1.05) neg.forEach((c) => seed({ ...c, q: c.q * (pos.length ? (qn - qp) / qn : 1) }, -1))
  return lines
}

// ---------- marching tetrahedra ----------

const CUBE: V3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
const TETS = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]]

/** Samples f on an n³ grid over [−L, L]³. */
export function sampleGrid(f: (p: V3) => number, n: number, L: number): Float64Array {
  const g = new Float64Array(n * n * n)
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    g[i + n * (j + n * k)] = f([-L + (2 * L * i) / (n - 1), -L + (2 * L * j) / (n - 1), -L + (2 * L * k) / (n - 1)])
  }
  return g
}

/** Triangle soup (xyz triples) of the iso-surface f = level. */
export function isosurface(g: Float64Array, n: number, L: number, level: number): Float32Array {
  const out: number[] = []
  const step = (2 * L) / (n - 1)
  const pv: V3[] = new Array(8), vv: number[] = new Array(8)
  const lerp = (a: number, b: number): V3 => {
    const t = (level - vv[a]) / (vv[b] - vv[a])
    return [pv[a][0] + t * (pv[b][0] - pv[a][0]), pv[a][1] + t * (pv[b][1] - pv[a][1]), pv[a][2] + t * (pv[b][2] - pv[a][2])]
  }
  const tri = (a: V3, b: V3, c: V3) => out.push(...a, ...b, ...c)
  for (let k = 0; k < n - 1; k++) for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    let lo = Infinity, hi = -Infinity
    for (let c = 0; c < 8; c++) {
      const [a, b, d] = CUBE[c]
      const v = g[i + a + n * (j + b + n * (k + d))]
      vv[c] = v
      if (v < lo) lo = v
      if (v > hi) hi = v
      pv[c] = [-L + (i + a) * step, -L + (j + b) * step, -L + (k + d) * step]
    }
    if (level < lo || level > hi || !Number.isFinite(hi - lo)) continue
    for (const t of TETS) {
      const inside = t.filter((c) => vv[c] >= level), outside = t.filter((c) => vv[c] < level)
      if (inside.length === 0 || inside.length === 4) continue
      if (inside.length === 1) tri(lerp(inside[0], outside[0]), lerp(inside[0], outside[1]), lerp(inside[0], outside[2]))
      else if (inside.length === 3) tri(lerp(outside[0], inside[0]), lerp(outside[0], inside[1]), lerp(outside[0], inside[2]))
      else {
        const p1 = lerp(inside[0], outside[0]), p2 = lerp(inside[0], outside[1]), p3 = lerp(inside[1], outside[0]), p4 = lerp(inside[1], outside[1])
        tri(p1, p2, p3)
        tri(p2, p4, p3)
      }
    }
  }
  return Float32Array.from(out)
}

export const PRESETS: Record<string, { name: string; charges: Omit<Charge, 'id'>[] }> = {
  dipole: { name: 'Dipole', charges: [{ q: 2, p: [-1.5, 0, 0] }, { q: -2, p: [1.5, 0, 0] }] },
  like: { name: 'Two like charges', charges: [{ q: 2, p: [-1.5, 0, 0] }, { q: 2, p: [1.5, 0, 0] }] },
  unequal: { name: 'Unequal pair (+3, −1)', charges: [{ q: 3, p: [-1.2, 0, 0] }, { q: -1, p: [1.8, 0, 0] }] },
  quad: { name: 'Quadrupole', charges: [{ q: 2, p: [-1.5, 0, -1.5] }, { q: -2, p: [1.5, 0, -1.5] }, { q: -2, p: [-1.5, 0, 1.5] }, { q: 2, p: [1.5, 0, 1.5] }] },
  plates: { name: 'Parallel rows (capacitor-like)', charges: [-2, -1, 0, 1, 2].flatMap((x) => [{ q: 1, p: [x * 0.8, 1.4, 0] as V3 }, { q: -1, p: [x * 0.8, -1.4, 0] as V3 }]) },
  triangle: { name: 'Triangle', charges: [{ q: 2, p: [0, 0, -1.8] }, { q: -1, p: [-1.6, 0, 1] }, { q: -1, p: [1.6, 0, 1] }] },
}
