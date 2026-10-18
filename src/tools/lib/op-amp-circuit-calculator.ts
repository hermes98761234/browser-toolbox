// Op-amp topologies: ideal gains, single-pole op-amp frequency response, E-series resistor pair search.
import { eSeries, type Series } from './resistor-color-decoder'

export type Topo = 'inverting' | 'noninverting' | 'follower' | 'difference' | 'summing' | 'integrator' | 'differentiator'

export interface Circuit {
  topo: Topo
  r1: number // input resistor (Ω)
  r2: number // feedback resistor (Ω) — summing: second input resistor uses r3
  r3: number // difference: + input series; summing: input 2
  r4: number // difference: + input to ground
  c: number // capacitor (F)
  rpar: boolean // integrator: Rf in parallel with C to limit DC gain
}

export interface OpAmp { name: string; gbw: number; a0: number; sr: number; headroom: number }

export const OPAMPS: OpAmp[] = [
  { name: 'Generic (1 MHz)', gbw: 1e6, a0: 1e5, sr: 0.5, headroom: 1.5 },
  { name: 'LM358', gbw: 0.7e6, a0: 1e5, sr: 0.3, headroom: 1.5 },
  { name: 'TL072', gbw: 3e6, a0: 2e5, sr: 13, headroom: 1.5 },
  { name: 'NE5532', gbw: 10e6, a0: 1e5, sr: 9, headroom: 1.5 },
  { name: 'OPA2134', gbw: 8e6, a0: 1e6, sr: 20, headroom: 1 },
  { name: 'MCP6002 (RRIO)', gbw: 1e6, a0: 1.3e5, sr: 0.6, headroom: 0.05 },
  { name: 'OPA1612', gbw: 40e6, a0: 1e6, sr: 27, headroom: 0.6 },
]

export interface Cx { re: number; im: number }
const cx = (re: number, im = 0): Cx => ({ re, im })
const add = (a: Cx, b: Cx): Cx => cx(a.re + b.re, a.im + b.im)
const mul = (a: Cx, b: Cx): Cx => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re)
const div = (a: Cx, b: Cx): Cx => {
  const d = b.re * b.re + b.im * b.im
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d)
}
const par = (a: Cx, b: Cx): Cx => div(mul(a, b), add(a, b))
export const mag = (a: Cx) => Math.hypot(a.re, a.im)
export const phaseDeg = (a: Cx) => (Math.atan2(a.im, a.re) * 180) / Math.PI

/** Open-loop gain of a single-pole op-amp: A0 / (1 + j f / fp), fp = GBW / A0. */
export function openLoop(op: OpAmp, f: number): Cx {
  return div(cx(op.a0), cx(1, f / (op.gbw / op.a0)))
}

/** Input/feedback impedances (first input for summing). */
function zs(c: Circuit, f: number): { zin: Cx; zf: Cx } {
  const zc = cx(0, -1 / (2 * Math.PI * f * c.c))
  if (c.topo === 'integrator') return { zin: cx(c.r1), zf: c.rpar ? par(zc, cx(c.r2)) : zc }
  if (c.topo === 'differentiator') return { zin: zc, zf: cx(c.r2) }
  return { zin: cx(c.r1), zf: cx(c.r2) }
}

/**
 * Closed-loop transfer V_out / V_in (input 1) with a finite single-pole op-amp.
 * Loop gain T = A·β; ideal gain × T/(1+T).
 */
export function transfer(c: Circuit, op: OpAmp, f: number): Cx {
  const A = openLoop(op, f)
  if (c.topo === 'follower') return div(A, add(cx(1), A))
  const { zin, zf } = zs(c, f)
  // Feedback divider seen from the output: all input resistors in parallel to ground.
  const zg = c.topo === 'summing' ? par(zin, cx(c.r3)) : zin
  const beta = div(zg, add(zg, zf))
  const T = mul(A, beta)
  const k = div(T, add(cx(1), T))
  if (c.topo === 'noninverting') return mul(add(cx(1), div(zf, zin)), k)
  if (c.topo === 'difference') {
    // V2 path: R4/(R3+R4) · (1+R2/R1); here we report the differential gain (V2 − V1).
    return mul(div(zf, zin), k)
  }
  return mul(cx(-1), mul(div(zf, zin), k))
}

