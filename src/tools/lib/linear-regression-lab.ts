// Multiple linear regression (OLS via Householder QR) with inference, ANOVA and diagnostics.
import { tInv } from './descriptive-statistics-calculator'
import { chi2Cdf, fCdf, tCdf } from './hypothesis-test-wizard'

export interface Table { cols: string[]; rows: string[][] }

/** CSV/TSV/whitespace table with a header row. */
export function parseTable(text: string): Table {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  if (!lines.length) return { cols: [], rows: [] }
  const sep = lines[0].includes(',') ? ',' : lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : /\s+/
  const split = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1'))
  const cols = split(lines[0]).map((c, i) => c || `col${i + 1}`)
  return { cols, rows: lines.slice(1).map(split) }
}

export const isNumeric = (t: Table, j: number) => t.rows.every((r) => r[j] === '' || r[j] === undefined || Number.isFinite(Number(r[j]))) && t.rows.some((r) => r[j] !== '' && r[j] !== undefined)

export interface Design { X: number[][]; y: number[]; names: string[]; terms: { name: string; cols: number[] }[]; rowsUsed: number[]; levels: Record<string, string[]>; dropped: number }

/** Builds the model matrix; text columns become treatment-coded dummies (first level = reference). */
export function design(t: Table, yName: string, xNames: string[], intercept = true): Design {
  const yj = t.cols.indexOf(yName)
  const xs = xNames.map((n) => ({ n, j: t.cols.indexOf(n) })).filter((x) => x.j >= 0)
  const levels: Record<string, string[]> = {}
  for (const x of xs) if (!isNumeric(t, x.j)) levels[x.n] = [...new Set(t.rows.map((r) => r[x.j]).filter((v) => v !== '' && v !== undefined))].sort()
  const names: string[] = intercept ? ['(Intercept)'] : []
  const terms: Design['terms'] = intercept ? [{ name: '(Intercept)', cols: [0] }] : []
  for (const x of xs) {
    const start = names.length
    if (levels[x.n]) for (const lv of levels[x.n].slice(1)) names.push(`${x.n}[${lv}]`)
    else names.push(x.n)
    terms.push({ name: x.n, cols: Array.from({ length: names.length - start }, (_, k) => start + k) })
  }
  const X: number[][] = [], y: number[] = [], rowsUsed: number[] = []
  t.rows.forEach((r, i) => {
    const yv = Number(r[yj])
    if (r[yj] === '' || !Number.isFinite(yv)) return
    const row: number[] = intercept ? [1] : []
    for (const x of xs) {
      const v = r[x.j]
      if (v === '' || v === undefined) return
      if (levels[x.n]) for (const lv of levels[x.n].slice(1)) row.push(v === lv ? 1 : 0)
      else {
        const nv = Number(v)
        if (!Number.isFinite(nv)) return
        row.push(nv)
      }
    }
    X.push(row)
    y.push(yv)
    rowsUsed.push(i)
  })
  return { X, y, names, terms, rowsUsed, levels, dropped: t.rows.length - X.length }
}

