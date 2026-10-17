// Hollowing for resin printing: mitered offset along averaged vertex normals, inverted inner shell,
// and boolean-free drain holes (cut a disk out of both shells, snap the rims to a circle, bridge them with a tube wall).
import { boundaryLoops, weld, type Indexed } from './stl-repair-checker'

export type V3 = [number, number, number]

export interface Work {
  verts: number[]
  faces: number[]
  /** per face: 0 outer shell, 1 inner shell, 2 drain-hole wall */
  kind: number[]
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
const unit = (a: V3): V3 => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const vx = (v: ArrayLike<number>, i: number): V3 => [v[3 * i], v[3 * i + 1], v[3 * i + 2]]

/** Signed volume and area of an indexed triangle mesh. */
export function volumeArea(verts: ArrayLike<number>, faces: ArrayLike<number>, filter?: (f: number) => boolean) {
  let vol = 0, area = 0
  for (let f = 0; f < faces.length / 3; f++) {
    if (filter && !filter(f)) continue
    const a = vx(verts, faces[3 * f]), b = vx(verts, faces[3 * f + 1]), c = vx(verts, faces[3 * f + 2])
    vol += dot(a, cross(b, c)) / 6
    area += len(cross(sub(b, a), sub(c, a))) / 2
  }
  return { volume: vol, area }
}

/** Makes faces wind outward (positive volume). */
export function orientOutward(m: Indexed): Indexed {
  if (volumeArea(m.verts, m.faces).volume >= 0) return m
  const f = new Uint32Array(m.faces)
  for (let i = 0; i < f.length; i += 3) [f[i + 1], f[i + 2]] = [f[i + 2], f[i + 1]]
  return { verts: m.verts, faces: f }
}

/** Midpoint subdivision (1 → 4 triangles), keeps the mesh watertight. */
export function subdivide(m: Indexed): Indexed {
  const verts = [...m.verts]
  const mid = new Map<string, number>()
  const V = (a: number, b: number) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`
    let id = mid.get(k)
    if (id === undefined) {
      id = verts.length / 3
      verts.push((verts[3 * a] + verts[3 * b]) / 2, (verts[3 * a + 1] + verts[3 * b + 1]) / 2, (verts[3 * a + 2] + verts[3 * b + 2]) / 2)
      mid.set(k, id)
    }
    return id
  }
  const out: number[] = []
  for (let i = 0; i < m.faces.length; i += 3) {
    const a = m.faces[i], b = m.faces[i + 1], c = m.faces[i + 2]
    const ab = V(a, b), bc = V(b, c), ca = V(c, a)
    out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca)
  }
  return { verts: new Float64Array(verts), faces: new Uint32Array(out) }
}

/**
 * Per-vertex offset direction × distance so that the inner surface sits `wall` away from every adjacent face
 * (mitered: displacement = wall / min(n·nf)), clamped to avoid spikes at very sharp corners.
 */
export function offsetVectors(m: Indexed, wall: number): Float64Array {
  const n = m.verts.length / 3
  const acc = new Float64Array(n * 3)
  const fn: V3[] = []
  for (let f = 0; f < m.faces.length / 3; f++) {
    const [ia, ib, ic] = [m.faces[3 * f], m.faces[3 * f + 1], m.faces[3 * f + 2]]
    const A = vx(m.verts, ia), B = vx(m.verts, ib), C = vx(m.verts, ic)
    const c = unit(cross(sub(B, A), sub(C, A)))
    fn.push(c)
    // angle-weighted pseudo-normals: independent of how the faces are triangulated
    const corner = (P: V3, Q: V3, R: V3) => Math.acos(Math.max(-1, Math.min(1, dot(unit(sub(Q, P)), unit(sub(R, P))))))
    const w3 = [corner(A, B, C), corner(B, C, A), corner(C, A, B)]
    ;[ia, ib, ic].forEach((i, k) => {
      for (let d = 0; d < 3; d++) acc[3 * i + d] += c[d] * w3[k]
    })
  }
  const minDot = new Float64Array(n).fill(1)
  for (let i = 0; i < n; i++) {
    const u = unit(vx(acc, i))
    acc[3 * i] = u[0]
    acc[3 * i + 1] = u[1]
    acc[3 * i + 2] = u[2]
  }
  for (let f = 0; f < fn.length; f++)
    for (let k = 0; k < 3; k++) {
      const i = m.faces[3 * f + k]
      minDot[i] = Math.min(minDot[i], dot(vx(acc, i), fn[f]))
    }
  const out = new Float64Array(n * 3)
  for (let i = 0; i < n; i++) {
    const d = wall / Math.max(0.35, minDot[i])
    for (let k = 0; k < 3; k++) out[3 * i + k] = -acc[3 * i + k] * d
  }
  return out
}

export interface HollowResult {
  work: Work
  outerVerts: number
  /** inner triangles whose normal flipped against the outer one → the wall is too thick for that feature */
  folded: number
}

/** Outer shell + offset inner shell with reversed winding (normals point into the cavity). */
export function hollow(src: Indexed, wall: number): HollowResult {
  const m = orientOutward(src)
  const off = offsetVectors(m, wall)
  const V = m.verts.length / 3
  const verts = [...m.verts]
  for (let i = 0; i < V * 3; i++) verts.push(m.verts[i] + off[i])
  const faces: number[] = [...m.faces]
  const kind: number[] = new Array(m.faces.length / 3).fill(0)
  const F = m.faces.length / 3
  for (let f = 0; f < F; f++) {
    const [a, b, c] = [m.faces[3 * f], m.faces[3 * f + 1], m.faces[3 * f + 2]]
    faces.push(a + V, c + V, b + V)
    kind.push(1)
  }
  const isFolded = (f: number) => {
    const [a, b, c] = [m.faces[3 * f], m.faces[3 * f + 1], m.faces[3 * f + 2]]
    const no = cross(sub(vx(verts, b), vx(verts, a)), sub(vx(verts, c), vx(verts, a)))
    const ni = cross(sub(vx(verts, b + V), vx(verts, a + V)), sub(vx(verts, c + V), vx(verts, a + V)))
    return dot(no, ni) <= 0
  }
  // Untangle: Laplacian-smooth inner vertices around folded triangles (concave creases, thin necks).
  const nb: Set<number>[] = Array.from({ length: V }, () => new Set<number>())
  for (let f = 0; f < F; f++)
    for (let k = 0; k < 3; k++) {
      const a = m.faces[3 * f + k], b = m.faces[3 * f + ((k + 1) % 3)]
      nb[a].add(b)
      nb[b].add(a)
    }
  let folded = 0
  for (let it = 0; it < 12; it++) {
    const bad = new Set<number>()
    folded = 0
    for (let f = 0; f < F; f++)
      if (isFolded(f)) {
        folded++
        for (let k = 0; k < 3; k++) {
          const v = m.faces[3 * f + k]
          bad.add(v)
          for (const u of nb[v]) bad.add(u)
        }
      }
    if (!folded || it === 11) break
    const next = new Map<number, V3>()
    for (const v of bad) {
      const acc: V3 = [0, 0, 0]
      for (const u of nb[v]) for (let d = 0; d < 3; d++) acc[d] += verts[3 * (u + V) + d]
      next.set(v, [acc[0] / nb[v].size, acc[1] / nb[v].size, acc[2] / nb[v].size])
    }
    for (const [v, q] of next) for (let d = 0; d < 3; d++) verts[3 * (v + V) + d] = q[d]
  }
  return { work: { verts, faces, kind }, outerVerts: V, folded }
}

export interface Hole { p: V3; n: V3; r: number }

function centroid(w: Work, f: number): V3 {
  const a = vx(w.verts, w.faces[3 * f]), b = vx(w.verts, w.faces[3 * f + 1]), c = vx(w.verts, w.faces[3 * f + 2])
  return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
}

/** Grows a connected patch of `kind` faces around the face nearest `seed` while `ok(centroid)` holds. */
function patch(w: Work, kindWanted: number, seed: V3, ok: (c: V3) => boolean, vf: Map<number, number[]>): Set<number> {
  let best = -1, bd = Infinity
  for (let f = 0; f < w.kind.length; f++) {
    if (w.kind[f] !== kindWanted) continue
    const d = len(sub(centroid(w, f), seed))
    if (d < bd) [bd, best] = [d, f]
  }
  const out = new Set<number>()
  if (best < 0 || !ok(centroid(w, best))) return out
  const stack = [best]
  out.add(best)
  while (stack.length) {
    const f = stack.pop()!
    for (let k = 0; k < 3; k++)
      for (const g of vf.get(w.faces[3 * f + k]) ?? []) {
        if (out.has(g) || w.kind[g] !== kindWanted || !ok(centroid(w, g))) continue
        out.add(g)
        stack.push(g)
      }
  }
  // Close "ears": leftover faces whose three corners all lie on the cut rim would collapse when the rim is snapped.
  for (let changed = true; changed; ) {
    changed = false
    const rim = new Set<number>()
    for (const f of out)
      for (let k = 0; k < 3; k++) {
        const v = w.faces[3 * f + k]
        if ((vf.get(v) ?? []).some((g) => !out.has(g))) rim.add(v)
      }
    for (const v of rim)
      for (const g of vf.get(v) ?? []) {
        if (out.has(g) || w.kind[g] !== kindWanted) continue
        if (rim.has(w.faces[3 * g]) && rim.has(w.faces[3 * g + 1]) && rim.has(w.faces[3 * g + 2])) {
          out.add(g)
          changed = true
        }
      }
  }
  return out
}

/**
 * Drills a drain hole of radius `h.r` at surface point `h.p` with outward normal `h.n`.
 * Returns an error message instead of changing the mesh when the cut would not be a clean disk.
 */
export function drill(w: Work, h: Hole, wall: number): string | null {
  const dir = unit([-h.n[0], -h.n[1], -h.n[2]]) // into the part
  const p = h.p
  const vf = new Map<number, number[]>()
  for (let f = 0; f < w.faces.length / 3; f++)
    for (let k = 0; k < 3; k++) {
      const v = w.faces[3 * f + k]
      const l = vf.get(v)
      if (l) l.push(f)
      else vf.set(v, [f])
    }
  const tr = (c: V3) => {
    const d = sub(c, p)
    const t = dot(d, dir)
    return { t, r: len([d[0] - t * dir[0], d[1] - t * dir[1], d[2] - t * dir[2]]) }
  }
  const outer = patch(w, 0, p, (c) => { const q = tr(c); return q.r < h.r && Math.abs(q.t) < h.r + wall }, vf)
  const seedIn: V3 = [p[0] + dir[0] * wall, p[1] + dir[1] * wall, p[2] + dir[2] * wall]
  const inner = patch(w, 1, seedIn, (c) => { const q = tr(c); return q.r < h.r && q.t > -h.r && q.t < 3 * wall + h.r }, vf)
  if (!outer.size || !inner.size) return 'Hole is smaller than the mesh triangles here: raise the resolution or the hole size.'
  const loopOf = (set: Set<number>) => {
    const edges: [number, number][] = []
    const ek = new Map<string, number>()
    for (const f of set)
      for (let k = 0; k < 3; k++) {
        const a = w.faces[3 * f + k], b = w.faces[3 * f + ((k + 1) % 3)]
        const key = a < b ? `${a},${b}` : `${b},${a}`
        ek.set(key, (ek.get(key) ?? 0) + 1)
        edges.push([a, b])
      }
    const border = edges.filter(([a, b]) => ek.get(a < b ? `${a},${b}` : `${b},${a}`) === 1)
    // A border vertex must not touch faces of another kind (e.g. an earlier hole's wall).
    for (const [a] of border) if ((vf.get(a) ?? []).some((g) => !set.has(g) && w.kind[g] === 2)) return null
    const loops = boundaryLoops(border)
    return loops.length === 1 ? loops[0] : null
  }
  const A = loopOf(outer), B = loopOf(inner)
  if (!A || !B || A.length < 3 || B.length < 3) return 'Could not cut a clean disk here (too close to an edge, another hole or a thin feature).'
  // Rim vertices should not be used outside the patch by faces of the other shell.
  // Basis around the axis.
  const ref: V3 = Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u = unit(cross(dir, ref)), v = cross(dir, u)
  const ang = (i: number) => {
    const d = sub(vx(w.verts, i), p)
    return Math.atan2(dot(d, v), dot(d, u))
  }
  const snap = (i: number) => {
    const c = vx(w.verts, i)
    const q = tr(c)
    const d = sub(c, p)
    const rad: V3 = [d[0] - q.t * dir[0], d[1] - q.t * dir[1], d[2] - q.t * dir[2]]
    const l = len(rad) || 1
    for (let k = 0; k < 3; k++) w.verts[3 * i + k] = p[k] + q.t * dir[k] + (rad[k] / l) * h.r
  }
  const order = (loop: number[]) => {
    let total = 0
    for (let k = 0; k < loop.length; k++) {
      let d = ang(loop[(k + 1) % loop.length]) - ang(loop[k])
      if (d > Math.PI) d -= 2 * Math.PI
      if (d < -Math.PI) d += 2 * Math.PI
      total += d
    }
    if (Math.abs(total) < Math.PI) return null // loop does not go around the axis
    const l = total < 0 ? [...loop].reverse() : [...loop]
    const a0 = l.map((i) => (ang(i) + 2 * Math.PI) % (2 * Math.PI))
    let s = 0
    for (let k = 1; k < l.length; k++) if (a0[k] < a0[s]) s = k
    const r = [...l.slice(s), ...l.slice(0, s)]
    const angles = [a0[s]]
    for (let k = 1; k < r.length; k++) {
      let d = ang(r[k]) - ang(r[k - 1])
      if (d < -Math.PI) d += 2 * Math.PI
      if (d > Math.PI) d -= 2 * Math.PI
      angles.push(angles[k - 1] + d)
    }
    angles.push(angles[0] + 2 * Math.PI)
    return { ids: r, angles }
  }
  const OA = order(A), OB = order(B)
  if (!OA || !OB) return 'The cut did not go around the hole axis; try a flatter spot.'
  // Remove patches, snap rims, bridge.
  const drop = new Set([...outer, ...inner])
  const faces: number[] = [], kind: number[] = []
  for (let f = 0; f < w.kind.length; f++) if (!drop.has(f)) {
    faces.push(w.faces[3 * f], w.faces[3 * f + 1], w.faces[3 * f + 2])
    kind.push(w.kind[f])
  }
  for (const i of [...OA.ids, ...OB.ids]) snap(i)
  const n = OA.ids.length, m = OB.ids.length
  let i = 0, j = 0
  const tri = (a: number, b: number, c: number) => {
    const pa = vx(w.verts, a), pb = vx(w.verts, b), pc = vx(w.verts, c)
    const nn = cross(sub(pb, pa), sub(pc, pa))
    const cc: V3 = [(pa[0] + pb[0] + pc[0]) / 3 - p[0], (pa[1] + pb[1] + pc[1]) / 3 - p[1], (pa[2] + pb[2] + pc[2]) / 3 - p[2]]
    const t = dot(cc, dir)
    const radial: V3 = [cc[0] - t * dir[0], cc[1] - t * dir[1], cc[2] - t * dir[2]]
    // The tube wall faces the hole, i.e. its normal points towards the axis.
    if (dot(nn, radial) > 0) faces.push(a, c, b)
    else faces.push(a, b, c)
    kind.push(2)
  }
  while (i < n || j < m) {
    const a = OA.ids[i % n], b = OB.ids[j % m]
    if (j >= m || (i < n && OA.angles[i + 1] <= OB.angles[j + 1])) {
      tri(a, OA.ids[(i + 1) % n], b)
      i++
    } else {
      tri(a, OB.ids[(j + 1) % m], b)
      j++
    }
  }
  w.faces = faces
  w.kind = kind
  return null
}

/** Removes unreferenced vertices and returns an indexed mesh. */
export function compact(w: Work): Indexed {
  const map = new Map<number, number>()
  const verts: number[] = []
  const faces = new Uint32Array(w.faces.length)
  w.faces.forEach((v, k) => {
    let id = map.get(v)
    if (id === undefined) {
      id = verts.length / 3
      map.set(v, id)
      verts.push(w.verts[3 * v], w.verts[3 * v + 1], w.verts[3 * v + 2])
    }
    faces[k] = id
  })
  return { verts: new Float64Array(verts), faces }
}

// ---------- demo models ----------

/** Closed solid of revolution around Z from a profile [(r, z)] that starts and ends on the axis. */
export function revolve(profile: [number, number][], seg = 96): Indexed {
  const verts: number[] = []
  const faces: number[] = []
  const ringStart: number[] = []
  profile.forEach(([r, z], k) => {
    ringStart.push(verts.length / 3)
    if (k === 0 || k === profile.length - 1) verts.push(0, 0, z)
    else for (let s = 0; s < seg; s++) verts.push(r * Math.cos((2 * Math.PI * s) / seg), r * Math.sin((2 * Math.PI * s) / seg), z)
  })
  const L = profile.length
  for (let k = 0; k < L - 1; k++) {
    const a0 = ringStart[k], b0 = ringStart[k + 1]
    for (let s = 0; s < seg; s++) {
      const s1 = (s + 1) % seg
      if (k === 0) faces.push(a0, b0 + s1, b0 + s)
      else if (k === L - 2) faces.push(a0 + s, a0 + s1, b0)
      else faces.push(a0 + s, a0 + s1, b0 + s1, a0 + s, b0 + s1, b0 + s)
    }
  }
  return orientOutward({ verts: new Float64Array(verts), faces: new Uint32Array(faces) })
}

/** Resamples a polyline at roughly even spacing with Catmull-Rom smoothing. */
function smoothProfile(ctrl: [number, number][], step: number): [number, number][] {
  const dense: [number, number][] = []
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)]
    for (let t = 0; t < 1; t += 0.05) {
      const t2 = t * t, t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      dense.push([Math.max(0, f(p0[0], p1[0], p2[0], p3[0])), Math.max(ctrl[0][1], f(p0[1], p1[1], p2[1], p3[1]))])
    }
  }
  dense.push(ctrl[ctrl.length - 1])
  const out: [number, number][] = [dense[0]]
  let acc = 0
  for (let i = 1; i < dense.length - 1; i++) {
    acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1])
    if (acc >= step) {
      out.push(dense[i])
      acc = 0
    }
  }
  out.push(dense[dense.length - 1])
  return out
}

/** Chess-pawn figurine (≈ 30 mm base, 50 mm tall), finely meshed so drain holes cut cleanly. */
export function samplePawn(): Indexed {
  const head: [number, number][] = []
  for (let a = -60; a <= 90; a += 15) head.push([9 * Math.cos((a * Math.PI) / 180), 41 + 9 * Math.sin((a * Math.PI) / 180)])
  head[head.length - 1] = [0, 50]
  const ctrl: [number, number][] = [[0, 0], [5, 0], [10, 0], [15, 0], [15.2, 2.5], [14, 4.5], [11.5, 6], [10, 8], [8, 14], [6.5, 22], [6, 27.5], [10.5, 29.5], [10.5, 32], [6, 33.5], ...head]
  return revolve(smoothProfile(ctrl, 1.1), 72)
}

/** Icosphere, mainly for tests and as a simple demo. */
export function icosphere(r: number, level: number): Indexed {
  const t = (1 + Math.sqrt(5)) / 2
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
  const f = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1]
  let m: Indexed = { verts: new Float64Array(v.flat()), faces: new Uint32Array(f) }
  for (let i = 0; i < level; i++) m = subdivide(m)
  const out = new Float64Array(m.verts.length)
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(m.verts[i], m.verts[i + 1], m.verts[i + 2])
    for (let k = 0; k < 3; k++) out[i + k] = (m.verts[i + k] / l) * r
  }
  return orientOutward({ verts: out, faces: m.faces })
}

export { weld }
