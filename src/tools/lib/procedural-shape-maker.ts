// Procedural solids (vase, spur gear, spring) as closed triangle meshes, in millimetres, Y up.
// Every generator returns a flat Float32Array of triangle vertices (9 floats per triangle) with
// outward-facing winding, so the mesh can be exported straight to a printable STL.

export type V3 = [number, number, number]

export interface VaseParams {
  height: number
  baseR: number
  bellyR: number
  bellyAt: number // 0..1 of height
  neckR: number
  neckAt: number
  lipR: number
  sides: number // 0 = round, ≥3 = polygon cross-section
  twist: number // degrees over full height
  ripples: number // count of ripples around
  rippleAmp: number // 0..0.3 fraction of radius
  wall: number // 0 = solid
  segments: number
  rows: number
}

export interface GearParams {
  teeth: number
  module: number
  pressureAngle: number // degrees
  thickness: number
  bore: number // diameter, 0 = none
}

export interface SpringParams {
  coilR: number
  wireR: number
  pitch: number
  turns: number
  segments: number
}

class Mesh {
  out: number[] = []
  tri(a: V3, b: V3, c: V3) {
    this.out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
  }
  quad(a: V3, b: V3, c: V3, d: V3) {
    // a-b-c-d counter-clockwise when viewed from outside
    this.tri(a, b, c)
    this.tri(a, c, d)
  }
  done(): Float32Array {
    const f = new Float32Array(this.out)
    if (signedVolume(f) < 0) flip(f)
    return f
  }
}

function flip(f: Float32Array) {
  for (let i = 0; i < f.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const t = f[i + 3 + k]
      f[i + 3 + k] = f[i + 6 + k]
      f[i + 6 + k] = t
    }
  }
}

/** Signed volume of a closed triangle mesh (divergence theorem). */
export function signedVolume(f: Float32Array): number {
  let v = 0
  for (let i = 0; i < f.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [f[i], f[i + 1], f[i + 2], f[i + 3], f[i + 4], f[i + 5], f[i + 6], f[i + 7], f[i + 8]]
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
  }
  return v / 6
}

export function bounds(f: Float32Array): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity]
  const max: V3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < f.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (f[i + k] < min[k]) min[k] = f[i + k]
      if (f[i + k] > max[k]) max[k] = f[i + k]
    }
  }
  return { min, max }
}

/** Surface area of the mesh. */
export function surfaceArea(f: Float32Array): number {
  let a = 0
  for (let i = 0; i < f.length; i += 9) {
    const ux = f[i + 3] - f[i], uy = f[i + 4] - f[i + 1], uz = f[i + 5] - f[i + 2]
    const vx = f[i + 6] - f[i], vy = f[i + 7] - f[i + 1], vz = f[i + 8] - f[i + 2]
    a += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
  }
  return a
}

/** Catmull-Rom style smooth curve through (t, r) control points, t ascending in 0..1. */
export function smoothProfile(pts: [number, number][], t: number): number {
  const p = [...pts].sort((a, b) => a[0] - b[0])
  if (t <= p[0][0]) return p[0][1]
  if (t >= p[p.length - 1][0]) return p[p.length - 1][1]
  let i = 0
  while (i < p.length - 2 && t > p[i + 1][0]) i++
  const [t0, r0] = p[i]
  const [t1, r1] = p[i + 1]
  const h = t1 - t0 || 1e-9
  const slope = (j: number) => {
    const a = p[Math.max(0, j - 1)]
    const b = p[Math.min(p.length - 1, j + 1)]
    return (b[1] - a[1]) / (b[0] - a[0] || 1e-9)
  }
  const m0 = slope(i) * h
  const m1 = slope(i + 1) * h
  const s = (t - t0) / h
  const s2 = s * s, s3 = s2 * s
  return (2 * s3 - 3 * s2 + 1) * r0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * r1 + (s3 - s2) * m1
}

export function vaseRadius(p: VaseParams, y: number, theta: number): number {
  const t = y / p.height
  const base = smoothProfile([[0, p.baseR], [p.bellyAt, p.bellyR], [p.neckAt, p.neckR], [1, p.lipR]], t)
  const th = theta + (p.twist * Math.PI) / 180 * t
  let r = base
  if (p.sides >= 3) r *= Math.cos(Math.PI / p.sides) / Math.cos((((th % (2 * Math.PI / p.sides)) + 2 * Math.PI / p.sides) % (2 * Math.PI / p.sides)) - Math.PI / p.sides)
  if (p.ripples > 0 && p.rippleAmp > 0) r *= 1 + p.rippleAmp * Math.cos(p.ripples * th)
  return Math.max(0.5, r)
}

