// Single-variable curve fitting: linear, polynomial, exponential, power, logarithmic, logistic.
// Linear-in-parameter models use QR least squares; the others use Levenberg–Marquardt in original units.
import { tInv } from './descriptive-statistics-calculator'
import { qr } from './linear-regression-lab'

export type ModelId = 'linear' | 'poly' | 'exp' | 'power' | 'log' | 'logistic'
export interface Fit {
  model: ModelId; degree: number; params: number[]; se: number[]; names: string[]
  predict: (x: number) => number
  r2: number; adjR2: number; rmse: number; sse: number; aic: number; aicc: number; bic: number; n: number; k: number
  resid: number[]; ok: boolean; note: string
}

export const MODEL_NAMES: Record<ModelId, string> = { linear: 'Linear', poly: 'Polynomial', exp: 'Exponential', power: 'Power', log: 'Logarithmic', logistic: 'Logistic' }

/** Two numeric columns (comma/tab/space separated); a non-numeric first line is treated as a header. */
export function parseXY(text: string): { x: number[]; y: number[]; xName: string; yName: string; skipped: number } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  let xName = 'x', yName = 'y', skipped = 0
  const x: number[] = [], y: number[] = []
  lines.forEach((l, i) => {
    const c = l.split(/[,;\t ]+/).filter(Boolean)
    const a = Number(c[0]), b = Number(c[1])
    if (c.length >= 2 && Number.isFinite(a) && Number.isFinite(b)) {
      x.push(a)
      y.push(b)
    } else if (i === 0 && c.length >= 2) {
      xName = c[0]
      yName = c[1]
    } else skipped++
  })
  return { x, y, xName, yName, skipped }
}

function solveLinear(X: number[][], y: number[]): { b: number[]; cov: number[][] } | null {
  const p = X[0].length
  const { R, qty, rank } = qr(X, y)
  if (rank < p) return null
  const b = new Array(p).fill(0)
  for (let i = p - 1; i >= 0; i--) {
    let s = qty[i]
    for (let j = i + 1; j < p; j++) s -= R[i][j] * b[j]
    b[i] = s / R[i][i]
  }
  // (RᵀR)⁻¹ = R⁻¹R⁻ᵀ
  const Ri = Array.from({ length: p }, () => new Array(p).fill(0))
  for (let j = 0; j < p; j++) {
    Ri[j][j] = 1 / R[j][j]
    for (let i = j - 1; i >= 0; i--) {
      let s = 0
      for (let k = i + 1; k <= j; k++) s += R[i][k] * Ri[k][j]
      Ri[i][j] = -s / R[i][i]
    }
  }
  const cov = Ri.map((_, i) => Ri.map((__, j) => Ri[i].reduce((s, v, k) => s + v * Ri[j][k], 0)))
  return { b, cov }
}

function invert(A: number[][]): number[][] | null {
  const n = A.length
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-300) return null
    ;[M[c], M[piv]] = [M[piv], M[c]]
    const d = M[c][c]
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d
    for (let r = 0; r < n; r++) if (r !== c) {
      const f = M[r][c]
      if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]
    }
  }
  return M.map((r) => r.slice(n))
}

