// Microbial growth curves: Zwietering-parameterised logistic, Gompertz and Richards models and the
// Baranyi–Roberts model, fitted to y = ln(OD/OD₀) by Levenberg–Marquardt.

import { levenberg } from './regression-calculator'

export type ModelId = 'logistic' | 'gompertz' | 'richards' | 'baranyi'
export const MODELS: [ModelId, string][] = [['gompertz', 'Gompertz'], ['logistic', 'Logistic'], ['richards', 'Richards'], ['baranyi', 'Baranyi']]

/** Parameter vector: [y0, A, mu, lambda, (nu)]: offset, asymptote (ln units), max specific rate (1/time), lag. */
export function model(id: ModelId, t: number, p: number[]): number {
  const [y0, A, mu, lam] = p
  if (!(A > 0 && mu > 0)) return NaN
  switch (id) {
    case 'logistic':
      return y0 + A / (1 + Math.exp(((4 * mu) / A) * (lam - t) + 2))
    case 'gompertz':
      return y0 + A * Math.exp(-Math.exp(((mu * Math.E) / A) * (lam - t) + 1))
    case 'richards': {
      const nu = p[4]
      if (!(nu > 0.01 && nu < 50)) return NaN
      return y0 + A * (1 + nu * Math.exp(1 + nu) * Math.exp((mu / A) * (1 + nu) ** (1 + 1 / nu) * (lam - t))) ** (-1 / nu)
    }
    case 'baranyi': {
      if (lam < 0) return NaN
      const h0 = mu * lam
      // A(t) = t + ln(e^{−μt} + e^{−h0} − e^{−μt−h0}) / μ, written stably
      const At = t + Math.log(Math.exp(-mu * t) + Math.exp(-h0) - Math.exp(-mu * t - h0)) / mu
      const g = mu * At
      // y = y0 + μA − ln(1 + (e^{μA} − 1)/e^{A_max}) with m = 1
      const lnTerm = g - A > 30 ? g - A : Math.log1p(Math.expm1(g) / Math.exp(A))
      return y0 + g - lnTerm
    }
  }
}

export interface FitResult {
  id: ModelId
  p: number[]
  se: number[]
  sse: number
  r2: number
  rmse: number
  aic: number
  n: number
  ok: boolean
  /** doubling time ln2/μ */
  td: number
}

/** Max slope by sliding-window linear regression (window of k points). */
export function maxSlope(t: number[], y: number[], k = 5): { slope: number; at: number; yAt: number } {
  let best = { slope: -Infinity, at: t[0] ?? 0, yAt: y[0] ?? 0 }
  for (let i = 0; i + k <= t.length; i++) {
    const tt = t.slice(i, i + k), yy = y.slice(i, i + k)
    const mt = tt.reduce((a, b) => a + b, 0) / k, my = yy.reduce((a, b) => a + b, 0) / k
    let sxy = 0, sxx = 0
    tt.forEach((v, j) => {
      sxy += (v - mt) * (yy[j] - my)
      sxx += (v - mt) ** 2
    })
    const s = sxx ? sxy / sxx : 0
    if (s > best.slope) best = { slope: s, at: mt, yAt: my }
  }
  return best
}

export function initial(t: number[], y: number[]): number[] {
  const y0 = Math.min(...y.slice(0, Math.max(2, Math.ceil(y.length / 10))))
  const A = Math.max(1e-3, Math.max(...y) - y0)
  const ms = maxSlope(t, y, Math.max(3, Math.min(7, Math.floor(t.length / 6))))
  const mu = Math.max(1e-3, ms.slope)
  const lam = Math.max(0, ms.at - (ms.yAt - y0) / mu)
  return [y0, A, mu, lam]
}

