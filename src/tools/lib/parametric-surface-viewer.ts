// Sampling of parametric surfaces r(u, v) and space curves r(t), with numerical differential geometry.
import { compile } from './graphing-calculator'

export type V3 = [number, number, number]
export type SurfFn = (u: number, v: number) => V3

/** Compile three expressions in u, v (and the free parameter a). Throws on syntax errors. */
export function compileSurface(x: string, y: string, z: string, a: number): SurfFn {
  const fx = compile(x, ['u', 'v', 'a']), fy = compile(y, ['u', 'v', 'a']), fz = compile(z, ['u', 'v', 'a'])
  return (u, v) => { const e = { u, v, a }; return [fx(e), fy(e), fz(e)] }
}
export function compileCurve(x: string, y: string, z: string, a: number): (t: number) => V3 {
  const fx = compile(x, ['t', 'a']), fy = compile(y, ['t', 'a']), fz = compile(z, ['t', 'a'])
  return (t) => { const e = { t, a }; return [fx(e), fy(e), fz(e)] }
}
/** Evaluate a range expression such as "2pi", "-pi/2" or "-a" (a = free parameter). */
export const evalConst = (s: string, a = 1) => compile(s, ['a'])({ a })

const sub = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]]
const add = (p: V3, q: V3): V3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]]
const mul = (p: V3, k: number): V3 => [p[0] * k, p[1] * k, p[2] * k]
const dot = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]
const cross = (p: V3, q: V3): V3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]

/** Gaussian (K) and mean (H) curvature at (u, v) by central differences with steps hu, hv. */
export function curvature(f: SurfFn, u: number, v: number, hu: number, hv: number) {
  const c = f(u, v)
  const up = f(u + hu, v), um = f(u - hu, v), vp = f(u, v + hv), vm = f(u, v - hv)
  const pp = f(u + hu, v + hv), pm = f(u + hu, v - hv), mp = f(u - hu, v + hv), mm = f(u - hu, v - hv)
  const Xu = mul(sub(up, um), 1 / (2 * hu)), Xv = mul(sub(vp, vm), 1 / (2 * hv))
  const Xuu = mul(add(sub(up, mul(c, 2)), um), 1 / (hu * hu))
  const Xvv = mul(add(sub(vp, mul(c, 2)), vm), 1 / (hv * hv))
  const Xuv = mul(sub(add(pp, mm), add(pm, mp)), 1 / (4 * hu * hv))
  const nRaw = cross(Xu, Xv)
  const nl = Math.hypot(...nRaw)
  if (!(nl > 1e-12)) return { K: NaN, H: NaN, n: [0, 0, 1] as V3 }
  const n = mul(nRaw, 1 / nl)
  const E = dot(Xu, Xu), F = dot(Xu, Xv), G = dot(Xv, Xv)
  const L = dot(Xuu, n), M = dot(Xuv, n), N = dot(Xvv, n)
  const den = E * G - F * F
  return { K: (L * N - M * M) / den, H: (E * N - 2 * F * M + G * L) / (2 * den), n }
}

export interface SurfaceMesh { pos: Float32Array; K: Float32Array; H: Float32Array; index: Uint32Array; bad: number; area: number; totalK: number; bounds: [V3, V3] }

export function sampleSurface(f: SurfFn, u0: number, u1: number, v0: number, v1: number, nu: number, nv: number): SurfaceMesh {
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3)
  const K = new Float32Array((nu + 1) * (nv + 1))
  const H = new Float32Array((nu + 1) * (nv + 1))
  const hu = Math.abs(u1 - u0) * 1e-4 || 1e-4, hv = Math.abs(v1 - v0) * 1e-4 || 1e-4
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity]
  let bad = 0
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = u0 + ((u1 - u0) * i) / nu, v = v0 + ((v1 - v0) * j) / nv
      let p = f(u, v)
      if (!p.every(Number.isFinite)) { bad++; p = [0, 0, 0] }
      const k = j * (nu + 1) + i
      pos.set(p, k * 3)
      for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], p[d]); hi[d] = Math.max(hi[d], p[d]) }
      // evaluate curvature slightly inside the domain so the stencil stays in range
      const cu = Math.min(Math.max(u, Math.min(u0, u1) + 2 * hu), Math.max(u0, u1) - 2 * hu)
      const cv = Math.min(Math.max(v, Math.min(v0, v1) + 2 * hv), Math.max(v0, v1) - 2 * hv)
      const c = curvature(f, cu, cv, hu, hv)
      K[k] = c.K; H[k] = c.H
    }
  const index = new Uint32Array(nu * nv * 6)
  let t = 0, area = 0, totalK = 0
  const P = (k: number): V3 => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]]
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1
      index.set([a, b, d, a, d, c], t); t += 6
      const A1 = Math.hypot(...cross(sub(P(b), P(a)), sub(P(d), P(a)))) / 2, A2 = Math.hypot(...cross(sub(P(d), P(a)), sub(P(c), P(a)))) / 2
      area += A1 + A2
      const k1 = (K[a] + K[b] + K[d]) / 3, k2 = (K[a] + K[d] + K[c]) / 3
      if (Number.isFinite(k1)) totalK += k1 * A1
      if (Number.isFinite(k2)) totalK += k2 * A2
    }
  return { pos, K, H, index, bad, area, totalK, bounds: [lo, hi] }
}

