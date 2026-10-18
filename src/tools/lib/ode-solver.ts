// ODE integrators: explicit Dormand–Prince 5(4) with adaptive steps and an implicit
// Rosenbrock 2(3) W-method (Shampine–Reichelt formulas) for stiff systems; cubic Hermite resampling.
import { compile } from './3d-function-plotter'

export type Sys = (t: number, y: number[]) => number[]
export interface Eq { name: string; expr: string; y0: number }
export interface Param { name: string; value: number }
export interface Opts { rtol?: number; atol?: number; maxSteps?: number; hmax?: number }
export interface Solution {
  t: number[]
  y: number[][]
  /** Derivatives at each output point (for Hermite interpolation). */
  dy: number[][]
  steps: number
  rejected: number
  evals: number
  status: 'ok' | 'maxsteps' | 'nonfinite' | 'stepsize'
}

const NAME = /^[a-z_][a-z0-9_]*$/

/** Compiles `name' = expr` equations with parameters into f(t, y). Names are case-insensitive. */
export function buildSystem(eqs: Eq[], params: Param[]): { f: Sys; names: string[] } {
  const names = eqs.map((e) => e.name.trim().toLowerCase())
  const pn = params.map((p) => p.name.trim().toLowerCase())
  for (const n of [...names, ...pn]) if (!NAME.test(n) || n === 't') throw new Error(`"${n || '(empty)'}" is not a valid variable name`)
  const all = [...names, ...pn]
  const dup = all.find((n, i) => all.indexOf(n) !== i)
  if (dup) throw new Error(`"${dup}" is defined twice`)
  const vars = ['t', ...names, ...pn]
  const fns = eqs.map((e, i) => {
    try {
      return compile(e.expr, vars)
    } catch (err) {
      throw new Error(`${names[i]}': ${(err as Error).message}`)
    }
  })
  const env: Record<string, number> = {}
  params.forEach((p, i) => (env[pn[i]] = p.value))
  const f: Sys = (t, y) => {
    env.t = t
    for (let i = 0; i < names.length; i++) env[names[i]] = y[i]
    return fns.map((fn) => fn(env))
  }
  return { f, names }
}

const finite = (v: number[]) => v.every(Number.isFinite)

// Dormand–Prince 5(4) tableau
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1]
const A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
]
const E = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40]

function errNorm(err: number[], y0: number[], y1: number[], rtol: number, atol: number): number {
  let m = 0
  for (let i = 0; i < err.length; i++) m = Math.max(m, Math.abs(err[i]) / (atol + rtol * Math.max(Math.abs(y0[i]), Math.abs(y1[i]))))
  return m
}

function initialStep(f: Sys, t0: number, y0: number[], f0: number[], span: number, order: number, rtol: number, atol: number): number {
  const sc = y0.map((v) => atol + rtol * Math.abs(v))
  const d0 = Math.sqrt(y0.reduce((a, v, i) => a + (v / sc[i]) ** 2, 0) / y0.length)
  const d1 = Math.sqrt(f0.reduce((a, v, i) => a + (v / sc[i]) ** 2, 0) / y0.length)
  let h0 = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 : 0.01 * (d0 / d1)
  h0 = Math.min(h0, Math.abs(span))
  const y1 = y0.map((v, i) => v + h0 * Math.sign(span) * f0[i])
  const f1 = f(t0 + h0 * Math.sign(span), y1)
  const d2 = Math.sqrt(f1.reduce((a, v, i) => a + ((v - f0[i]) / sc[i]) ** 2, 0) / y0.length) / h0
  const h1 = Math.max(d1, d2) <= 1e-15 ? Math.max(1e-6, h0 * 1e-3) : (0.01 / Math.max(d1, d2)) ** (1 / (order + 1))
  return Math.min(100 * h0, h1, Math.abs(span))
}