export function fitGrowth(id: ModelId, t: number[], y: number[]): FitResult {
  const init = initial(t, y)
  const p0 = id === 'richards' ? [...init, 1] : init
  const f = (x: number, p: number[]) => model(id, x, p)
  // try a couple of starting points for robustness
  const starts = [p0, p0.map((v, i) => (i === 3 ? v * 0.5 : i === 2 ? v * 0.8 : v)), p0.map((v, i) => (i === 3 ? v * 1.3 + 0.2 : v))]
  let best: ReturnType<typeof levenberg> | null = null
  for (const s of starts) {
    const r = levenberg(f, t, y, s, 400)
    if (Number.isFinite(r.sse) && (!best || r.sse < best.sse)) best = r
  }
  const r = best ?? { p: p0, JtJinv: null, sse: NaN }
  const n = t.length, k = r.p.length
  const my = y.reduce((a, b) => a + b, 0) / n
  const sst = y.reduce((a, b) => a + (b - my) ** 2, 0)
  const s2 = n > k ? r.sse / (n - k) : NaN
  const se = r.p.map((_, i) => (r.JtJinv ? Math.sqrt(Math.max(0, r.JtJinv[i][i] * s2)) : NaN))
  const ok = r.p.every(Number.isFinite) && Number.isFinite(r.sse) && r.p[1] > 0 && r.p[2] > 0
  return {
    id, p: r.p, se, sse: r.sse, r2: sst > 0 ? 1 - r.sse / sst : NaN, rmse: Math.sqrt(r.sse / n),
    aic: n * Math.log(Math.max(1e-300, r.sse / n)) + 2 * (k + 1), n, ok, td: Math.LN2 / r.p[2],
  }
}

export interface Plate { time: number[]; wells: { name: string; od: number[] }[] }

/** Parses "time,well1,well2…" CSV (comma, semicolon or tab). Blank cells are allowed. */
export function parsePlate(text: string): Plate | { error: string } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 4) return { error: 'Need a header row and at least 3 time points.' }
  const d = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
  const head = lines[0].split(d).map((h) => h.trim())
  const rows = lines.slice(1).map((l) => l.split(d).map((c) => c.trim()))
  const time = rows.map((r) => parseTime(r[0]))
  if (time.some((v) => !Number.isFinite(v))) return { error: 'First column must be time (number, or hh:mm:ss).' }
  const wells = head.slice(1).map((name, j) => ({ name: name || `Well ${j + 1}`, od: rows.map((r) => (r[j + 1] === undefined || r[j + 1] === '' ? NaN : Number(r[j + 1]))) }))
  if (!wells.length) return { error: 'Need at least one OD column.' }
  return { time, wells }
}

function parseTime(s: string): number {
  if (/^\d+:\d+(:\d+)?$/.test(s)) {
    const [h, m, sec = '0'] = s.split(':')
    return Number(h) + Number(m) / 60 + Number(sec) / 3600
  }
  return Number(s)
}

/** y = ln(OD/OD₀) after blank subtraction; OD₀ = mean of the first 3 valid readings. Non-positive values dropped. */
export function toLn(time: number[], od: number[], blank: number): { t: number[]; y: number[]; od0: number } {
  const pts = time.map((t, i) => [t, od[i] - blank] as [number, number]).filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v) && v > 0)
  const first = pts.slice(0, 3).map((p) => p[1])
  const od0 = first.reduce((a, b) => a + b, 0) / (first.length || 1)
  return { t: pts.map((p) => p[0]), y: pts.map((p) => Math.log(p[1] / od0)), od0 }
}

/** Deterministic sample plate: 6 wells with different rates and lags (OD600, hours). */
export function samplePlate(): string {
  let s = 3
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296)
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd())
  const wells = [
    { name: 'WT_37C', mu: 0.9, lam: 1.5, A: 4.2 },
    { name: 'WT_30C', mu: 0.6, lam: 2.5, A: 4.0 },
    { name: 'mutA_37C', mu: 0.55, lam: 3.5, A: 3.6 },
    { name: 'mutB_37C', mu: 0.8, lam: 5.0, A: 3.9 },
    { name: 'WT_+drug', mu: 0.35, lam: 4.0, A: 2.8 },
    { name: 'blank_ctrl', mu: 0.02, lam: 0, A: 0.05 },
  ]
  const head = ['time_h', ...wells.map((w) => w.name)].join(',')
  const rows: string[] = []
  for (let k = 0; k <= 48; k++) {
    const t = k * 0.5
    rows.push([t, ...wells.map((w) => {
      const y = model('gompertz', t, [0, w.A, w.mu, w.lam])
      const od = 0.05 + 0.02 * Math.exp(Number.isFinite(y) ? y : 0) * (1 + 0.02 * gauss()) + 0.002 * gauss()
      return Math.max(0.001, od).toFixed(4)
    })].join(','))
  }
  return [head, ...rows].join('\n')
}
