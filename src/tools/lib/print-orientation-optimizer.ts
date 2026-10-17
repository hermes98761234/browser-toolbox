// Print orientation search: sample "up" directions, score support volume, overhang area, height and bed contact.
// Model space Z-up, millimetres, non-indexed triangles (xyz × 3 per face).

export type V3 = [number, number, number]

/** Evenly spread unit vectors on the sphere (Fibonacci lattice). */
export function fibonacciDirs(n: number): V3[] {
  const out: V3[] = []
  const g = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * (i + 0.5)) / n
    const r = Math.sqrt(1 - z * z)
    out.push([Math.cos(g * i) * r, Math.sin(g * i) * r, z])
  }
  return out
}

/** Rotation matrix (row-major 3×3) turning unit vector u onto +Z (Rodrigues). */
export function rotationToUp(u: V3): number[] {
  const [x, y, z] = u
  if (z > 1 - 1e-9) return [1, 0, 0, 0, 1, 0, 0, 0, 1]
  if (z < -1 + 1e-9) return [1, 0, 0, 0, -1, 0, 0, 0, -1]
  // axis k = u × Z = (y, −x, 0)/s, angle θ with cos θ = z
  const s = Math.hypot(x, y)
  const kx = y / s, ky = -x / s
  const c = z, sn = s, t = 1 - c
  return [
    t * kx * kx + c, t * kx * ky, sn * ky,
    t * kx * ky, t * ky * ky + c, -sn * kx,
    -sn * ky, sn * kx, c,
  ]
}

/** Applies a rotation, drops onto z = 0 and centres X/Y. */
export function applyRotation(pos: Float32Array, m: number[]): Float32Array {
  const out = new Float32Array(pos.length)
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = m[3 * k] * pos[i] + m[3 * k + 1] * pos[i + 1] + m[3 * k + 2] * pos[i + 2]
      out[i + k] = v
      if (v < lo[k]) lo[k] = v
      if (v > hi[k]) hi[k] = v
    }
  }
  const off = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]]
  for (let i = 0; i < out.length; i += 3) for (let k = 0; k < 3; k++) out[i + k] -= off[k]
  return out
}

export interface Faces { n: Float64Array; c: Float64Array; a: Float64Array; count: number; verts: Float32Array }

/** Unit normals, centroids and areas (optionally subsampled for speed; areas are rescaled). */
export function faceData(pos: Float32Array, maxFaces = 30000): Faces {
  const total = pos.length / 9
  const stride = Math.max(1, Math.ceil(total / maxFaces))
  const count = Math.ceil(total / stride)
  const n = new Float64Array(count * 3), c = new Float64Array(count * 3), a = new Float64Array(count)
  let j = 0
  for (let f = 0; f < total; f += stride, j++) {
    const o = f * 9
    const ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2]
    const vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    n.set([nx / len, ny / len, nz / len], j * 3)
    c.set([(pos[o] + pos[o + 3] + pos[o + 6]) / 3, (pos[o + 1] + pos[o + 4] + pos[o + 7]) / 3, (pos[o + 2] + pos[o + 5] + pos[o + 8]) / 3], j * 3)
    a[j] = (len / 2) * stride
  }
  // vertex sample for extents
  const vstride = Math.max(1, Math.ceil(pos.length / 3 / 60000))
  const verts = new Float32Array(Math.ceil(pos.length / 3 / vstride) * 3)
  for (let i = 0, k = 0; i < pos.length; i += 3 * vstride, k += 3) verts.set([pos[i], pos[i + 1], pos[i + 2]], k)
  return { n, c, a, count: j, verts }
}

export interface Candidate { up: V3; support: number; overhang: number; height: number; bed: number; footprint: [number, number]; score: number; pareto: boolean }

