// UV layout analysis: per-triangle texel density and anisotropy, UV islands, overlaps, coverage.
// Input is a triangle soup: pos has 9 floats per triangle, uv has 6.

export interface UvMesh {
  pos: Float32Array
  uv: Float32Array
  nrm?: Float32Array
}

export interface UvReport {
  tris: number
  /** UV area / 3D area, normalized so the mesh average is 1 (1 = uniform texel density). */
  density: Float32Array
  /** Ratio of the larger to the smaller singular value of the 3D→UV map (1 = no shear/stretch). */
  aniso: Float32Array
  island: Int32Array
  islands: number
  overlap: Uint8Array
  overlapTris: number
  /** Share of the 0–1 square covered by at least one triangle. */
  coverage: number
  /** Share of covered texels that are covered more than once. */
  overlapShare: number
  outside: number
  flipped: number
  degenerate: number
  uvArea: number
  area3d: number
  bounds: [number, number, number, number]
}

export function triArea3(p: ArrayLike<number>, o: number): number {
  const ax = p[o + 3] - p[o], ay = p[o + 4] - p[o + 1], az = p[o + 5] - p[o + 2]
  const bx = p[o + 6] - p[o], by = p[o + 7] - p[o + 1], bz = p[o + 8] - p[o + 2]
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx
  return Math.hypot(cx, cy, cz) / 2
}

/** Signed UV area (positive = counter-clockwise). */
export function triAreaUv(u: ArrayLike<number>, o: number): number {
  return ((u[o + 2] - u[o]) * (u[o + 5] - u[o + 1]) - (u[o + 4] - u[o]) * (u[o + 3] - u[o + 1])) / 2
}

/** Singular values (max, min) of the linear map taking the 3D triangle (in its own plane) to UV. */
export function singular(p: ArrayLike<number>, po: number, u: ArrayLike<number>, uo: number): [number, number] {
  const e1 = [p[po + 3] - p[po], p[po + 4] - p[po + 1], p[po + 5] - p[po + 2]]
  const e2 = [p[po + 6] - p[po], p[po + 7] - p[po + 1], p[po + 8] - p[po + 2]]
  const l1 = Math.hypot(e1[0], e1[1], e1[2])
  if (l1 === 0) return [0, 0]
  const x = e1.map((v) => v / l1)
  const d = e2[0] * x[0] + e2[1] * x[1] + e2[2] * x[2]
  const h = Math.hypot(e2[0] - d * x[0], e2[1] - d * x[1], e2[2] - d * x[2])
  if (h === 0) return [0, 0]
  // 3D triangle in local 2D: (0,0), (l1,0), (d,h). UV edges: a=(du1,dv1), b=(du2,dv2).
  const du1 = u[uo + 2] - u[uo], dv1 = u[uo + 3] - u[uo + 1]
  const du2 = u[uo + 4] - u[uo], dv2 = u[uo + 5] - u[uo + 1]
  // J * [l1 d; 0 h] = [du1 du2; dv1 dv2]  →  J = UV * inverse(S)
  const j11 = du1 / l1, j21 = dv1 / l1
  const j12 = (du2 - j11 * d) / h, j22 = (dv2 - j21 * d) / h
  const a = j11 * j11 + j21 * j21, b = j11 * j12 + j21 * j22, c = j12 * j12 + j22 * j22
  const tr = a + c, det = a * c - b * b
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
  return [Math.sqrt(Math.max(0, tr / 2 + disc)), Math.sqrt(Math.max(0, tr / 2 - disc))]
}

class DSU {
  p: Int32Array
  constructor(n: number) {
    this.p = new Int32Array(n).map((_, i) => i)
  }
  find(i: number): number {
    while (this.p[i] !== i) i = this.p[i] = this.p[this.p[i]]
    return i
  }
  union(a: number, b: number) {
    a = this.find(a)
    b = this.find(b)
    if (a !== b) this.p[a] = b
  }
}

const key = (m: UvMesh, t: number, k: number) => {
  const q = (v: number) => Math.round(v * 1e5)
  const p = m.pos, u = m.uv
  return `${q(p[9 * t + 3 * k])},${q(p[9 * t + 3 * k + 1])},${q(p[9 * t + 3 * k + 2])}|${q(u[6 * t + 2 * k])},${q(u[6 * t + 2 * k + 1])}`
}

/** Connected UV islands: triangles sharing an edge with identical position and UV. */
export function islands(m: UvMesh): { id: Int32Array; count: number } {
  const n = m.uv.length / 6
  const dsu = new DSU(n)
  const vid = new Map<string, number>()
  const vk = new Int32Array(n * 3)
  for (let t = 0; t < n; t++)
    for (let k = 0; k < 3; k++) {
      const s = key(m, t, k)
      let v = vid.get(s)
      if (v === undefined) vid.set(s, (v = vid.size))
      vk[3 * t + k] = v
    }
  const edges = new Map<number, number>()
  const V = vid.size + 1
  for (let t = 0; t < n; t++)
    for (let k = 0; k < 3; k++) {
      const a = vk[3 * t + k], b = vk[3 * t + ((k + 1) % 3)]
      const e = Math.min(a, b) * V + Math.max(a, b)
      const o = edges.get(e)
      if (o === undefined) edges.set(e, t)
      else dsu.union(o, t)
    }
  const id = new Int32Array(n)
  const remap = new Map<number, number>()
  for (let t = 0; t < n; t++) {
    const r = dsu.find(t)
    let c = remap.get(r)
    if (c === undefined) remap.set(r, (c = remap.size))
    id[t] = c
  }
  return { id, count: remap.size }
}

