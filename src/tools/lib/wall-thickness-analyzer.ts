// Wall thickness analysis for triangle meshes: per-face inward raycast against a BVH.
// Positions are a flat, non-indexed triangle soup (9 floats per triangle).

type BVHNode = { min: number[]; max: number[]; left?: BVHNode; right?: BVHNode; tris?: number[] }

export interface ThicknessResult {
  thickness: Float32Array // per triangle; Infinity when the inward ray escapes (open mesh)
  area: Float32Array // per triangle area
  min: number
  bbox: { min: number[]; max: number[] }
}

function triBounds(p: ArrayLike<number>, t: number) {
  const o = t * 9
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let v = 0; v < 3; v++)
    for (let a = 0; a < 3; a++) {
      const x = p[o + v * 3 + a]
      if (x < min[a]) min[a] = x
      if (x > max[a]) max[a] = x
    }
  return { min, max }
}

export function buildBVH(p: ArrayLike<number>): BVHNode {
  const n = p.length / 9
  const cent = new Float32Array(n * 3)
  for (let t = 0; t < n; t++)
    for (let a = 0; a < 3; a++) cent[t * 3 + a] = (p[t * 9 + a] + p[t * 9 + 3 + a] + p[t * 9 + 6 + a]) / 3
  const boundsCache = Array.from({ length: n }, (_, t) => triBounds(p, t))
  const build = (tris: number[]): BVHNode => {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    for (const t of tris) {
      const b = boundsCache[t]
      for (let a = 0; a < 3; a++) {
        if (b.min[a] < min[a]) min[a] = b.min[a]
        if (b.max[a] > max[a]) max[a] = b.max[a]
      }
    }
    if (tris.length <= 8) return { min, max, tris }
    let axis = 0
    const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
    if (ext[1] > ext[axis]) axis = 1
    if (ext[2] > ext[axis]) axis = 2
    tris.sort((a, b) => cent[a * 3 + axis] - cent[b * 3 + axis])
    const mid = tris.length >> 1
    return { min, max, left: build(tris.slice(0, mid)), right: build(tris.slice(mid)) }
  }
  return build(Array.from({ length: n }, (_, i) => i))
}

function rayBox(o: number[], inv: number[], min: number[], max: number[], tMax: number) {
  let t0 = 0
  let t1 = tMax
  for (let a = 0; a < 3; a++) {
    let ta = (min[a] - o[a]) * inv[a]
    let tb = (max[a] - o[a]) * inv[a]
    if (ta > tb) [ta, tb] = [tb, ta]
    if (ta > t0) t0 = ta
    if (tb < t1) t1 = tb
    if (t0 > t1) return false
  }
  return true
}

/** Möller–Trumbore; returns distance or -1. */
export function rayTri(p: ArrayLike<number>, t: number, o: number[], d: number[]): number {
  const i = t * 9
  const e1 = [p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]]
  const e2 = [p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]]
  const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]]
  const a = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2]
  if (Math.abs(a) < 1e-12) return -1
  const f = 1 / a
  const s = [o[0] - p[i], o[1] - p[i + 1], o[2] - p[i + 2]]
  const u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2])
  if (u < -1e-9 || u > 1 + 1e-9) return -1
  const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]]
  const v = f * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2])
  if (v < -1e-9 || u + v > 1 + 1e-9) return -1
  return f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2])
}

export function faceNormal(p: ArrayLike<number>, t: number) {
  const i = t * 9
  const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2]
  const bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2]
  const n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]
  const len = Math.hypot(n[0], n[1], n[2])
  return { n: len ? n.map((x) => x / len) : [0, 0, 1], area: len / 2 }
}

export function raycast(p: ArrayLike<number>, root: BVHNode, o: number[], d: number[], skip: number) {
  const inv = d.map((x) => (x === 0 ? 1e30 : 1 / x))
  let best = Infinity
  const stack: BVHNode[] = [root]
  while (stack.length) {
    const node = stack.pop()!
    if (!rayBox(o, inv, node.min, node.max, best)) continue
    if (node.tris) {
      for (const t of node.tris) {
        if (t === skip) continue
        const dist = rayTri(p, t, o, d)
        if (dist > 1e-6 && dist < best) best = dist
      }
    } else {
      stack.push(node.left!, node.right!)
    }
  }
  return best
}

/** Thickness per triangle: ray from the centroid along the inverted face normal to the opposite surface. */
export function analyzeThickness(p: ArrayLike<number>): ThicknessResult {
  const n = p.length / 9
  const root = buildBVH(p)
  const thickness = new Float32Array(n)
  const area = new Float32Array(n)
  let min = Infinity
  for (let t = 0; t < n; t++) {
    const { n: nn, area: a } = faceNormal(p, t)
    area[t] = a
    const i = t * 9
    const o = [0, 1, 2].map((k) => (p[i + k] + p[i + 3 + k] + p[i + 6 + k]) / 3 - nn[k] * 1e-5)
    const d = [-nn[0], -nn[1], -nn[2]]
    const th = a > 0 ? raycast(p, root, o, d, t) : Infinity
    thickness[t] = th
    if (th < min) min = th
  }
  return { thickness, area, min, bbox: { min: root.min, max: root.max } }
}