/** Metrics for one up-direction. Threshold = maximum printable overhang angle from vertical (degrees). */
export function evaluate(F: Faces, up: V3, threshold: number, bedTol = 0.2): Omit<Candidate, 'score' | 'pareto'> {
  const [ux, uy, uz] = up
  // orthonormal basis for the footprint
  const ref: V3 = Math.abs(uz) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  let ex: V3 = [uy * ref[2] - uz * ref[1], uz * ref[0] - ux * ref[2], ux * ref[1] - uy * ref[0]]
  const el = Math.hypot(...ex)
  ex = [ex[0] / el, ex[1] / el, ex[2] / el]
  const ey: V3 = [uy * ex[2] - uz * ex[1], uz * ex[0] - ux * ex[2], ux * ex[1] - uy * ex[0]]
  let zmin = Infinity, zmax = -Infinity, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  const V = F.verts
  for (let i = 0; i < V.length; i += 3) {
    const z = ux * V[i] + uy * V[i + 1] + uz * V[i + 2]
    const x = ex[0] * V[i] + ex[1] * V[i + 1] + ex[2] * V[i + 2]
    const y = ey[0] * V[i] + ey[1] * V[i + 1] + ey[2] * V[i + 2]
    if (z < zmin) zmin = z
    if (z > zmax) zmax = z
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  const sinT = Math.sin((threshold * Math.PI) / 180)
  let support = 0, overhang = 0, bed = 0
  for (let f = 0; f < F.count; f++) {
    const nz = ux * F.n[f * 3] + uy * F.n[f * 3 + 1] + uz * F.n[f * 3 + 2]
    if (nz >= -sinT) continue
    const zc = ux * F.c[f * 3] + uy * F.c[f * 3 + 1] + uz * F.c[f * 3 + 2] - zmin
    if (zc <= bedTol) {
      if (nz < -0.996) bed += F.a[f]
      continue
    }
    overhang += F.a[f]
    support += F.a[f] * -nz * zc
  }
  return { up, support, overhang, height: zmax - zmin, bed, footprint: [x1 - x0, y1 - y0] }
}

/** Up-directions that put the largest flat faces onto the bed. */
export function flatFaceDirs(F: Faces, k = 12): V3[] {
  const bins = new Map<string, { n: V3; a: number }>()
  for (let f = 0; f < F.count; f++) {
    const n: V3 = [F.n[f * 3], F.n[f * 3 + 1], F.n[f * 3 + 2]]
    const key = n.map((v) => Math.round(v * 20)).join(',')
    const b = bins.get(key)
    if (b) b.a += F.a[f]
    else bins.set(key, { n, a: F.a[f] })
  }
  return [...bins.values()].sort((a, b) => b.a - a.a).slice(0, k).map((b) => [-b.n[0], -b.n[1], -b.n[2]] as V3)
}

export interface Weights { support: number; height: number; overhang: number; bed: number }

/** Scores all candidates (lower is better), marks the support/height Pareto front, sorted best first. */
export function rank(cands: Omit<Candidate, 'score' | 'pareto'>[], w: Weights): Candidate[] {
  const mx = (k: 'support' | 'height' | 'overhang' | 'bed') => Math.max(1e-9, ...cands.map((c) => c[k]))
  const ms = mx('support'), mh = mx('height'), mo = mx('overhang'), mb = mx('bed')
  const out = cands.map((c) => ({
    ...c,
    score: (w.support * c.support) / ms + (w.height * c.height) / mh + (w.overhang * c.overhang) / mo + w.bed * (1 - c.bed / mb),
    pareto: !cands.some((o) => o !== c && o.support <= c.support && o.height <= c.height && (o.support < c.support || o.height < c.height)),
  }))
  return out.sort((a, b) => a.score - b.score)
}

/** Removes near-duplicate directions (within `deg`) keeping the first (best) occurrence. */
export function distinct(c: Candidate[], deg = 12): Candidate[] {
  const cos = Math.cos((deg * Math.PI) / 180)
  const out: Candidate[] = []
  for (const x of c) if (!out.some((o) => o.up[0] * x.up[0] + o.up[1] * x.up[1] + o.up[2] * x.up[2] > cos)) out.push(x)
  return out
}

export function search(pos: Float32Array, threshold: number, samples: number, w: Weights): Candidate[] {
  const F = faceData(pos)
  const dirs: V3[] = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], ...flatFaceDirs(F), ...fibonacciDirs(samples)]
  return rank(dirs.map((u) => evaluate(F, u, threshold)), w)
}

/** Extrudes an (x, z) profile along +y. `outline` is CCW; `pieces` are convex parts used for the caps. */
export function extrude(outline: [number, number][], pieces: [number, number][][], depth: number): Float32Array {
  const out: number[] = []
  const P = (p: [number, number], y: number) => [p[0], y, p[1]]
  for (const pc of pieces)
    for (let i = 1; i + 1 < pc.length; i++) {
      out.push(...P(pc[0], 0), ...P(pc[i], 0), ...P(pc[i + 1], 0))
      out.push(...P(pc[0], depth), ...P(pc[i + 1], depth), ...P(pc[i], depth))
    }
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length]
    out.push(...P(a, 0), ...P(b, depth), ...P(b, 0))
    out.push(...P(a, 0), ...P(a, depth), ...P(b, depth))
  }
  return new Float32Array(out)
}

/** L-shaped bracket with a fillet gusset and a cantilevered top lip: orientation matters a lot. */
export function sampleBracket(): Float32Array {
  return extrude(
    [[0, 0], [60, 0], [60, 6], [26, 6], [6, 26], [6, 44], [30, 44], [30, 50], [0, 50]],
    [[[0, 0], [60, 0], [60, 6], [0, 6]], [[0, 6], [26, 6], [6, 26], [0, 26]], [[0, 26], [6, 26], [6, 44], [0, 44]], [[0, 44], [30, 44], [30, 50], [0, 50]]],
    30,
  )
}