/** Explicit adaptive Dormand–Prince RK5(4). */
export function dopri45(f: Sys, t0: number, y0: number[], t1: number, o: Opts = {}): Solution {
  const rtol = o.rtol ?? 1e-6, atol = o.atol ?? 1e-9, maxSteps = o.maxSteps ?? 50000
  const dir = Math.sign(t1 - t0) || 1
  const hmax = o.hmax ?? Math.abs(t1 - t0)
  let t = t0, y = [...y0]
  let k1 = f(t, y)
  let evals = 1
  const sol: Solution = { t: [t], y: [[...y]], dy: [[...k1]], steps: 0, rejected: 0, evals, status: 'ok' }
  if (!finite(k1)) return { ...sol, status: 'nonfinite' }
  let h = Math.min(hmax, initialStep(f, t0, y0, k1, t1 - t0, 4, rtol, atol))
  evals++
  const n = y.length
  while (dir * (t1 - t) > 1e-12 * Math.max(1, Math.abs(t1))) {
    if (sol.steps + sol.rejected >= maxSteps) { sol.status = 'maxsteps'; break }
    if (h < 1e-14 * Math.max(1, Math.abs(t))) { sol.status = 'stepsize'; break }
    if (dir * (t + dir * h - t1) > 0) h = Math.abs(t1 - t)
    const k: number[][] = [k1]
    for (let s = 1; s < 7; s++) {
      const ys = y.map((v, i) => { let acc = v; for (let j = 0; j < s; j++) acc += dir * h * A[s][j] * k[j][i]; return acc })
      k.push(f(t + dir * C[s] * h, ys))
    }
    evals += 6
    // 5th-order solution is the stage-7 argument (FSAL)
    const yn = y.map((v, i) => { let acc = v; for (let j = 0; j < 6; j++) acc += dir * h * A[6][j] * k[j][i]; return acc })
    const err = new Array(n).fill(0).map((_, i) => { let acc = 0; for (let j = 0; j < 7; j++) acc += E[j] * k[j][i]; return dir * h * acc })
    const en = finite(yn) && finite(k[6]) ? errNorm(err, y, yn, rtol, atol) : Infinity
    if (en <= 1) {
      t += dir * h
      y = yn
      k1 = k[6]
      sol.t.push(t); sol.y.push([...y]); sol.dy.push([...k1]); sol.steps++
      h = Math.min(hmax, h * Math.min(5, Math.max(0.2, 0.9 * (en || 1e-10) ** -0.2)))
    } else {
      sol.rejected++
      h *= Number.isFinite(en) ? Math.max(0.1, 0.9 * en ** -0.25) : 0.1
    }
  }
  sol.evals = evals
  return sol
}

function jacobian(f: Sys, t: number, y: number[], fy: number[]): number[][] {
  const n = y.length
  const J = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let j = 0; j < n; j++) {
    const d = Math.sqrt(2.2e-16) * Math.max(1e-5, Math.abs(y[j]))
    const yp = [...y]
    yp[j] += d
    const fp = f(t, yp)
    for (let i = 0; i < n; i++) J[i][j] = (fp[i] - fy[i]) / d
  }
  return J
}

/** LU decomposition with partial pivoting; returns a solver for M x = b. */
export function luSolver(M: number[][]): (b: number[]) => number[] {
  const n = M.length
  const a = M.map((r) => [...r])
  const piv = Array.from({ length: n }, (_, i) => i)
  for (let k = 0; k < n; k++) {
    let p = k
    for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > Math.abs(a[p][k])) p = i
    if (Math.abs(a[p][k]) < 1e-300) throw new Error('Singular iteration matrix')
    ;[a[k], a[p]] = [a[p], a[k]]
    ;[piv[k], piv[p]] = [piv[p], piv[k]]
    for (let i = k + 1; i < n; i++) {
      a[i][k] /= a[k][k]
      for (let j = k + 1; j < n; j++) a[i][j] -= a[i][k] * a[k][j]
    }
  }
  return (b) => {
    const x = piv.map((p) => b[p])
    for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) x[i] -= a[i][j] * x[j]
    for (let i = n - 1; i >= 0; i--) { for (let j = i + 1; j < n; j++) x[i] -= a[i][j] * x[j]; x[i] /= a[i][i] }
    return x
  }
}

