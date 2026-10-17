// Geometry for the room planner: polygon rooms (metres, x → right, z → down/front), furniture rectangles.
import { distToSegment, perimeter, polygonArea, type Pt } from './3d-floor-plan-designer'

export { perimeter, polygonArea, type Pt }

export interface Piece { id: string; name: string; w: number; d: number; h: number; x: number; z: number; rot: number; color: string }

export const PRESETS: Record<string, { label: string; pts: Pt[] }> = {
  rect: { label: 'Rectangle', pts: [[0, 0], [5, 0], [5, 4], [0, 4]] },
  l: { label: 'L-shape', pts: [[0, 0], [6, 0], [6, 2.8], [3.2, 2.8], [3.2, 5], [0, 5]] },
  t: { label: 'Alcove', pts: [[0, 0], [5.5, 0], [5.5, 4], [4, 4], [4, 5.2], [1.5, 5.2], [1.5, 4], [0, 4]] },
  bay: { label: 'Bay window', pts: [[0, 0], [1.4, 0], [1.9, -0.6], [3.6, -0.6], [4.1, 0], [5.5, 0], [5.5, 4.2], [0, 4.2]] },
}

/** Signed shoelace area: > 0 when the vertices run clockwise on screen (z down). */
export function signedArea(p: Pt[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}

export function bbox(p: Pt[]) {
  const xs = p.map((q) => q[0]), zs = p.map((q) => q[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs)
  return { x0, x1, z0, z1, w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 }
}

/** Ray-casting point-in-polygon test. */
export function inside(x: number, z: number, p: Pt[]): boolean {
  let c = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c
  }
  return c
}

/** Corners of a piece's footprint after rotation (degrees, clockwise seen from above). */
export function corners(it: Piece): Pt[] {
  const a = (it.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([u, v]) => {
    const lx = (u * it.w) / 2, lz = (v * it.d) / 2
    return [it.x + lx * c - lz * s, it.z + lx * s + lz * c] as Pt
  })
}

function cross(o: Pt, a: Pt, b: Pt) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

/** Proper intersection test for two segments (touching counts). */
export function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
  if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) return true
  return false
}

/** Shortest distance between two segments with the closest point pair. */
export function segDist(a: Pt, b: Pt, c: Pt, d: Pt): { dist: number; p: Pt; q: Pt } {
  if (segIntersect(a, b, c, d)) return { dist: 0, p: a, q: a }
  const proj = (pt: Pt, s0: Pt, s1: Pt): Pt => {
    const dx = s1[0] - s0[0], dz = s1[1] - s0[1], L2 = dx * dx + dz * dz
    const t = L2 ? Math.max(0, Math.min(1, ((pt[0] - s0[0]) * dx + (pt[1] - s0[1]) * dz) / L2)) : 0
    return [s0[0] + t * dx, s0[1] + t * dz]
  }
  const cands: [Pt, Pt][] = [[a, proj(a, c, d)], [b, proj(b, c, d)], [proj(c, a, b), c], [proj(d, a, b), d]]
  let best = { dist: Infinity, p: a, q: c }
  for (const [p, q] of cands) {
    const dd = Math.hypot(p[0] - q[0], p[1] - q[1])
    if (dd < best.dist) best = { dist: dd, p, q }
  }
  return best
}

/** True when the whole footprint lies inside the room polygon. */
export function fits(it: Piece, poly: Pt[]): boolean {
  const cs = corners(it)
  if (!cs.every(([x, z]) => inside(x, z, poly) || onEdge(x, z, poly))) return false
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < poly.length; j++) if (segIntersect(cs[i], cs[(i + 1) % 4], poly[j], poly[(j + 1) % poly.length])) return false
  return true
}

function onEdge(x: number, z: number, p: Pt[]) {
  return p.some((q, i) => distToSegment(x, z, q[0], q[1], p[(i + 1) % p.length][0], p[(i + 1) % p.length][1]) < 1e-6)
}

/** Clearance from a piece to the nearest wall (0 if it touches or crosses one). */
export function wallClearance(it: Piece, poly: Pt[]): { dist: number; wall: number; p: Pt; q: Pt } {
  const cs = corners(it)
  let best = { dist: Infinity, wall: -1, p: cs[0], q: poly[0] }
  for (let j = 0; j < poly.length; j++)
    for (let i = 0; i < 4; i++) {
      const r = segDist(cs[i], cs[(i + 1) % 4], poly[j], poly[(j + 1) % poly.length])
      if (r.dist < best.dist) best = { ...r, wall: j }
    }
  return best
}

/** Gap between two pieces' footprints (0 when they overlap). */
export function pieceGap(a: Piece, b: Piece): number {
  const ca = corners(a), cb = corners(b)
  if (ca.some(([x, z]) => inside(x, z, cb)) || cb.some(([x, z]) => inside(x, z, ca))) return 0
  let m = Infinity
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) m = Math.min(m, segDist(ca[i], ca[(i + 1) % 4], cb[j], cb[(j + 1) % 4]).dist)
  return m
}

/** Pairs of solid pieces (rugs and other flat items excluded) whose footprints overlap. */
export function overlaps(items: Piece[]): [Piece, Piece][] {
  const solid = items.filter((i) => i.h >= 0.05)
  const out: [Piece, Piece][] = []
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) if (pieceGap(solid[i], solid[j]) === 0 && overlapArea(solid[i], solid[j]) > 1e-4) out.push([solid[i], solid[j]])
  return out
}

/** Approximate overlap area by sampling (good enough to ignore pieces that only touch). */
function overlapArea(a: Piece, b: Piece): number {
  const cb = corners(b)
  let n = 0
  const N = 12
  const ar = (a.rot * Math.PI) / 180
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const lx = ((i + 0.5) / N - 0.5) * a.w, lz = ((j + 0.5) / N - 0.5) * a.d
      const x = a.x + lx * Math.cos(ar) - lz * Math.sin(ar), z = a.z + lx * Math.sin(ar) + lz * Math.cos(ar)
      if (inside(x, z, cb)) n++
    }
  return (n / (N * N)) * a.w * a.d
}

/** Wall list with lengths (m) and outward normals (unit vectors). */
export function walls(poly: Pt[]) {
  const cw = signedArea(poly) > 0
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const tx = (b[0] - a[0]) / (len || 1), tz = (b[1] - a[1]) / (len || 1)
    // with z down, a clockwise polygon's outside is to the left of each edge: (tz, -tx)
    const n: Pt = cw ? [tz, -tx] : [-tz, tx]
    return { a, b, len, n, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt }
  })
}

/** Simple-polygon check (no two non-adjacent edges cross). */
export function isSimple(poly: Pt[]): boolean {
  const n = poly.length
  if (n < 3) return false
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      if (segIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false
    }
  return true
}