/** Householder QR of an n×p matrix (n ≥ p). Returns thin Q (n×p) and R (p×p) plus Qᵀy. */
export function qr(X: number[][], y: number[]): { Q: number[][]; R: number[][]; qty: number[]; rank: number } {
  const n = X.length, p = X[0]?.length ?? 0
  const A = X.map((r) => [...r])
  const b = [...y]
  const vs: number[][] = []
  let rank = 0
  const scale = Math.max(1e-300, ...X.flat().map(Math.abs))
  for (let k = 0; k < p; k++) {
    let norm = 0
    for (let i = k; i < n; i++) norm += A[i][k] ** 2
    norm = Math.sqrt(norm)
    const v = new Array(n).fill(0)
    if (norm > 1e-10 * scale) rank++
    const alpha = A[k][k] > 0 ? -norm : norm
    for (let i = k; i < n; i++) v[i] = A[i][k]
    v[k] -= alpha
    const vn = v.reduce((s, x) => s + x * x, 0)
    vs.push(v)
    if (vn < 1e-300) continue
    for (let j = k; j < p; j++) {
      let d = 0
      for (let i = k; i < n; i++) d += v[i] * A[i][j]
      const f = (2 * d) / vn
      for (let i = k; i < n; i++) A[i][j] -= f * v[i]
    }
    let d = 0
    for (let i = k; i < n; i++) d += v[i] * b[i]
    const f = (2 * d) / vn
    for (let i = k; i < n; i++) b[i] -= f * v[i]
  }
  // thin Q = H1 H2 … Hp applied to the first p columns of I
  const Q = Array.from({ length: n }, (_, i) => Array.from({ length: p }, (_, j) => (i === j ? 1 : 0)))
  for (let k = p - 1; k >= 0; k--) {
    const v = vs[k]
    const vn = v.reduce((s, x) => s + x * x, 0)
    if (vn < 1e-300) continue
    for (let j = 0; j < p; j++) {
      let d = 0
      for (let i = k; i < n; i++) d += v[i] * Q[i][j]
      const f = (2 * d) / vn
      for (let i = k; i < n; i++) Q[i][j] -= f * v[i]
    }
  }
  const R = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => (j >= i ? A[i][j] : 0)))
  return { Q, R, qty: b, rank }
}

/** Inverse of an upper-triangular matrix. */
function invUpper(R: number[][]): number[][] {
  const p = R.length
  const inv = Array.from({ length: p }, () => new Array(p).fill(0))
  for (let j = 0; j < p; j++) {
    inv[j][j] = 1 / R[j][j]
    for (let i = j - 1; i >= 0; i--) {
      let s = 0
      for (let k = i + 1; k <= j; k++) s += R[i][k] * inv[k][j]
      inv[i][j] = -s / R[i][i]
    }
  }
  return inv
}

export interface Coef { name: string; b: number; se: number; t: number; p: number; lo: number; hi: number; vif: number }
export interface AnovaRow { term: string; df: number; ss: number; ms: number; F: number; p: number }
export interface Fit {
  n: number; p: number; dfRes: number; intercept: boolean
  coefs: Coef[]; XtXinv: number[][]
  fitted: number[]; resid: number[]; lev: number[]; stdRes: number[]; studRes: number[]; cook: number[]
  sse: number; sst: number; ssr: number; r2: number; adjR2: number; sigma: number
  F: number; Fp: number; dfModel: number
  logLik: number; aic: number; bic: number; dw: number
  anova: AnovaRow[]
  bp: { stat: number; df: number; p: number }; jb: { stat: number; p: number; skew: number; kurt: number }
  conf: number; tcrit: number
}

export class FitError extends Error {}