/** Implicit (linearly implicit) Rosenbrock 2(3) W-method for stiff problems, adaptive. */
export function rosenbrock23(f: Sys, t0: number, y0: number[], t1: number, o: Opts = {}): Solution {
  const rtol = o.rtol ?? 1e-5, atol = o.atol ?? 1e-8, maxSteps = o.maxSteps ?? 50000
  const dir = Math.sign(t1 - t0) || 1
  const hmax = o.hmax ?? Math.abs(t1 - t0)
  const d = 1 / (2 + Math.SQRT2), e32 = 6 + Math.SQRT2
  let t = t0, y = [...y0]
  let F0 = f(t, y)
  let evals = 1
  const sol: Solution = { t: [t], y: [[...y]], dy: [[...F0]], steps: 0, rejected: 0, evals, status: 'ok' }
  if (!finite(F0)) return { ...sol, status: 'nonfinite' }
  let h = Math.min(hmax, initialStep(f, t0, y0, F0, t1 - t0, 2, rtol, atol))
  const n = y.length
  while (dir * (t1 - t) > 1e-12 * Math.max(1, Math.abs(t1))) {
    if (sol.steps + sol.rejected >= maxSteps) { sol.status = 'maxsteps'; break }
    if (h < 1e-14 * Math.max(1, Math.abs(t))) { sol.status = 'stepsize'; break }
    if (dir * (t + dir * h - t1) > 0) h = Math.abs(t1 - t)
    const hs = dir * h
    const J = jacobian(f, t, y, F0)
    const dt = Math.sqrt(2.2e-16) * Math.max(1e-5, Math.abs(t))
    const Ft = f(t + dt, y).map((v, i) => (v - F0[i]) / dt)
    evals += n + 1
    const W = J.map((row, i) => row.map((v, j) => (i === j ? 1 : 0) - hs * d * v))
    let solve: (b: number[]) => number[]
    try { solve = luSolver(W) } catch { h *= 0.5; sol.rejected++; continue }
    const T = Ft.map((v) => hs * d * v)
    const k1 = solve(F0.map((v, i) => v + T[i]))
    const F1 = f(t + 0.5 * hs, y.map((v, i) => v + 0.5 * hs * k1[i]))
    const k2 = solve(F1.map((v, i) => v - k1[i])).map((v, i) => v + k1[i])
    const yn = y.map((v, i) => v + hs * k2[i])
    const F2 = f(t + hs, yn)
    evals += 2
    const k3 = solve(F2.map((v, i) => v - e32 * (k2[i] - F1[i]) - 2 * (k1[i] - F0[i]) + T[i]))
    const err = new Array(n).fill(0).map((_, i) => (hs / 6) * (k1[i] - 2 * k2[i] + k3[i]))
    const en = finite(yn) && finite(F2) ? errNorm(err, y, yn, rtol, atol) : Infinity
    if (en <= 1) {
      t += hs
      y = yn
      F0 = F2
      sol.t.push(t); sol.y.push([...y]); sol.dy.push([...F0]); sol.steps++
      h = Math.min(hmax, h * Math.min(5, Math.max(0.2, 0.8 * (en || 1e-10) ** (-1 / 3))))
    } else {
      sol.rejected++
      h *= Number.isFinite(en) ? Math.max(0.1, 0.8 * en ** (-1 / 3)) : 0.1
    }
  }
  sol.evals = evals
  return sol
}

/** Uniform resampling with cubic Hermite interpolation between accepted steps. */
export function resample(s: Solution, n: number): { t: number[]; y: number[][] } {
  const T = s.t
  if (T.length < 2) return { t: [...T], y: s.y.map((r) => [...r]) }
  const t0 = T[0], t1 = T[T.length - 1]
  const out = { t: [] as number[], y: [] as number[][] }
  let k = 0
  for (let i = 0; i < n; i++) {
    const t = t0 + ((t1 - t0) * i) / (n - 1)
    while (k < T.length - 2 && (t1 > t0 ? T[k + 1] < t : T[k + 1] > t)) k++
    const h = T[k + 1] - T[k]
    const u = h ? (t - T[k]) / h : 0
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2
    out.t.push(t)
    out.y.push(s.y[k].map((y0, j) => h00 * y0 + h10 * h * s.dy[k][j] + h01 * s.y[k + 1][j] + h11 * h * s.dy[k + 1][j]))
  }
  return out
}

