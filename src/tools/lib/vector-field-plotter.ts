// Vector fields from expressions: evaluation, RK4 streamlines, divergence and curl.
import { compile } from './3d-function-plotter'

export type Vec = [number, number, number]
export type Field = (p: Vec) => Vec

export interface Preset { name: string; fx: string; fy: string; fz: string; dim: 2 | 3; L: number }
export const PRESETS: Preset[] = [
  { name: 'Rotation', fx: '-y', fy: 'x', fz: '0', dim: 2, L: 3 },
  { name: 'Spiral sink', fx: '-y - 0.3x', fy: 'x - 0.3y', fz: '0', dim: 2, L: 3 },
  { name: 'Saddle', fx: 'x', fy: '-y', fz: '0', dim: 2, L: 3 },
  { name: 'Van der Pol (μ=1)', fx: 'y', fy: '(1 - x^2) y - x', fz: '0', dim: 2, L: 4 },
  { name: 'Pendulum phase space', fx: 'y', fy: '-sin(x)', fz: '0', dim: 2, L: 6 },
  { name: 'Dipole (2D)', fx: '(x-1)/((x-1)^2+y^2+0.05) - (x+1)/((x+1)^2+y^2+0.05)', fy: 'y/((x-1)^2+y^2+0.05) - y/((x+1)^2+y^2+0.05)', fz: '0', dim: 2, L: 3 },
  { name: 'Source (3D)', fx: 'x', fy: 'y', fz: 'z', dim: 3, L: 3 },
  { name: 'Helical flow', fx: '-y', fy: 'x', fz: '0.4', dim: 3, L: 3 },
  { name: 'Lorenz (scaled)', fx: '10(y - x)', fy: 'x(28 - z) - y', fz: 'x y - 8/3 z', dim: 3, L: 30 },
  { name: 'ABC flow', fx: 'sin(z) + cos(y)', fy: 'sin(x) + cos(z)', fz: 'sin(y) + cos(x)', dim: 3, L: 3.14 },
  { name: 'Vortex ring-ish', fx: 'x z', fy: 'y z', fz: '1 - x^2 - y^2', dim: 3, L: 2 },
]

/** Compiles the three component expressions (variables x, y, z). Throws with the component name on error. */
export function makeField(fx: string, fy: string, fz: string, dim: 2 | 3): Field {
  const c = (src: string, n: string) => {
    try { return compile(src.trim() || '0', ['x', 'y', 'z']) } catch (e) { throw new Error(`${n}: ${(e as Error).message}`) }
  }
  const X = c(fx, 'Fx'), Y = c(fy, 'Fy'), Z = dim === 3 ? c(fz, 'Fz') : () => 0
  const s = { x: 0, y: 0, z: 0 }
  return (p) => {
    s.x = p[0]; s.y = p[1]; s.z = dim === 3 ? p[2] : 0
    return [X(s), Y(s), Z(s)]
  }
}

const add = (a: Vec, b: Vec, k: number): Vec => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
export const mag = (v: Vec) => Math.hypot(v[0], v[1], v[2])

/** One classical Runge–Kutta 4 step. */
export function rk4(f: Field, p: Vec, h: number): Vec {
  const k1 = f(p), k2 = f(add(p, k1, h / 2)), k3 = f(add(p, k2, h / 2)), k4 = f(add(p, k3, h))
  return [0, 1, 2].map((i) => p[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as Vec
}

/**
 * Streamline through `seed` integrated both ways. Uses a direction-normalised field so the step `h`
 * is an arc length; stops outside the box |coord| ≤ L, at stagnation points, or after `steps`.
 */
export function streamline(f: Field, seed: Vec, h: number, steps: number, L: number, dim: 2 | 3): { pts: Vec[]; mags: number[] } {
  const unitF: Field = (p) => { const v = f(p); const m = mag(v); return m > 1e-12 && Number.isFinite(m) ? [v[0] / m, v[1] / m, v[2] / m] : [0, 0, 0] }
  const run = (dir: 1 | -1) => {
    const out: Vec[] = []
    let p = seed
    for (let i = 0; i < steps; i++) {
      const q = rk4(unitF, p, dir * h)
      if (!q.every(Number.isFinite) || Math.abs(q[0]) > L || Math.abs(q[1]) > L || (dim === 3 && Math.abs(q[2]) > L)) break
      if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < h * 0.05) break
      out.push(q)
      p = q
    }
    return out
  }
  const pts = [...run(-1).reverse(), seed, ...run(1)]
  return { pts, mags: pts.map((p) => mag(f(p))) }
}

/** Central-difference divergence and curl at p. */
export function divCurl(f: Field, p: Vec, h = 1e-4): { div: number; curl: Vec } {
  const d = (i: number) => { const a = [...p] as Vec, b = [...p] as Vec; a[i] += h; b[i] -= h; const fa = f(a), fb = f(b); return [0, 1, 2].map((k) => (fa[k] - fb[k]) / (2 * h)) } // ∂F/∂x_i
  const dx = d(0), dy = d(1), dz = d(2)
  return { div: dx[0] + dy[1] + dz[2], curl: [dy[2] - dz[1], dz[0] - dx[2], dx[1] - dy[0]] }
}