/** Robust symmetric scale: the 95th percentile of |values|. */
export function robustScale(a: Float32Array): number {
  const v = Array.from(a).filter(Number.isFinite).map(Math.abs).sort((x, y) => x - y)
  return v.length ? v[Math.floor(v.length * 0.95)] || v[v.length - 1] || 1 : 1
}

/** Diverging blue–white–red colour map for x in [-1, 1]. */
export function diverging(x: number): V3 {
  const t = Math.max(-1, Math.min(1, x))
  return t < 0 ? [1 + t * 0.85, 1 + t * 0.55, 1 + t * 0.05] : [1 - t * 0.05, 1 - t * 0.7, 1 - t * 0.8]
}

/** Arc length and curvature/torsion of a space curve sampled at n points. */
export function curveInfo(f: (t: number) => V3, t0: number, t1: number, n: number) {
  const pts: V3[] = []
  let len = 0
  for (let i = 0; i <= n; i++) {
    const p = f(t0 + ((t1 - t0) * i) / n)
    if (i) len += Math.hypot(...sub(p, pts[i - 1]))
    pts.push(p)
  }
  const h = (t1 - t0) * 1e-4
  const kappa = (t: number) => {
    const d1 = mul(sub(f(t + h), f(t - h)), 1 / (2 * h))
    const d2 = mul(add(sub(f(t + h), mul(f(t), 2)), f(t - h)), 1 / (h * h))
    return Math.hypot(...cross(d1, d2)) / Math.hypot(...d1) ** 3
  }
  return { pts, len, kappa }
}

export interface Preset { name: string; kind: 'surface' | 'curve'; x: string; y: string; z: string; u: [string, string]; v?: [string, string]; a?: number }
export const PRESETS: Preset[] = [
  { name: 'Torus', kind: 'surface', x: '(a + cos(v)) cos(u)', y: '(a + cos(v)) sin(u)', z: 'sin(v)', u: ['0', '2pi'], v: ['0', '2pi'], a: 2.2 },
  { name: 'Sphere', kind: 'surface', x: 'a sin(v) cos(u)', y: 'a sin(v) sin(u)', z: 'a cos(v)', u: ['0', '2pi'], v: ['0', 'pi'], a: 2 },
  { name: 'Klein bottle (figure-8)', kind: 'surface', x: '(a + cos(u/2) sin(v) - sin(u/2) sin(2v)) cos(u)', y: '(a + cos(u/2) sin(v) - sin(u/2) sin(2v)) sin(u)', z: 'sin(u/2) sin(v) + cos(u/2) sin(2v)', u: ['0', '2pi'], v: ['0', '2pi'], a: 2.5 },
  { name: 'Möbius strip', kind: 'surface', x: '(a + v cos(u/2)) cos(u)', y: '(a + v cos(u/2)) sin(u)', z: 'v sin(u/2)', u: ['0', '2pi'], v: ['-0.8', '0.8'], a: 2 },
  { name: 'Helicoid', kind: 'surface', x: 'v cos(u)', y: 'v sin(u)', z: 'a u / 2', u: ['-pi', 'pi'], v: ['-2', '2'], a: 1 },
  { name: 'Enneper surface', kind: 'surface', x: 'u - u^3/3 + u v^2', y: 'v - v^3/3 + v u^2', z: 'u^2 - v^2', u: ['-a', 'a'], v: ['-a', 'a'], a: 1.6 },
  { name: "Dini's surface", kind: 'surface', x: 'cos(u) sin(v)', y: 'sin(u) sin(v)', z: 'cos(v) + ln(tan(v/2)) + a u', u: ['0', '4pi'], v: ['0.05', '2'], a: 0.2 },
  { name: 'Seashell', kind: 'surface', x: 'a (1 - v/(2pi)) (1 + cos(u)) cos(2v)', y: 'a (1 - v/(2pi)) (1 + cos(u)) sin(2v)', z: '3v/(2pi) + a (1 - v/(2pi)) sin(u)', u: ['0', '2pi'], v: ['0', '2pi'], a: 1 },
  { name: 'Monkey saddle', kind: 'surface', x: 'u', y: 'v', z: 'a (u^3 - 3 u v^2)', u: ['-1.5', '1.5'], v: ['-1.5', '1.5'], a: 0.5 },
  { name: 'Trefoil knot', kind: 'curve', x: 'sin(t) + 2 sin(2t)', y: 'cos(t) - 2 cos(2t)', z: '-a sin(3t)', u: ['0', '2pi'], a: 1 },
  { name: 'Torus knot (3,7)', kind: 'curve', x: '(2 + cos(7t/3)) cos(t)', y: '(2 + cos(7t/3)) sin(t)', z: 'a sin(7t/3)', u: ['0', '6pi'], a: 1 },
  { name: 'Conical helix', kind: 'curve', x: 'a t cos(6t) / 3', y: 'a t sin(6t) / 3', z: 't - 2', u: ['0', '4'], a: 1 },
  { name: 'Lissajous 3D', kind: 'curve', x: '2 sin(3t)', y: '2 sin(4t + a)', z: '2 sin(5t)', u: ['0', '2pi'], a: 0.5 },
]