/** Levenberg–Marquardt least squares with a numeric Jacobian. Returns parameters and (JᵀJ)⁻¹. */
export function levenberg(f: (x: number, p: number[]) => number, x: number[], y: number[], p0: number[], iters = 300): { p: number[]; JtJinv: number[][] | null; sse: number } {
  let p = [...p0]
  const sseOf = (q: number[]) => x.reduce((s, xi, i) => s + (y[i] - f(xi, q)) ** 2, 0)
  let sse = sseOf(p)
  let lambda = 1e-3
  const jac = (q: number[]) => x.map((xi) => q.map((v, k) => {
    const h = 1e-6 * Math.max(1, Math.abs(v))
    const qp = [...q], qm = [...q]
    qp[k] += h
    qm[k] -= h
    return (f(xi, qp) - f(xi, qm)) / (2 * h)
  }))
  for (let it = 0; it < iters; it++) {
    const J = jac(p)
    const r = x.map((xi, i) => y[i] - f(xi, p))
    const m = p.length
    const JtJ = Array.from({ length: m }, (_, a) => Array.from({ length: m }, (__, b) => J.reduce((s, row) => s + row[a] * row[b], 0)))
    const Jtr = Array.from({ length: m }, (_, a) => J.reduce((s, row, i) => s + row[a] * r[i], 0))
    let improved = false
    for (let tries = 0; tries < 12; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)))
      const Ai = invert(A)
      if (!Ai) {
        lambda *= 10
        continue
      }
      const step = Ai.map((row) => row.reduce((s, v, b) => s + v * Jtr[b], 0))
      const q = p.map((v, k) => v + step[k])
      const s2 = sseOf(q)
      if (Number.isFinite(s2) && s2 < sse) {
        const rel = (sse - s2) / Math.max(1e-300, sse)
        p = q
        sse = s2
        lambda = Math.max(1e-12, lambda / 10)
        improved = true
        if (rel < 1e-12) it = iters
        break
      }
      lambda *= 10
    }
    if (!improved) break
  }
  const J = jac(p)
  const m = p.length
  const JtJ = Array.from({ length: m }, (_, a) => Array.from({ length: m }, (__, b) => J.reduce((s, row) => s + row[a] * row[b], 0)))
  return { p, JtJinv: invert(JtJ), sse }
}

function finish(model: ModelId, degree: number, names: string[], params: number[], cov: number[][] | null, predict: (x: number) => number, x: number[], y: number[], note = ''): Fit {
  const n = x.length, k = params.length
  const resid = y.map((v, i) => v - predict(x[i]))
  const sse = resid.reduce((s, e) => s + e * e, 0)
  const ybar = y.reduce((a, b) => a + b, 0) / n
  const sst = y.reduce((s, v) => s + (v - ybar) ** 2, 0)
  const r2 = sst > 0 ? 1 - sse / sst : 1
  const dof = n - k
  const s2 = dof > 0 ? sse / dof : NaN
  const se = params.map((_, i) => (cov && dof > 0 ? Math.sqrt(Math.max(0, cov[i][i] * s2)) : NaN))
  const kk = k + 1 // + error variance
  const ll = -(n / 2) * (Math.log(2 * Math.PI) + Math.log(Math.max(1e-300, sse / n)) + 1)
  const aic = -2 * ll + 2 * kk
  const ok = params.every(Number.isFinite) && Number.isFinite(sse)
  return {
    model, degree, params, se, names, predict, r2, adjR2: dof > 0 ? 1 - (1 - r2) * ((n - 1) / dof) : NaN, rmse: Math.sqrt(sse / n), sse,
    aic, aicc: n - kk - 1 > 0 ? aic + (2 * kk * (kk + 1)) / (n - kk - 1) : Infinity, bic: -2 * ll + Math.log(n) * kk, n, k, resid, ok, note,
  }
}