export function fitOls(d: Design, conf = 0.95): Fit {
  const { X, y, names } = d
  const n = X.length, p = names.length
  if (n <= p) throw new FitError(`Need more observations (${n}) than coefficients (${p}).`)
  const intercept = names[0] === '(Intercept)'
  const { Q, R, qty, rank } = qr(X, y)
  if (rank < p) throw new FitError('Predictors are perfectly collinear (rank-deficient design). Remove a redundant column.')
  const Rinv = invUpper(R)
  const beta = Rinv.map((row) => row.reduce((s, r, j) => s + r * qty[j], 0))
  const XtXinv = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => {
    let s = 0
    for (let k = Math.max(i, j); k < p; k++) s += Rinv[i][k] * Rinv[j][k]
    return s
  }))
  const fitted = X.map((r) => r.reduce((s, x, j) => s + x * beta[j], 0))
  const resid = y.map((v, i) => v - fitted[i])
  const dfRes = n - p
  const sse = resid.reduce((s, e) => s + e * e, 0)
  const ybar = y.reduce((a, b) => a + b, 0) / n
  const sst = intercept ? y.reduce((s, v) => s + (v - ybar) ** 2, 0) : y.reduce((s, v) => s + v * v, 0)
  const ssr = sst - sse
  const s2 = sse / dfRes
  const sigma = Math.sqrt(s2)
  const dfModel = intercept ? p - 1 : p
  const r2 = sst > 0 ? 1 - sse / sst : 0
  const adjR2 = 1 - (1 - r2) * ((intercept ? n - 1 : n) / dfRes)
  const F = dfModel > 0 ? ssr / dfModel / s2 : NaN
  const Fp = dfModel > 0 ? 1 - fCdf(F, dfModel, dfRes) : NaN
  const tcrit = tInv(1 - (1 - conf) / 2, dfRes)
  const lev = Q.map((r) => r.reduce((s, q) => s + q * q, 0))
  const stdRes = resid.map((e, i) => e / (sigma * Math.sqrt(Math.max(1e-12, 1 - lev[i]))))
  const studRes = stdRes.map((r) => r * Math.sqrt((dfRes - 1) / Math.max(1e-12, dfRes - r * r)))
  const cook = stdRes.map((r, i) => ((r * r) / p) * (lev[i] / Math.max(1e-12, 1 - lev[i])))
  // VIF from the correlation structure of the non-intercept columns: VIF_j = 1 / (1 − R²_j)
  const vif = names.map((_, j) => {
    if (intercept && j === 0) return NaN
    const others = names.map((__, k) => k).filter((k) => k !== j && (!intercept || k > 0))
    if (!others.length) return 1
    const xj = X.map((r) => r[j])
    const Xo = X.map((r) => [1, ...others.map((k) => r[k])])
    const q = qr(Xo, xj)
    if (q.rank < Xo[0].length) return Infinity
    const ri = invUpper(q.R)
    const b = ri.map((row) => row.reduce((s, r, k) => s + r * q.qty[k], 0))
    const m = xj.reduce((a, c) => a + c, 0) / n
    const tss = xj.reduce((s, v) => s + (v - m) ** 2, 0)
    const rss = xj.reduce((s, v, i) => s + (v - Xo[i].reduce((a, x, k) => a + x * b[k], 0)) ** 2, 0)
    return tss > 0 ? tss / Math.max(1e-300, rss) : Infinity
  })
  const coefs: Coef[] = names.map((name, j) => {
    const se = Math.sqrt(s2 * XtXinv[j][j])
    const t = beta[j] / se
    return { name, b: beta[j], se, t, p: 2 * (1 - tCdf(Math.abs(t), dfRes)), lo: beta[j] - tcrit * se, hi: beta[j] + tcrit * se, vif: vif[j] }
  })
  // Sequential (type I) sums of squares: squared QR effects grouped by term.
  const anova: AnovaRow[] = []
  for (const term of d.terms) {
    if (term.name === '(Intercept)') continue
    const ss = term.cols.reduce((s, c) => s + qty[c] ** 2, 0)
    const df = term.cols.length
    const Fv = ss / df / s2
    anova.push({ term: term.name, df, ss, ms: ss / df, F: Fv, p: 1 - fCdf(Fv, df, dfRes) })
  }
  anova.push({ term: 'Residuals', df: dfRes, ss: sse, ms: s2, F: NaN, p: NaN })
  const logLik = -(n / 2) * (Math.log(2 * Math.PI) + Math.log(sse / n) + 1)
  const k = p + 1
  let dwNum = 0
  for (let i = 1; i < n; i++) dwNum += (resid[i] - resid[i - 1]) ** 2
  // Breusch–Pagan (Koenker studentised): n·R² of e² on X
  const e2 = resid.map((e) => e * e)
  let bp = { stat: NaN, df: dfModel, p: NaN }
  if (intercept && dfModel > 0) {
    const q2 = qr(X, e2)
    const m2 = e2.reduce((a, b) => a + b, 0) / n
    const tss2 = e2.reduce((s, v) => s + (v - m2) ** 2, 0)
    const ess2 = q2.qty.slice(1, p).reduce((s, v) => s + v * v, 0)
    const stat = tss2 > 0 ? (n * ess2) / tss2 : 0
    bp = { stat, df: dfModel, p: 1 - chi2Cdf(stat, dfModel) }
  }
  const m = resid.reduce((a, b) => a + b, 0) / n
  const m2r = resid.reduce((s, e) => s + (e - m) ** 2, 0) / n
  const skew = resid.reduce((s, e) => s + (e - m) ** 3, 0) / n / m2r ** 1.5
  const kurt = resid.reduce((s, e) => s + (e - m) ** 4, 0) / n / m2r ** 2
  const jbStat = (n / 6) * (skew ** 2 + ((kurt - 3) ** 2) / 4)
  return {
    n, p, dfRes, intercept, coefs, XtXinv, fitted, resid, lev, stdRes, studRes, cook, sse, sst, ssr, r2, adjR2, sigma, F, Fp, dfModel,
    logLik, aic: -2 * logLik + 2 * k, bic: -2 * logLik + Math.log(n) * k, dw: dwNum / sse, anova,
    bp, jb: { stat: jbStat, p: 1 - chi2Cdf(jbStat, 2), skew, kurt }, conf, tcrit,
  }
}

