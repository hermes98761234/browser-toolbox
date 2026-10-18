// Atomic Orbital Viewer logic: hydrogen-like wavefunctions (associated Laguerre radial part, real spherical
// harmonics from associated Legendre functions), probability helpers, and an isosurface extractor using
// marching tetrahedra (each grid cube split into six tetrahedra around its main diagonal; no lookup tables).
// Lengths in Bohr radii a0.

const fact = (n: number) => {
  let f = 1
  for (let i = 2; i <= n; i++) f *= i
  return f
}

/** Generalized Laguerre polynomial L_k^α(x) by the three-term recurrence. */
export function laguerre(k: number, alpha: number, x: number): number {
  if (k === 0) return 1
  let a = 1, b = 1 + alpha - x
  for (let i = 1; i < k; i++) {
    const c = ((2 * i + 1 + alpha - x) * b - (i + alpha) * a) / (i + 1)
    a = b
    b = c
  }
  return b
}

/** Associated Legendre P_l^m(x), m ≥ 0, with the Condon–Shortley phase. */
export function legendre(l: number, m: number, x: number): number {
  let pmm = 1
  if (m > 0) {
    const s = Math.sqrt(Math.max(0, (1 - x) * (1 + x)))
    let f = 1
    for (let i = 1; i <= m; i++) {
      pmm *= -f * s
      f += 2
    }
  }
  if (l === m) return pmm
  let pm1 = x * (2 * m + 1) * pmm
  if (l === m + 1) return pm1
  let pl = 0
  for (let ll = m + 2; ll <= l; ll++) {
    pl = (x * (2 * ll - 1) * pm1 - (ll + m - 1) * pmm) / (ll - m)
    pmm = pm1
    pm1 = pl
  }
  return pl
}

/** Normalized radial function R_nl(r) for nuclear charge Z. */
export function radial(n: number, l: number, r: number, Z = 1): number {
  const rho = (2 * Z * r) / n
  const norm = Math.sqrt(((2 * Z) / n) ** 3 * (fact(n - l - 1) / (2 * n * fact(n + l))))
  return norm * Math.exp(-rho / 2) * rho ** l * laguerre(n - l - 1, 2 * l + 1, rho)
}

/** Real spherical harmonic (m > 0 → cos mφ, m < 0 → sin |m|φ). */
export function realY(l: number, m: number, theta: number, phi: number): number {
  const am = Math.abs(m)
  const N = Math.sqrt(((2 * l + 1) / (4 * Math.PI)) * (fact(l - am) / fact(l + am)))
  const P = legendre(l, am, Math.cos(theta))
  // Undo the Condon–Shortley sign so that e.g. p_x is positive along +x.
  const cs = am % 2 ? -1 : 1
  if (m === 0) return N * P
  return Math.SQRT2 * N * P * cs * (m > 0 ? Math.cos(am * phi) : Math.sin(am * phi))
}

export function psi(n: number, l: number, m: number, x: number, y: number, z: number, Z = 1): number {
  const r = Math.hypot(x, y, z)
  if (r < 1e-12) return l === 0 ? radial(n, 0, 0, Z) * realY(0, 0, 0, 0) : 0
  return radial(n, l, r, Z) * realY(l, m, Math.acos(Math.max(-1, Math.min(1, z / r))), Math.atan2(y, x))
}

const SUB = ['s', 'p', 'd', 'f', 'g']
const MNAMES: Record<number, Record<number, string>> = {
  1: { 0: 'z', 1: 'x', [-1]: 'y' },
  2: { 0: 'z²', 1: 'xz', [-1]: 'yz', 2: 'x²−y²', [-2]: 'xy' },
  3: { 0: 'z³', 1: 'xz²', [-1]: 'yz²', 2: 'z(x²−y²)', [-2]: 'xyz', 3: 'x(x²−3y²)', [-3]: 'y(3x²−y²)' },
}
export const orbitalName = (n: number, l: number, m: number) => `${n}${SUB[l]}${l > 0 && MNAMES[l]?.[m] ? `_${MNAMES[l][m]}` : l > 0 ? `(m=${m})` : ''}`