export function fitModel(model: ModelId, x: number[], y: number[], degree = 2): Fit | { error: string } {
  const n = x.length
  if (n < 3) return { error: 'Need at least 3 points.' }
  if (model === 'linear' || model === 'poly') {
    const d = model === 'linear' ? 1 : Math.max(2, Math.min(8, degree))
    if (n <= d + 1) return { error: `Degree ${d} needs more than ${d + 1} points.` }
    // centre and scale x for numerical stability, then map back to raw coefficients
    const mx = x.reduce((a, b) => a + b, 0) / n
    const sx = Math.max(1e-12, Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) / n))
    const X = x.map((v) => Array.from({ length: d + 1 }, (_, j) => ((v - mx) / sx) ** j))
    const sol = solveLinear(X, y)
    if (!sol) return { error: 'x values are not distinct enough for this degree.' }
    // expand Σ c_j ((x−m)/s)^j into raw powers of x
    const raw = new Array(d + 1).fill(0)
    const binom = (a: number, b: number) => { let r = 1; for (let i = 1; i <= b; i++) r = (r * (a - b + i)) / i; return r }
    for (let j = 0; j <= d; j++) for (let i = 0; i <= j; i++) raw[i] += sol.b[j] * binom(j, i) * (-mx) ** (j - i) / sx ** j
    // covariance transform: raw = T c
    const T = Array.from({ length: d + 1 }, (_, i) => Array.from({ length: d + 1 }, (__, j) => (j >= i ? (binom(j, i) * (-mx) ** (j - i)) / sx ** j : 0)))
    const cov = T.map((ri) => T.map((rj) => ri.reduce((s, a, p) => s + a * rj.reduce((t, b, q) => t + sol.cov[p][q] * b, 0), 0)))
    const names = raw.map((_, i) => (i === 0 ? 'a₀' : `a${String(i).replace(/\d/g, (c) => '₀₁₂₃₄₅₆₇₈₉'[+c])}`))
    return finish(model, d, names, raw, cov, (v) => raw.reduce((s, c, i) => s + c * v ** i, 0), x, y)
  }
  if (model === 'exp') {
    if (y.some((v) => v <= 0)) return { error: 'Exponential fit needs y > 0 for the starting guess.' }
    const lin = fitModel('linear', x, y.map(Math.log))
    if ('error' in lin) return lin
    const f = (v: number, p: number[]) => p[0] * Math.exp(p[1] * v)
    const r = levenberg(f, x, y, [Math.exp(lin.params[0]), lin.params[1]])
    return finish('exp', 0, ['a', 'b'], r.p, r.JtJinv, (v) => f(v, r.p), x, y)
  }
  if (model === 'power') {
    if (x.some((v) => v <= 0) || y.some((v) => v <= 0)) return { error: 'Power fit needs x > 0 and y > 0.' }
    const lin = fitModel('linear', x.map(Math.log), y.map(Math.log))
    if ('error' in lin) return lin
    const f = (v: number, p: number[]) => p[0] * v ** p[1]
    const r = levenberg(f, x, y, [Math.exp(lin.params[0]), lin.params[1]])
    return finish('power', 0, ['a', 'b'], r.p, r.JtJinv, (v) => f(v, r.p), x, y)
  }
  if (model === 'log') {
    if (x.some((v) => v <= 0)) return { error: 'Logarithmic fit needs x > 0.' }
    const sol = solveLinear(x.map((v) => [1, Math.log(v)]), y)
    if (!sol) return { error: 'x values are not distinct enough.' }
    const p = sol.b
    return finish('log', 0, ['a', 'b'], p, sol.cov, (v) => p[0] + p[1] * Math.log(v), x, y)
  }
  // logistic: y = L / (1 + e^{−k(x − x0)})
  const ymax = Math.max(...y), ymin = Math.min(...y)
  const f = (v: number, p: number[]) => p[0] / (1 + Math.exp(-p[1] * (v - p[2])))
  const xs = [...x].sort((a, b) => a - b)
  const half = x[y.reduce((bi, v, i) => (Math.abs(v - ymax / 2) < Math.abs(y[bi] - ymax / 2) ? i : bi), 0)]
  const span = (xs[xs.length - 1] - xs[0]) || 1
  const rising = y[x.indexOf(xs[xs.length - 1])] >= y[x.indexOf(xs[0])]
  let best: ReturnType<typeof levenberg> | null = null
  for (const Lm of [1.05, 1.3, 2]) for (const km of [4, 10, 1]) {
    const r = levenberg(f, x, y, [Math.max(ymax, Math.abs(ymin)) * Lm, ((rising ? 1 : -1) * km) / span, half])
    if (!best || r.sse < best.sse) best = r
  }
  return finish('logistic', 0, ['L', 'k', 'x₀'], best!.p, best!.JtJinv, (v) => f(v, best!.p), x, y)
}

/** All candidate fits ranked by AICc (lower is better). */
export function compare(x: number[], y: number[], degree: number): { fit: Fit | null; model: ModelId; error?: string }[] {
  const ids: ModelId[] = ['linear', 'poly', 'exp', 'power', 'log', 'logistic']
  return ids.map((m) => {
    const r = fitModel(m, x, y, degree)
    return 'error' in r ? { fit: null, model: m, error: r.error } : { fit: r, model: m }
  })
}