export interface Preset { id: string; name: string; eqs: Eq[]; params: Param[]; t1: number; method: 'rk45' | 'implicit'; note: string; px?: [number, number] }
export const PRESETS: Preset[] = [
  { id: 'lv', name: 'Predator–prey (Lotka–Volterra)', eqs: [{ name: 'x', expr: 'a*x - b*x*y', y0: 10 }, { name: 'y', expr: '-c*y + d*x*y', y0: 5 }], params: [{ name: 'a', value: 1.1 }, { name: 'b', value: 0.4 }, { name: 'c', value: 0.4 }, { name: 'd', value: 0.1 }], t1: 50, method: 'rk45', note: 'Closed orbits around the equilibrium (c/d, a/b).' },
  { id: 'vdp', name: 'Van der Pol oscillator (μ = 2)', eqs: [{ name: 'x', expr: 'v', y0: 2 }, { name: 'v', expr: 'mu*(1 - x^2)*v - x', y0: 0 }], params: [{ name: 'mu', value: 2 }], t1: 30, method: 'rk45', note: 'Every trajectory converges to the limit cycle.' },
  { id: 'vdps', name: 'Stiff Van der Pol (μ = 1000)', eqs: [{ name: 'x', expr: 'v', y0: 2 }, { name: 'v', expr: 'mu*(1 - x^2)*v - x', y0: 0 }], params: [{ name: 'mu', value: 1000 }], t1: 3000, method: 'implicit', note: 'Stiff: the explicit method needs hundreds of thousands of steps; the implicit one only a few hundred.' },
  { id: 'pend', name: 'Damped pendulum', eqs: [{ name: 'th', expr: 'w', y0: 2.5 }, { name: 'w', expr: '-g/l*sin(th) - k*w', y0: 0 }], params: [{ name: 'g', value: 9.81 }, { name: 'l', value: 1 }, { name: 'k', value: 0.3 }], t1: 20, method: 'rk45', note: 'Spirals into the stable equilibrium at θ = 0.' },
  { id: 'lorenz', name: 'Lorenz attractor', eqs: [{ name: 'x', expr: 's*(y - x)', y0: 1 }, { name: 'y', expr: 'x*(r - z) - y', y0: 1 }, { name: 'z', expr: 'x*y - b*z', y0: 1 }], params: [{ name: 's', value: 10 }, { name: 'r', value: 28 }, { name: 'b', value: 8 / 3 }], t1: 40, method: 'rk45', note: 'Chaotic: tiny changes to the start values give a different path.', px: [0, 2] },
  { id: 'sir', name: 'SIR epidemic', eqs: [{ name: 's', expr: '-beta*s*i', y0: 0.99 }, { name: 'i', expr: 'beta*s*i - gamma*i', y0: 0.01 }, { name: 'r', expr: 'gamma*i', y0: 0 }], params: [{ name: 'beta', value: 0.3 }, { name: 'gamma', value: 0.1 }], t1: 160, method: 'rk45', note: 'R₀ = β/γ = 3. s + i + r stays 1.' },
  { id: 'rob', name: 'Robertson kinetics (stiff)', eqs: [{ name: 'a', expr: '-0.04*a + 1e4*b*c', y0: 1 }, { name: 'b', expr: '0.04*a - 1e4*b*c - 3e7*b^2', y0: 0 }, { name: 'c', expr: '3e7*b^2', y0: 0 }], params: [], t1: 40, method: 'implicit', note: 'Classic stiff chemistry benchmark; a + b + c = 1.' },
  { id: 'osc', name: 'Harmonic oscillator', eqs: [{ name: 'x', expr: 'v', y0: 1 }, { name: 'v', expr: '-w^2*x', y0: 0 }], params: [{ name: 'w', value: 2 }], t1: 10, method: 'rk45', note: 'Exact solution x = cos(ωt).' },
]