/**
 * Rasterizes all triangles into a res×res grid over the 0–1 square (with UDIM-style wrap ignored).
 * Samples are jittered by an irrational sub-pixel offset so shared edges never double-count.
 */
export function rasterOverlap(m: UvMesh, res = 512): { overlap: Uint8Array; covered: number; multi: number } {
  const n = m.uv.length / 6
  const first = new Int32Array(res * res).fill(-1)
  const multiPix = new Uint8Array(res * res)
  const overlap = new Uint8Array(n)
  const JX = 0.5 + 0.000137, JY = 0.5 - 0.000291
  const u = m.uv
  for (let t = 0; t < n; t++) {
    let x0 = u[6 * t] * res, y0 = u[6 * t + 1] * res
    let x1 = u[6 * t + 2] * res, y1 = u[6 * t + 3] * res
    const x2 = u[6 * t + 4] * res, y2 = u[6 * t + 5] * res
    let area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if (Math.abs(area) < 1e-12) continue
    if (area < 0) {
      ;[x0, x1] = [x1, x0]
      ;[y0, y1] = [y1, y0]
      area = -area
    }
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(res - 1, Math.ceil(Math.max(x0, x1, x2)))
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(res - 1, Math.ceil(Math.max(y0, y1, y2)))
    for (let y = minY; y <= maxY; y++) {
      const py = y + JY
      for (let x = minX; x <= maxX; x++) {
        const px = x + JX
        const w0 = (x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)
        const w1 = (x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)
        const w2 = (x0 - px) * (y1 - py) - (x1 - px) * (y0 - py)
        if (w0 < 0 || w1 < 0 || w2 < 0) continue
        const i = y * res + x
        const f = first[i]
        if (f < 0) first[i] = t
        else if (f !== t) {
          multiPix[i] = 1
          overlap[t] = 1
          overlap[f] = 1
        }
      }
    }
  }
  let covered = 0, multi = 0
  for (let i = 0; i < res * res; i++) {
    if (first[i] >= 0) covered++
    if (multiPix[i]) multi++
  }
  return { overlap, covered, multi }
}

export function analyze(m: UvMesh, res = 512): UvReport {
  const n = m.uv.length / 6
  const a3 = new Float64Array(n), au = new Float64Array(n)
  let sum3 = 0, sumU = 0, flipped = 0, degenerate = 0, outside = 0
  let bu0 = Infinity, bv0 = Infinity, bu1 = -Infinity, bv1 = -Infinity
  for (let t = 0; t < n; t++) {
    a3[t] = triArea3(m.pos, 9 * t)
    const s = triAreaUv(m.uv, 6 * t)
    au[t] = Math.abs(s)
    if (s < 0) flipped++
    if (au[t] < 1e-12 || a3[t] < 1e-12) degenerate++
    sum3 += a3[t]
    sumU += au[t]
    let out = false
    for (let k = 0; k < 3; k++) {
      const uu = m.uv[6 * t + 2 * k], vv = m.uv[6 * t + 2 * k + 1]
      bu0 = Math.min(bu0, uu); bu1 = Math.max(bu1, uu); bv0 = Math.min(bv0, vv); bv1 = Math.max(bv1, vv)
      if (uu < -1e-6 || uu > 1 + 1e-6 || vv < -1e-6 || vv > 1 + 1e-6) out = true
    }
    if (out) outside++
  }
  const density = new Float32Array(n), aniso = new Float32Array(n)
  for (let t = 0; t < n; t++) {
    density[t] = a3[t] > 0 && sumU > 0 ? au[t] / sumU / (a3[t] / sum3) : 0
    const [s1, s2] = singular(m.pos, 9 * t, m.uv, 6 * t)
    aniso[t] = s2 > 0 ? s1 / s2 : s1 > 0 ? Infinity : 1
  }
  const isl = islands(m)
  const r = rasterOverlap(m, res)
  let overlapTris = 0
  for (let t = 0; t < n; t++) overlapTris += r.overlap[t]
  return {
    tris: n, density, aniso, island: isl.id, islands: isl.count, overlap: r.overlap, overlapTris,
    coverage: r.covered / (res * res), overlapShare: r.covered ? r.multi / r.covered : 0,
    outside, flipped, degenerate, uvArea: sumU, area3d: sum3,
    bounds: n ? [bu0, bv0, bu1, bv1] : [0, 0, 1, 1],
  }
}

/** Area-weighted percentile of a per-triangle metric. */
export function weightedPercentile(vals: ArrayLike<number>, w: ArrayLike<number>, p: number): number {
  const idx = Array.from({ length: vals.length }, (_, i) => i).filter((i) => Number.isFinite(vals[i]) && w[i] > 0)
  if (!idx.length) return NaN
  idx.sort((a, b) => vals[a] - vals[b])
  const tot = idx.reduce((s, i) => s + w[i], 0)
  let acc = 0
  for (const i of idx) {
    acc += w[i]
    if (acc >= p * tot) return vals[i]
  }
  return vals[idx[idx.length - 1]]
}

/** Diverging color for log2(density): blue = too many texels, red = too few, white = ideal. */
export function densityColor(d: number): [number, number, number] {
  if (!(d > 0)) return [0.4, 0.4, 0.4]
  const x = Math.max(-1, Math.min(1, Math.log2(d) / 2))
  return x >= 0 ? [1 - 0.75 * x, 1 - 0.55 * x, 1] : [1, 1 + 0.65 * x, 1 + 0.8 * x]
}

export function anisoColor(a: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, Number.isFinite(a) ? Math.log2(a) / 2 : 1))
  return [0.95, 0.95 - 0.55 * x, 0.95 - 0.85 * x]
}