const fmtNum = (v: number, sig = 5) => {
  if (!Number.isFinite(v)) return '\\text{NaN}'
  const s = Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(sig - 1) : String(+v.toPrecision(sig))
  const m = /^(-?[\d.]+)e([+-]\d+)$/.exec(s)
  return m ? `${m[1]}\\times 10^{${Number(m[2])}}` : s
}

/** LaTeX for the fitted equation. */
export function latex(f: Fit, yName = 'y', xName = 'x'): string {
  const X = xName.length === 1 ? xName : `\\text{${xName}}`
  const Y = yName.length === 1 ? yName : `\\text{${yName}}`
  const sgn = (v: number, first = false) => (v < 0 ? ' - ' : first ? '' : ' + ') + fmtNum(Math.abs(v))
  const p = f.params
  switch (f.model) {
    case 'linear': return `${Y} = ${fmtNum(p[1])}\\,${X}${sgn(p[0])}`
    case 'poly': return `${Y} = ${p.map((c, i) => ({ c, i })).reverse().map(({ c, i }, k) => `${sgn(c, k === 0)}${i === 0 ? '' : i === 1 ? `\\,${X}` : `\\,${X}^{${i}}`}`).join('')}`
    case 'exp': return `${Y} = ${fmtNum(p[0])}\\,e^{${fmtNum(p[1])}\\,${X}}`
    case 'power': return `${Y} = ${fmtNum(p[0])}\\,${X}^{${fmtNum(p[1])}}`
    case 'log': return `${Y} = ${fmtNum(p[0])}${sgn(p[1])}\\ln ${X}`
    case 'logistic': return `${Y} = \\frac{${fmtNum(p[0])}}{1 + e^{-${fmtNum(p[1])}(${X} ${p[2] < 0 ? '+' : '-'} ${fmtNum(Math.abs(p[2]))})}}`
  }
}

/** Two-sided t critical value for parameter confidence intervals. */
export const tCrit = (conf: number, dof: number) => tInv(1 - (1 - conf) / 2, Math.max(1, dof))

export const PRESETS: { id: string; name: string; text: string; best: ModelId; degree?: number; note: string }[] = [
  { id: 'kepler', name: "Kepler's 3rd law", best: 'power', note: 'Planet orbital period (years) vs semi-major axis (AU). Expect T ≈ a^1.5.', text: 'axis_AU,period_yr\n0.387,0.241\n0.723,0.615\n1.000,1.000\n1.524,1.881\n5.203,11.862\n9.537,29.457\n19.19,84.011\n30.07,164.79' },
  { id: 'braking', name: 'Braking distance', best: 'poly', degree: 2, note: 'Stopping distance (m) vs speed (km/h): reaction distance is linear, braking distance quadratic.', text: 'speed_kmh,distance_m\n20,6.2\n30,10.9\n40,16.8\n50,24.1\n60,32.0\n70,41.6\n80,52.3\n90,64.1\n100,77.4\n110,91.8\n120,107.2' },
  { id: 'growth', name: 'Bacterial growth', best: 'logistic', note: 'Optical density (OD600) vs hours: lag, exponential phase and plateau (logistic).', text: 'hours,OD600\n0,0.02\n1,0.03\n2,0.05\n3,0.09\n4,0.16\n5,0.29\n6,0.47\n7,0.70\n8,0.92\n9,1.08\n10,1.18\n11,1.24\n12,1.27\n13,1.29\n14,1.30' },
  { id: 'decay', name: 'Radioactive decay', best: 'exp', note: 'Counts per minute vs minutes for a short-lived isotope (exponential decay).', text: 'minutes,cpm\n0,1000\n5,782\n10,610\n15,479\n20,372\n25,291\n30,228\n40,139\n50,85\n60,52' },
  { id: 'learning', name: 'Learning curve', best: 'log', note: 'Typing speed (wpm) vs practice sessions: fast early gains that level off (logarithmic).', text: 'session,wpm\n1,18\n2,26\n3,30\n4,33\n6,37\n8,40\n12,44\n16,46\n24,50\n32,52' },
]
