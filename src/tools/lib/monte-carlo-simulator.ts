// Monte Carlo engine: distribution samplers, model evaluation, summary statistics, histogram,
// rank-correlation sensitivity and a one-at-a-time tornado (P10 → P90 swing per input).
import { compile } from './graphing-calculator'

export type DistKind = 'const' | 'normal' | 'uniform' | 'triangular' | 'pert' | 'lognormal'
export interface Input {
  name: string
  dist: DistKind
  a: number
  b: number
  c: number
}

export const DIST_PARAMS: Record<DistKind, [string, string?, string?]> = {
  const: ['value'],
  normal: ['mean', 'std dev'],
  uniform: ['min', 'max'],
  triangular: ['min', 'mode', 'max'],
  pert: ['min', 'most likely', 'max'],
  lognormal: ['mean', 'std dev'],
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rng = () => number
const u01 = (r: Rng) => {
  let u = r()
  while (u === 0) u = r()
  return u
}
export const gauss = (r: Rng) => Math.sqrt(-2 * Math.log(u01(r))) * Math.cos(2 * Math.PI * r())

/** Gamma(shape k, scale 1) via Marsaglia–Tsang. */
export function gammaSample(k: number, r: Rng): number {
  if (k < 1) return gammaSample(k + 1, r) * Math.pow(u01(r), 1 / k)
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number, v: number
    do {
      x = gauss(r)
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = u01(r)
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

export function validate(i: Input): string | null {
  const { a, b, c } = i
  switch (i.dist) {
    case 'normal':
    case 'lognormal':
      if (!(b >= 0)) return 'std dev must be ≥ 0'
      if (i.dist === 'lognormal' && !(a > 0)) return 'lognormal mean must be > 0'
      return null
    case 'uniform':
      return a <= b ? null : 'min must be ≤ max'
    case 'triangular':
    case 'pert':
      return a <= b && b <= c && a < c ? null : 'need min ≤ mode ≤ max and min < max'
    default:
      return null
  }
}

export function sampler(i: Input, r: Rng): () => number {
  const { a, b, c } = i
  switch (i.dist) {
    case 'const':
      return () => a
    case 'normal':
      return () => a + b * gauss(r)
    case 'uniform':
      return () => a + (b - a) * r()
    case 'triangular': {
      const f = (b - a) / (c - a)
      return () => {
        const u = r()
        return u < f ? a + Math.sqrt(u * (c - a) * (b - a)) : c - Math.sqrt((1 - u) * (c - a) * (c - b))
      }
    }
    case 'pert': {
      const al = 1 + (4 * (b - a)) / (c - a), be = 1 + (4 * (c - b)) / (c - a)
      return () => {
        const x = gammaSample(al, r), y = gammaSample(be, r)
        return a + ((c - a) * x) / (x + y)
      }
    }
    case 'lognormal': {
      const s2 = Math.log(1 + (b * b) / (a * a))
      const mu = Math.log(a) - s2 / 2, s = Math.sqrt(s2)
      return () => Math.exp(mu + s * gauss(r))
    }
  }
}

export const quantileSorted = (s: ArrayLike<number>, q: number) => {
  if (!s.length) return NaN
  const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p)
  return s[lo] + (s[hi] - s[lo]) * (p - lo)
}

function ranks(x: Float64Array): Float64Array {
  const idx = Array.from(x.keys()).sort((i, j) => x[i] - x[j])
  const r = new Float64Array(x.length)
  idx.forEach((k, i) => (r[k] = i))
  return r
}
function pearson(a: Float64Array, b: Float64Array) {
  const n = a.length
  let ma = 0, mb = 0
  for (let i = 0; i < n; i++) {
    ma += a[i]
    mb += b[i]
  }
  ma /= n
  mb /= n
  let sab = 0, saa = 0, sbb = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb
    sab += da * db
    saa += da * da
    sbb += db * db
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0
}

export interface Summary {
  n: number
  valid: number
  mean: number
  sd: number
  min: number
  max: number
  pct: Record<string, number>
  sorted: Float64Array
  hist: { x0: number; x1: number; count: number }[]
  spearman: { name: string; rho: number }[]
  tornado: { name: string; lo: number; hi: number }[]
  base: number
  pBelow: number
}

export const PCTS = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]

export function run(expr: string, inputs: Input[], n: number, seed: number, threshold: number, bins = 40): Summary {
  const names = inputs.map((i) => i.name)
  const f = compile(expr, names)
  const r = mulberry32(seed)
  const samp = inputs.map((i) => sampler(i, r))
  const X = inputs.map(() => new Float64Array(n))
  const Y = new Float64Array(n)
  const env: Record<string, number> = {}
  let valid = 0
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < inputs.length; j++) {
      const v = samp[j]()
      X[j][k] = v
      env[names[j]] = v
    }
    const y = f(env)
    Y[k] = y
    if (Number.isFinite(y)) valid++
  }
  const keep = Array.from(Y.keys()).filter((k) => Number.isFinite(Y[k]))
  const y = Float64Array.from(keep, (k) => Y[k])
  const sorted = Float64Array.from(y).sort()
  let mean = 0
  for (const v of y) mean += v
  mean /= y.length || 1
  let ss = 0
  for (const v of y) ss += (v - mean) ** 2
  const sd = Math.sqrt(ss / Math.max(1, y.length - 1))
  const pct: Record<string, number> = {}
  for (const q of PCTS) pct[`P${Math.round(q * 100)}`] = quantileSorted(sorted, q)
  const lo = quantileSorted(sorted, 0.001), hi = quantileSorted(sorted, 0.999)
  const w = (hi - lo) / bins || 1
  const hist = Array.from({ length: bins }, (_, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, count: 0 }))
  for (const v of y) {
    const b = Math.floor((v - lo) / w)
    if (b >= 0 && b < bins) hist[b].count++
    else if (v === hi) hist[bins - 1].count++
  }
  const ry = ranks(y)
  const spearman = inputs
    .map((inp, j) => ({ name: inp.name, rho: inp.dist === 'const' ? 0 : pearson(ranks(Float64Array.from(keep, (k) => X[j][k])), ry) }))
    .sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho))
  // one-at-a-time: each input at its own sampled P10 / P90, others at their medians
  const med = X.map((xs) => quantileSorted(Float64Array.from(xs).sort(), 0.5))
  const at = (j: number, v: number) => {
    const e: Record<string, number> = {}
    names.forEach((nm, i) => (e[nm] = i === j ? v : med[i]))
    return f(e)
  }
  const base = at(-1, 0)
  const tornado = inputs
    .map((inp, j) => {
      const s = Float64Array.from(X[j]).sort()
      return { name: inp.name, lo: at(j, quantileSorted(s, 0.1)), hi: at(j, quantileSorted(s, 0.9)) }
    })
    .sort((a, b) => Math.abs(b.hi - b.lo) - Math.abs(a.hi - a.lo))
  let below = 0
  for (const v of y) if (v < threshold) below++
  return {
    n, valid, mean, sd, min: sorted[0], max: sorted[sorted.length - 1], pct, sorted, hist, spearman, tornado, base,
    pBelow: below / (y.length || 1),
  }
}
