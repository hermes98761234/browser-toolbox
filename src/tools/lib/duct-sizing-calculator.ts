// Duct sizing by the equal-friction method: Darcy–Weisbach + Colebrook, Huebscher rectangular equivalents.
// All internal values are SI: Q m³/s, D m, Δp Pa, friction rate Pa/m.

export const AIR = { rho: 1.204, mu: 1.81e-5 } // dry air at 20 °C, 101.325 kPa

export const CFM = 0.000471947443 // m³/s
export const INWG = 249.08891 // Pa
export const FT = 0.3048
export const IN = 0.0254
export const FRICTION_IP = INWG / (100 * FT) // Pa/m per (in.wg / 100 ft)

/** Darcy friction factor from Colebrook–White, solved by fixed-point iteration (laminar 64/Re below 2300). */
export function frictionFactor(re: number, relRough: number): number {
  if (re <= 0) return 0
  if (re < 2300) return 64 / re
  // Swamee–Jain starting value
  let f = 0.25 / Math.log10(relRough / 3.7 + 5.74 / re ** 0.9) ** 2
  for (let i = 0; i < 50; i++) {
    const g = -2 * Math.log10(relRough / 3.7 + 2.51 / (re * Math.sqrt(f)))
    const nf = 1 / (g * g)
    if (Math.abs(nf - f) < 1e-12) return nf
    f = nf
  }
  return f
}

export interface Flow {
  v: number
  re: number
  f: number
  /** Pa per metre */
  dpm: number
  /** velocity pressure, Pa */
  pv: number
}

/** Flow conditions of airflow q (m³/s) in a round duct of diameter d (m) with absolute roughness eps (m). */
export function flow(q: number, d: number, eps: number, air = AIR): Flow {
  const area = (Math.PI * d * d) / 4
  const v = q / area
  const re = (air.rho * v * d) / air.mu
  const f = frictionFactor(re, eps / d)
  const pv = (air.rho * v * v) / 2
  return { v, re, f, dpm: (f / d) * pv, pv }
}

/** Diameter (m) giving the target friction rate (Pa/m); bisection on log D. */
export function solveDiameter(q: number, rate: number, eps: number, air = AIR): number {
  if (!(q > 0) || !(rate > 0)) return NaN
  let lo = Math.log(0.005), hi = Math.log(10)
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (flow(q, Math.exp(mid), eps, air).dpm > rate) lo = mid
    else hi = mid
  }
  return Math.exp((lo + hi) / 2)
}

/** Huebscher equivalent diameter of an a × b rectangle (same friction at same airflow). */
export const rectEquivalent = (a: number, b: number) => (1.3 * (a * b) ** 0.625) / (a + b) ** 0.25

/** Width of a rectangle with fixed height h whose equivalent diameter is de. */
export function solveRectWidth(de: number, h: number): number {
  let lo = 1e-4, hi = 100
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (rectEquivalent(mid, h) < de) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Square-ish rectangle for a given aspect ratio r = w/h (≥ 1). */
export function solveRectAspect(de: number, r: number): { w: number; h: number } {
  // De scales linearly with size for a fixed aspect ratio.
  const k = rectEquivalent(r, 1)
  const h = de / k
  return { w: h * r, h }
}

export const ROUND_MM = [63, 80, 100, 125, 150, 160, 200, 250, 300, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000, 1120, 1250, 1400, 1600]
export const ROUND_IN = [3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 40, 42, 48, 54, 60]

/** Smallest standard size ≥ d (or nearest), in metres. */
export function standardSize(d: number, metric: boolean, mode: 'up' | 'nearest' = 'up'): number {
  const list = metric ? ROUND_MM.map((x) => x / 1000) : ROUND_IN.map((x) => x * IN)
  if (mode === 'nearest') return list.reduce((b, x) => (Math.abs(x - d) < Math.abs(b - d) ? x : b), list[0])
  return list.find((x) => x >= d - 1e-9) ?? list[list.length - 1]
}

/** Round a rectangular side up to a step (50 mm or 2 in). */
export const roundUp = (x: number, step: number) => Math.ceil(x / step - 1e-9) * step

export interface Section {
  id: string
  name: string
  /** m³/s */
  q: number
  /** m */
  len: number
  /** sum of fitting loss coefficients */
  k: number
  kind: 'main' | 'branch' | 'runout'
  path: boolean
}

export const VLIMIT = { main: 8, branch: 5, runout: 3.5 } // m/s, typical low-noise commercial/residential limits

export interface SectionResult {
  dCalc: number
  dStd: number
  rect: { w: number; h: number; de: number }
  flow: Flow
  friction: number
  fittings: number
  total: number
  vOk: boolean
}

export function sizeSection(s: Section, o: { rate: number; eps: number; metric: boolean; rectH: number; mode: 'up' | 'nearest' }): SectionResult {
  const dCalc = solveDiameter(s.q, o.rate, o.eps)
  const dStd = standardSize(dCalc, o.metric, o.mode)
  const fl = flow(s.q, dStd, o.eps)
  const step = o.metric ? 0.05 : 2 * IN
  // Tallest allowed height that still leaves the rectangle at least as wide as it is high.
  let h = Math.max(step, Math.min(o.rectH, roundUp(dCalc, step)))
  while (h > step && solveRectWidth(dCalc, h) < h) h -= step
  const w = roundUp(solveRectWidth(dCalc, h), step)
  const friction = fl.dpm * s.len
  const fittings = s.k * fl.pv
  return { dCalc, dStd, rect: { w, h, de: rectEquivalent(w, h) }, flow: fl, friction, fittings, total: friction + fittings, vOk: fl.v <= VLIMIT[s.kind] }
}