/** Ideal DC (or mid-band) gain expressions. */
export function idealGain(c: Circuit): number {
  switch (c.topo) {
    case 'inverting': return -c.r2 / c.r1
    case 'noninverting': return 1 + c.r2 / c.r1
    case 'follower': return 1
    case 'difference': return c.r2 / c.r1
    case 'summing': return -c.r2 / c.r1
    case 'integrator': return c.rpar ? -c.r2 / c.r1 : -Infinity
    case 'differentiator': return 0
  }
}

/** Noise gain 1/β at mid-band (resistive topologies). */
export function noiseGain(c: Circuit): number {
  if (c.topo === 'follower') return 1
  if (c.topo === 'summing') return 1 + c.r2 / ((c.r1 * c.r3) / (c.r1 + c.r3))
  return 1 + c.r2 / c.r1
}

/** −3 dB closed-loop bandwidth ≈ GBW / noise gain. */
export const closedLoopBw = (c: Circuit, op: OpAmp) => op.gbw / noiseGain(c)
/** Full-power bandwidth for a sine of peak Vp: SR / (2π Vp). */
export const fullPowerBw = (srVperUs: number, vPeak: number) => (srVperUs * 1e6) / (2 * Math.PI * vPeak)
/** Corner/unity frequency of RC integrator or differentiator: 1/(2πRC). */
export const rcFreq = (r: number, c: number) => 1 / (2 * Math.PI * r * c)

/** Difference amplifier common-mode rejection from resistor mismatch: CMRR = (1+G)/|ε| with ε the ratio mismatch. */
export function diffCmrrDb(c: Circuit): number {
  const g1 = c.r2 / c.r1, g2 = c.r4 / c.r3
  const cmGain = Math.abs((c.r4 / (c.r3 + c.r4)) * (1 + g1) - g1)
  return cmGain < 1e-12 ? Infinity : 20 * Math.log10(((g1 + g2) / 2) / cmGain)
}

export interface Pair { rin: number; rf: number; ratio: number; errPct: number }

function valuesIn(series: Series, lo: number, hi: number): number[] {
  const m = eSeries(series)
  const out: number[] = []
  for (let d = Math.floor(Math.log10(lo)) - 1; d <= Math.ceil(Math.log10(hi)); d++)
    for (const v of m) {
      const x = Number((v * 10 ** d).toPrecision(4))
      if (x >= lo * 0.999 && x <= hi * 1.001) out.push(x)
    }
  return out
}

/**
 * Best (Rin, Rf) pairs from an E-series so that Rf/Rin ≈ ratio, both in [lo, hi].
 * Sorted by ratio error, ties broken by closeness of Rin to `pref`.
 */
export function bestPairs(ratio: number, series: Series, lo = 1e3, hi = 1e6, pref = 10e3, count = 6): Pair[] {
  if (!(ratio > 0)) return []
  const vals = valuesIn(series, lo, hi)
  const pairs: Pair[] = []
  for (const rin of vals) {
    const want = ratio * rin
    if (want < lo * 0.9 || want > hi * 1.1) continue
    let best = vals[0]
    for (const v of vals) if (Math.abs(Math.log(v / want)) < Math.abs(Math.log(best / want))) best = v
    pairs.push({ rin, rf: best, ratio: best / rin, errPct: (best / rin / ratio - 1) * 100 })
  }
  pairs.sort((a, b) => Math.abs(a.errPct) - Math.abs(b.errPct) || Math.abs(Math.log(a.rin / pref)) - Math.abs(Math.log(b.rin / pref)))
  // Keep at most three Rin choices per achieved ratio so different ratios also show up.
  const seen = new Map<string, number>()
  return pairs.filter((p) => {
    const k = p.ratio.toPrecision(6)
    seen.set(k, (seen.get(k) ?? 0) + 1)
    return seen.get(k)! <= 3
  }).slice(0, count)
}

/** Nearest E-series capacitor/resistor value (any decade). */
export function nearestValue(x: number, series: Series): number {
  const vals = valuesIn(series, x / 10, x * 10)
  return vals.reduce((b, v) => (Math.abs(Math.log(v / x)) < Math.abs(Math.log(b / x)) ? v : b), vals[0])
}

/** Engineering formatting: 4700 → "4.7k", 1e-9 → "1n". */
export function eng(x: number, unit = ''): string {
  if (!Number.isFinite(x)) return '∞'
  if (x === 0) return `0 ${unit}`
  const pre: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']]
  const a = Math.abs(x)
  const [d, p] = pre.find(([v]) => a >= v * 0.9995) ?? pre[pre.length - 1]
  return `${Number((x / d).toPrecision(3))} ${p}${unit}`
}