export function vase(p: VaseParams): Float32Array {
  const m = new Mesh()
  const S = Math.max(8, Math.round(p.segments))
  const R = Math.max(2, Math.round(p.rows))
  const H = p.height
  const ang = (i: number) => (2 * Math.PI * i) / S
  const P = (i: number, y: number, inset = 0): V3 => {
    const th = ang(i)
    const r = Math.max(0.3, vaseRadius(p, y, th) - inset)
    return [r * Math.cos(th), y, r * Math.sin(th)]
  }
  const ys = Array.from({ length: R + 1 }, (_, j) => (H * j) / R)
  // outer wall: a=P(i,j) b=P(i,j+1) c=P(i+1,j+1) d=P(i+1,j) → outward with dy × dθ
  for (let j = 0; j < R; j++) for (let i = 0; i < S; i++) m.quad(P(i, ys[j]), P(i, ys[j + 1]), P(i + 1, ys[j + 1]), P(i + 1, ys[j]))
  // bottom cap (faces −y)
  const c0: V3 = [0, 0, 0]
  for (let i = 0; i < S; i++) m.tri(c0, P(i, 0), P(i + 1, 0))
  const wall = Math.max(0, p.wall)
  if (wall <= 0) {
    const c1: V3 = [0, H, 0]
    for (let i = 0; i < S; i++) m.tri(c1, P(i + 1, H), P(i, H))
  } else {
    const floor = Math.min(H * 0.5, Math.max(wall, 1.2 * wall))
    const ky = Array.from({ length: R + 1 }, (_, k) => floor + ((H - floor) * k) / R)
    // rim
    for (let i = 0; i < S; i++) m.quad(P(i, H, wall), P(i + 1, H, wall), P(i + 1, H), P(i, H))
    // inner wall faces the axis
    for (let k = 0; k < R; k++) for (let i = 0; i < S; i++) m.quad(P(i, ky[k], wall), P(i + 1, ky[k], wall), P(i + 1, ky[k + 1], wall), P(i, ky[k + 1], wall))
    // inner floor faces +y
    const cf: V3 = [0, floor, 0]
    for (let i = 0; i < S; i++) m.tri(cf, P(i + 1, floor, wall), P(i, floor, wall))
  }
  return m.done()
}

const inv = (a: number) => Math.tan(a) - a

/** Gear geometry figures (mm). */
export function gearDims(g: GearParams) {
  const rp = (g.module * g.teeth) / 2
  const alpha = (g.pressureAngle * Math.PI) / 180
  const rb = rp * Math.cos(alpha)
  const ra = rp + g.module
  const rf = Math.max(0.5, rp - 1.25 * g.module)
  return { rp, rb, ra, rf, alpha, pitchD: 2 * rp, tipD: 2 * ra, rootD: 2 * rf, baseD: 2 * rb, circularPitch: Math.PI * g.module }
}

/** Closed 2-D gear outline as polar points [angle, radius] with ascending angle. */
export function gearOutline(g: GearParams, flankSteps = 8): [number, number][] {
  const { rb, ra, rf, alpha } = gearDims(g)
  const N = Math.max(4, Math.round(g.teeth))
  const half = Math.PI / (2 * N) + inv(alpha)
  const theta = (r: number) => half - (r > rb ? inv(Math.acos(rb / r)) : 0)
  const rStart = Math.max(rf, Math.min(rb, ra))
  const out: [number, number][] = []
  for (let i = 0; i < N; i++) {
    const c = (2 * Math.PI * i) / N
    const flank: number[] = []
    flank.push(rf)
    if (rStart > rf) flank.push(rStart)
    for (let k = 1; k <= flankSteps; k++) flank.push(rStart + ((ra - rStart) * k) / flankSteps)
    // rising flank
    for (const r of flank) out.push([c - Math.max(0, theta(r)), r])
    // tip land
    const tip = Math.max(0, theta(ra))
    out.push([c - tip / 3, ra], [c + tip / 3, ra])
    for (const r of [...flank].reverse()) out.push([c + Math.max(0, theta(r)), r])
    // root land up to next tooth
    const next = c + (2 * Math.PI) / N - theta(rf)
    const here = c + theta(rf)
    out.push([(2 * here + next) / 3, rf], [(here + 2 * next) / 3, rf])
  }
  // de-duplicate and keep strictly increasing angles
  const res: [number, number][] = []
  for (const p of out) if (!res.length || p[0] > res[res.length - 1][0] + 1e-9) res.push(p)
  return res
}

