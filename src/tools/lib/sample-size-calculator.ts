// Sample size & power for means and proportions (normal and t approximations).

/** Standard normal CDF (erfc Chebyshev fit, |err| < 1.2e-7). */
export function normCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.5 * z)
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
  return x >= 0 ? 1 - r / 2 : r / 2
}

/** Inverse standard normal CDF (Acklam, rel. err ~1e-9). */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const pl = 0.02425
  let q: number, r: number
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  q = p - 0.5
  r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

function lgamma(x: number): number {
  const g = [76.18009172947146, -86.5053203294168, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5)
  let ser = 1.000000000190015
  for (const c of g) ser += c / ++y
  return -tmp + Math.log((2.506628274631 * ser) / x)
}

function betacf(a: number, b: number, x: number): number {
  let c = 1, d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < 1e-30) d = 1e-30
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d; h *= d * c
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 3e-14) break
  }
  return h
}

/** Regularized incomplete beta I_x(a, b). */
export function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}

/** Student t CDF. */
export function tCdf(t: number, df: number): number {
  const p = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5)
  return t >= 0 ? 1 - p : p
}

/** Student t quantile (bisection on the CDF, starting from the normal quantile). */
export function tInv(p: number, df: number): number {
  let lo = -1e3, hi = 1e3
  if (df > 1e6) return normInv(p)
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (tCdf(mid, df) < p) lo = mid
    else hi = mid
    if (hi - lo < 1e-10) break
  }
  return (lo + hi) / 2
}

export type Design = 'two-means' | 'one-mean' | 'two-props' | 'one-prop'

export interface Inputs {
  design: Design
  alpha: number
  power: number
  sides: 1 | 2
  ratio: number // n2 / n1 for two-sample designs
  // means
  diff: number // difference to detect (mean units)
  sd: number
  tAdjust: boolean
  // proportions
  p1: number // group 1 / null proportion
  p2: number // group 2 / alternative proportion
}

/** Required n for group 1 (and group 2 = ratio × n1) before rounding / dropout. */
export function sampleSize(i: Inputs): { n1: number; n2: number } {
  const za = normInv(1 - i.alpha / i.sides)
  const zb = normInv(i.power)
  const k = i.design === 'two-means' || i.design === 'two-props' ? i.ratio : 0
  if (i.design === 'two-means' || i.design === 'one-mean') {
    const d = Math.abs(i.diff) / i.sd
    const f = i.design === 'two-means' ? 1 + 1 / k : 1
    let n = (f * (za + zb) ** 2) / (d * d)
    if (i.tAdjust) {
      for (let it = 0; it < 50; it++) {
        const df = i.design === 'two-means' ? Math.max(1, n + k * n - 2) : Math.max(1, n - 1)
        const nn = (f * (tInv(1 - i.alpha / i.sides, df) + tInv(i.power, df)) ** 2) / (d * d)
        if (Math.abs(nn - n) < 1e-6) break
        n = nn
      }
    }
    return { n1: n, n2: k * n }
  }
  if (i.design === 'one-prop') {
    const p0 = i.p1, pa = i.p2
    const n = (za * Math.sqrt(p0 * (1 - p0)) + zb * Math.sqrt(pa * (1 - pa))) ** 2 / (pa - p0) ** 2
    return { n1: n, n2: 0 }
  }
  const { p1, p2 } = i
  const pb = (p1 + k * p2) / (1 + k)
  const n = (za * Math.sqrt((1 + 1 / k) * pb * (1 - pb)) + zb * Math.sqrt(p1 * (1 - p1) + (p2 * (1 - p2)) / k)) ** 2 / (p1 - p2) ** 2
  return { n1: n, n2: k * n }
}

/** Power achieved with n1 subjects in group 1 (normal approximation, both tails counted for 2-sided). */
export function power(i: Inputs, n1: number): number {
  const za = normInv(1 - i.alpha / i.sides)
  const k = i.ratio
  let delta: number, se0: number, se1: number
  if (i.design === 'two-means' || i.design === 'one-mean') {
    delta = Math.abs(i.diff)
    se0 = se1 = i.design === 'two-means' ? i.sd * Math.sqrt(1 / n1 + 1 / (k * n1)) : i.sd / Math.sqrt(n1)
  } else if (i.design === 'one-prop') {
    delta = Math.abs(i.p2 - i.p1)
    se0 = Math.sqrt((i.p1 * (1 - i.p1)) / n1)
    se1 = Math.sqrt((i.p2 * (1 - i.p2)) / n1)
  } else {
    delta = Math.abs(i.p1 - i.p2)
    const pb = (i.p1 + k * i.p2) / (1 + k)
    se0 = Math.sqrt(pb * (1 - pb) * (1 / n1 + 1 / (k * n1)))
    se1 = Math.sqrt((i.p1 * (1 - i.p1)) / n1 + (i.p2 * (1 - i.p2)) / (k * n1))
  }
  const main = normCdf((delta - za * se0) / se1)
  const other = i.sides === 2 ? normCdf((-delta - za * se0) / se1) : 0
  return main + other
}

/** n for estimating a proportion (or mean) within ±margin, with optional finite population correction. */
export function precisionN(conf: number, margin: number, opts: { p?: number; sd?: number; N?: number }): number {
  const z = normInv(1 - (1 - conf) / 2)
  const n0 = opts.sd !== undefined ? (z * opts.sd / margin) ** 2 : (z * z * (opts.p ?? 0.5) * (1 - (opts.p ?? 0.5))) / (margin * margin)
  return opts.N ? n0 / (1 + (n0 - 1) / opts.N) : n0
}