/** Expectation ⟨r⟩ = (a0/2Z)·[3n² − l(l+1)]. */
export const meanR = (n: number, l: number, Z = 1) => (3 * n * n - l * (l + 1)) / (2 * Z)

/** Radius containing `p` of the radial probability (trapezoid integration of r²R²). */
export function radiusFor(n: number, l: number, Z = 1, p = 0.995): number {
  const dr = 0.02 / Z
  let acc = 0, r = 0, prev = 0
  while (r < 400) {
    r += dr
    const v = r * r * radial(n, l, r, Z) ** 2
    acc += ((v + prev) / 2) * dr
    prev = v
    if (acc >= p) return r
  }
  return r
}

export function integrateRadial(n: number, l: number, Z = 1, rMax = 200, steps = 40000): number {
  const h = rMax / steps
  let s = 0
  for (let i = 1; i < steps; i++) {
    const r = i * h
    s += r * r * radial(n, l, r, Z) ** 2 * (i % 2 ? 4 : 2)
  }
  return (s * h) / 3
}

// ---------- sampled field ----------

export interface Field { N: number; ext: number; v: Float32Array }

export function sampleField(f: (x: number, y: number, z: number) => number, N: number, ext: number): Field {
  const v = new Float32Array(N * N * N)
  const h = (2 * ext) / (N - 1)
  let i = 0
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let q = 0; q < N; q++) v[i++] = f(-ext + q * h, -ext + j * h, -ext + k * h)
  return { N, ext, v }
}

/** Iso value so that the region |ψ| ≥ iso holds fraction p of the total probability on the grid. */
export function isoForProbability(field: Field, p: number): number {
  const a = Array.from(field.v, (x) => x * x).sort((x, y) => y - x)
  const total = a.reduce((s, x) => s + x, 0)
  let acc = 0
  for (const x of a) {
    acc += x
    if (acc >= p * total) return Math.sqrt(x)
  }
  return 0
}

export interface Mesh { positions: Float32Array; normals: Float32Array; indices: Uint32Array }

// Kuhn split of a cube (corner bit order x=1, y=2, z=4) into six tetrahedra sharing the 0–7 diagonal.
const TETS = [[0, 7, 1, 3], [0, 7, 3, 2], [0, 7, 2, 6], [0, 7, 6, 4], [0, 7, 4, 5], [0, 7, 5, 1]]