export function gear(g: GearParams): Float32Array {
  const m = new Mesh()
  const o = gearOutline(g)
  const T = g.thickness
  const br = Math.max(0, g.bore / 2)
  const n = o.length
  const O = (k: number, y: number): V3 => {
    const [a, r] = o[k % n]
    return [r * Math.cos(a), y, r * Math.sin(a)]
  }
  const B = (k: number, y: number): V3 => {
    const a = o[k % n][0]
    return [br * Math.cos(a), y, br * Math.sin(a)]
  }
  for (let k = 0; k < n; k++) {
    m.quad(O(k, 0), O(k, T), O(k + 1, T), O(k + 1, 0))
    if (br > 0) {
      m.quad(B(k, T), B(k + 1, T), O(k + 1, T), O(k, T))
      m.quad(B(k, 0), O(k, 0), O(k + 1, 0), B(k + 1, 0))
      m.quad(B(k, 0), B(k + 1, 0), B(k + 1, T), B(k, T))
    } else {
      m.tri([0, T, 0], O(k + 1, T), O(k, T))
      m.tri([0, 0, 0], O(k, 0), O(k + 1, 0))
    }
  }
  return m.done()
}

export function springLength(s: SpringParams) {
  return s.turns * Math.hypot(2 * Math.PI * s.coilR, s.pitch)
}

export function spring(s: SpringParams): Float32Array {
  const m = new Mesh()
  const steps = Math.max(12, Math.round(s.turns * 48))
  const ring = Math.max(6, Math.round(s.segments))
  const tMax = s.turns * 2 * Math.PI
  const k = s.pitch / (2 * Math.PI)
  const center = (t: number): V3 => [s.coilR * Math.cos(t), k * t + s.wireR, s.coilR * Math.sin(t)]
  const pt = (t: number, j: number): V3 => {
    const c = center(t)
    const tl = Math.hypot(s.coilR, k)
    const T: V3 = [(-s.coilR * Math.sin(t)) / tl, k / tl, (s.coilR * Math.cos(t)) / tl]
    const N: V3 = [Math.cos(t), 0, Math.sin(t)]
    const Bv: V3 = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]]
    const a = (2 * Math.PI * j) / ring
    const ca = Math.cos(a) * s.wireR, sa = Math.sin(a) * s.wireR
    return [c[0] + N[0] * ca + Bv[0] * sa, c[1] + N[1] * ca + Bv[1] * sa, c[2] + N[2] * ca + Bv[2] * sa]
  }
  for (let i = 0; i < steps; i++) {
    const t0 = (tMax * i) / steps, t1 = (tMax * (i + 1)) / steps
    for (let j = 0; j < ring; j++) m.quad(pt(t0, j), pt(t1, j), pt(t1, j + 1), pt(t0, j + 1))
  }
  const c0 = center(0), c1 = center(tMax)
  for (let j = 0; j < ring; j++) {
    m.tri(c0, pt(0, j + 1), pt(0, j))
    m.tri(c1, pt(tMax, j), pt(tMax, j + 1))
  }
  return m.done()
}

/** Binary STL with Z up (rotates the Y-up model +90° about X). */
export function toStl(f: Float32Array, name = 'shape'): ArrayBuffer {
  const n = f.length / 9
  const buf = new ArrayBuffer(84 + n * 50)
  const dv = new DataView(buf)
  const head = `Browser Toolbox ${name}`.slice(0, 79)
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f)
  dv.setUint32(80, n, true)
  let o = 84
  for (let i = 0; i < f.length; i += 9) {
    const v = [0, 1, 2].map((k): V3 => [f[i + 3 * k], -f[i + 3 * k + 2], f[i + 3 * k + 1]])
    const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2]
    const wx = v[2][0] - v[0][0], wy = v[2][1] - v[0][1], wz = v[2][2] - v[0][2]
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    const l = Math.hypot(nx, ny, nz) || 1
    for (const x of [nx / l, ny / l, nz / l]) {
      dv.setFloat32(o, x, true)
      o += 4
    }
    for (const p of v) for (const x of p) {
      dv.setFloat32(o, x, true)
      o += 4
    }
    o += 2
  }
  return buf
}