/** Fraction of surface area (0..1) whose thickness is below the threshold. */
export function thinAreaFraction(r: ThicknessResult, threshold: number) {
  let thin = 0
  let total = 0
  for (let t = 0; t < r.area.length; t++) {
    total += r.area[t]
    if (r.thickness[t] < threshold) thin += r.area[t]
  }
  return total ? thin / total : 0
}

/** Heatmap colour for thickness relative to threshold: red (thin) → yellow → green → blue (thick). */
export function heatColor(th: number, threshold: number): [number, number, number] {
  if (!Number.isFinite(th)) return [0.55, 0.55, 0.6]
  if (th < threshold) return [0.9, 0.15, 0.15]
  const x = Math.min(1, (th - threshold) / (threshold * 3))
  const stops: [number, number, number][] = [[1, 0.75, 0.1], [0.3, 0.8, 0.35], [0.2, 0.45, 0.95]]
  const s = x * 2
  const k = Math.min(1, Math.floor(s))
  const f = s - k
  const a = stops[k]
  const b = stops[Math.min(2, k + 1)]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

// ---------- sample model: open tray with uneven walls, a thin pin and a solid dome ----------
type V = [number, number, number]

function quad(out: number[], a: V, b: V, c: V, d: V, div: number) {
  // a,b,c,d counter-clockwise viewed from outside; subdivided into div×div cells
  const lerp = (p: V, q: V, t: number): V => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]
  const pt = (u: number, v: number) => lerp(lerp(a, b, u), lerp(d, c, u), v)
  for (let i = 0; i < div; i++)
    for (let j = 0; j < div; j++) {
      const p00 = pt(i / div, j / div), p10 = pt((i + 1) / div, j / div)
      const p11 = pt((i + 1) / div, (j + 1) / div), p01 = pt(i / div, (j + 1) / div)
      out.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01)
    }
}

export function sampleModel(): Float32Array {
  const out: number[] = []
  // tray: outer 40 x 30 x 15 (x, y, z up); walls: left 0.6, right 3, front/back 1.2, floor 2
  const X0 = 0, X1 = 40, Y0 = 0, Y1 = 30, H = 15
  const x0 = 0.6, x1 = 37, y0 = 1.2, y1 = 28.8, f = 2
  const D = 6
  // outer bottom (normal -z)
  quad(out, [X0, Y0, 0], [X0, Y1, 0], [X1, Y1, 0], [X1, Y0, 0], D)
  // outer sides
  quad(out, [X0, Y0, 0], [X1, Y0, 0], [X1, Y0, H], [X0, Y0, H], D) // front -y
  quad(out, [X1, Y1, 0], [X0, Y1, 0], [X0, Y1, H], [X1, Y1, H], D) // back +y
  quad(out, [X0, Y1, 0], [X0, Y0, 0], [X0, Y0, H], [X0, Y1, H], D) // left -x
  quad(out, [X1, Y0, 0], [X1, Y1, 0], [X1, Y1, H], [X1, Y0, H], D) // right +x
  // inner floor (normal +z)
  quad(out, [x0, y0, f], [x1, y0, f], [x1, y1, f], [x0, y1, f], D)
  // inner walls (normals point into the cavity)
  quad(out, [x1, y0, f], [x0, y0, f], [x0, y0, H], [x1, y0, H], D) // +y
  quad(out, [x0, y1, f], [x1, y1, f], [x1, y1, H], [x0, y1, H], D) // -y
  quad(out, [x0, y0, f], [x0, y1, f], [x0, y1, H], [x0, y0, H], D) // +x
  quad(out, [x1, y1, f], [x1, y0, f], [x1, y0, H], [x1, y1, H], D) // -x
  // rim (normal +z): four quads between outer and inner rectangles
  quad(out, [X0, Y0, H], [X1, Y0, H], [x1, y0, H], [x0, y0, H], 2)
  quad(out, [X1, Y0, H], [X1, Y1, H], [x1, y1, H], [x1, y0, H], 2)
  quad(out, [X1, Y1, H], [X0, Y1, H], [x0, y1, H], [x1, y1, H], 2)
  quad(out, [X0, Y1, H], [X0, Y0, H], [x0, y0, H], [x0, y1, H], 2)
  // thin pin: cylinder r=0.35, h=12 at (48, 8)
  cylinder(out, 48, 8, 0.35, 12, 16)
  // sturdy post: r=2.5, h=10 at (50, 22)
  cylinder(out, 50, 22, 2.5, 10, 24)
  return new Float32Array(out)
}

function cylinder(out: number[], cx: number, cy: number, r: number, h: number, seg: number) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2
    const p0: V = [cx + r * Math.cos(a0), cy + r * Math.sin(a0), 0]
    const p1: V = [cx + r * Math.cos(a1), cy + r * Math.sin(a1), 0]
    quad(out, p0, p1, [p1[0], p1[1], h], [p0[0], p0[1], h], 1)
    out.push(cx, cy, h, p0[0], p0[1], h, p1[0], p1[1], h) // top
    out.push(cx, cy, 0, p1[0], p1[1], 0, p0[0], p0[1], 0) // bottom
  }
}