/** Extracts the surface field = iso (inside = value > iso) by marching tetrahedra. */
export function isosurface(field: Field, iso: number, sign = 1): Mesh {
  const { N, ext, v } = field
  const h = (2 * ext) / (N - 1)
  const at = (q: number, j: number, k: number) => sign * v[q + N * (j + N * k)]
  const grad = (idx: number): [number, number, number] => {
    const q = idx % N, j = Math.floor(idx / N) % N, k = Math.floor(idx / (N * N))
    const g = (a: number, b: number, c: number) => at(Math.min(N - 1, Math.max(0, a)), Math.min(N - 1, Math.max(0, b)), Math.min(N - 1, Math.max(0, c)))
    return [g(q + 1, j, k) - g(q - 1, j, k), g(q, j + 1, k) - g(q, j - 1, k), g(q, j, k + 1) - g(q, j, k - 1)]
  }
  const pos: number[] = [], nor: number[] = [], ind: number[] = []
  const cache = new Map<number, number>()
  const vert = (a: number, b: number): number => {
    const lo = Math.min(a, b), hi = Math.max(a, b)
    const key = lo * N * N * N + hi
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    const va = sign * v[a], vb = sign * v[b]
    const t = va === vb ? 0.5 : (iso - va) / (vb - va)
    const ca = [a % N, Math.floor(a / N) % N, Math.floor(a / (N * N))], cb = [b % N, Math.floor(b / N) % N, Math.floor(b / (N * N))]
    for (let d = 0; d < 3; d++) pos.push(-ext + (ca[d] + t * (cb[d] - ca[d])) * h)
    const ga = grad(a), gb = grad(b)
    const n = [0, 1, 2].map((d) => -(ga[d] + t * (gb[d] - ga[d])))
    const len = Math.hypot(n[0], n[1], n[2]) || 1
    nor.push(n[0] / len, n[1] / len, n[2] / len)
    const id = pos.length / 3 - 1
    cache.set(key, id)
    return id
  }
  const tri = (a: number, b: number, c: number) => {
    if (a === b || b === c || a === c) return
    // Wind counter-clockwise when seen from outside (outward = along the interpolated normal).
    const P = (i: number) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]
    const pa = P(a), pb = P(b), pc = P(c)
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], w = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]]
    const cr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
    const nn = [0, 1, 2].map((d) => nor[3 * a + d] + nor[3 * b + d] + nor[3 * c + d])
    if (cr[0] * nn[0] + cr[1] * nn[1] + cr[2] * nn[2] < 0) ind.push(a, c, b)
    else ind.push(a, b, c)
  }
  const corner = new Array<number>(8)
  for (let k = 0; k < N - 1; k++) for (let j = 0; j < N - 1; j++) for (let q = 0; q < N - 1; q++) {
    let any = 0, all = 1
    for (let c = 0; c < 8; c++) {
      const idx = q + (c & 1) + N * (j + ((c >> 1) & 1) + N * (k + ((c >> 2) & 1)))
      corner[c] = idx
      const inside = sign * v[idx] > iso ? 1 : 0
      any |= inside
      all &= inside
    }
    if (!any || all) continue
    for (const t of TETS) {
      const ids = t.map((c) => corner[c])
      const ins = ids.filter((i) => sign * v[i] > iso), outs = ids.filter((i) => sign * v[i] <= iso)
      if (ins.length === 0 || ins.length === 4) continue
      if (ins.length === 1 || ins.length === 3) {
        const [p, qs] = ins.length === 1 ? [ins[0], outs] : [outs[0], ins]
        tri(vert(p, qs[0]), vert(p, qs[1]), vert(p, qs[2]))
      } else {
        const a = vert(ins[0], outs[0]), b = vert(ins[0], outs[1]), c = vert(ins[1], outs[1]), d = vert(ins[1], outs[0])
        tri(a, b, c)
        tri(a, c, d)
      }
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint32Array(ind) }
}

export function meshArea(m: Mesh): number {
  let s = 0
  const p = m.positions
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [m.indices[i] * 3, m.indices[i + 1] * 3, m.indices[i + 2] * 3]
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], w = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]]
    s += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2
  }
  return s
}

/** Draws points distributed as |ψ|² (cell chosen by inverse CDF, jittered inside the cell). */
export function samplePoints(field: Field, count: number, rnd: () => number = Math.random): { xyz: Float32Array; sign: Int8Array } {
  const { N, ext, v } = field
  const h = (2 * ext) / (N - 1)
  const cdf = new Float64Array(v.length)
  let acc = 0
  for (let i = 0; i < v.length; i++) cdf[i] = acc += v[i] * v[i]
  const xyz = new Float32Array(count * 3), sign = new Int8Array(count)
  for (let n = 0; n < count; n++) {
    const target = rnd() * acc
    let lo = 0, hi = v.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cdf[mid] < target) lo = mid + 1
      else hi = mid
    }
    const q = lo % N, j = Math.floor(lo / N) % N, k = Math.floor(lo / (N * N))
    xyz[3 * n] = -ext + (q + rnd() - 0.5) * h
    xyz[3 * n + 1] = -ext + (j + rnd() - 0.5) * h
    xyz[3 * n + 2] = -ext + (k + rnd() - 0.5) * h
    sign[n] = v[lo] >= 0 ? 1 : -1
  }
  return { xyz, sign }
}