/** Mean response confidence interval and prediction interval at a model-matrix row x0. */
export function predict(f: Fit, x0: number[]) {
  const yhat = f.coefs.reduce((s, c, j) => s + c.b * x0[j], 0)
  let q = 0
  for (let i = 0; i < x0.length; i++) for (let j = 0; j < x0.length; j++) q += x0[i] * f.XtXinv[i][j] * x0[j]
  const seFit = f.sigma * Math.sqrt(q)
  const sePred = f.sigma * Math.sqrt(1 + q)
  return { yhat, seFit, sePred, ci: [yhat - f.tcrit * seFit, yhat + f.tcrit * seFit], pi: [yhat - f.tcrit * sePred, yhat + f.tcrit * sePred], leverage: q }
}

/** Inverse standard normal CDF (Acklam, |rel err| < 1.2e-9). */
export function normInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const pl = 0.02425
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - pl) return -normInv(1 - p)
  const q = p - 0.5, r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

/** Normal Q-Q pairs (theoretical, sample) using Blom positions. */
export function qqPoints(v: number[]): [number, number][] {
  const s = [...v].sort((a, b) => a - b)
  const n = s.length
  return s.map((x, i) => [normInv((i + 1 - 0.375) / (n + 0.25)), x])
}

export const DELIVERY = `time,cases,distance
16.68,7,560
11.50,3,220
12.03,3,340
14.88,4,80
13.75,6,150
18.11,7,330
8.00,2,110
17.83,7,210
79.24,30,1460
21.50,5,605
40.33,16,688
21.00,10,215
13.50,4,255
19.75,6,462
24.00,9,448
29.00,10,776
15.35,6,200
19.00,7,132
9.50,3,36
35.10,17,770
17.90,10,140
52.32,26,810
18.75,9,450
19.83,8,635
10.75,4,150`

export const ANSCOMBE = `x,y
10,8.04
8,6.95
13,7.58
9,8.81
11,8.33
14,9.96
6,7.24
4,4.26
12,10.84
7,4.82
5,5.68`

/** Deterministic synthetic house-price data with a categorical predictor. */
export function houseSample(): string {
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd())
  const hood = ['Center', 'Suburb', 'Riverside']
  const rows = ['price_k,sqft,bedrooms,age,neighborhood']
  for (let i = 0; i < 60; i++) {
    const sqft = Math.round(900 + rnd() * 2200)
    const bed = Math.max(1, Math.min(6, Math.round(sqft / 600 + gauss() * 0.7)))
    const age = Math.round(rnd() * 60)
    const h = hood[Math.floor(rnd() * 3)]
    const price = 60 + 0.13 * sqft + 6 * bed - 0.9 * age + (h === 'Center' ? 45 : h === 'Riverside' ? 22 : 0) + gauss() * 22
    rows.push(`${price.toFixed(1)},${sqft},${bed},${age},${h}`)
  }
  return rows.join('\n')
}
