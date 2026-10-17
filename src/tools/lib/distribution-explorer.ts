// Probability distributions: special functions (log-gamma, incomplete gamma/beta), PDF/PMF, CDF,
// quantiles and moments for common continuous and discrete families.

const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]

export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x)
  x -= 1
  let a = 0.99999999999980993
  const t = x + 7.5
  for (let i = 0; i < 8; i++) a += LANCZOS[i] / (x + i + 1)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}
export const lbeta = (a: number, b: number) => lgamma(a) + lgamma(b) - lgamma(a + b)
const lchoose = (n: number, k: number) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1)

/** Regularized lower incomplete gamma P(a, x). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0
  if (!Number.isFinite(x)) return 1
  const lg = lgamma(a)
  if (x < a + 1) {
    let sum = 1 / a, del = sum, ap = a
    for (let n = 0; n < 1000; n++) {
      ap++
      del *= x / ap
      sum += del
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break
    }
    return Math.min(1, sum * Math.exp(-x + a * Math.log(x) - lg))
  }
  // continued fraction for Q (Lentz)
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < 1e-300) d = 1e-300
    c = b + an / c
    if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-15) break
  }
  return Math.max(0, 1 - Math.exp(-x + a * Math.log(x) - lg) * h)
}

function betacf(a: number, b: number, x: number) {
  const qab = a + b, qap = a + 1, qam = a - 1
  let c = 1, d = 1 - (qab * x) / qap
  if (Math.abs(d) < 1e-300) d = 1e-300
  d = 1 / d
  let h = d
  for (let m = 1; m <= 1000; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < 1e-300) d = 1e-300
    c = 1 + aa / c
    if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < 1e-300) d = 1e-300
    c = 1 + aa / c
    if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-15) break
  }
  return h
}

/** Regularized incomplete beta I_x(a, b). */
export function betaI(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta(a, b))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}

export const erf = (x: number) => (x >= 0 ? gammaP(0.5, x * x) : -gammaP(0.5, x * x))

export interface Param { key: string; label: string; min: number; max: number; step: number; def: number; int?: boolean }
export interface Dist {
  id: string
  name: string
  discrete: boolean
  params: Param[]
  pdf: (x: number, p: number[]) => number
  cdf: (x: number, p: number[]) => number
  mean: (p: number[]) => number
  variance: (p: number[]) => number
  /** hard support bounds */
  support: (p: number[]) => [number, number]
  formula: string
  note: string
}

const PI = Math.PI
const dists: Dist[] = [
  {
    id: 'normal', name: 'Normal', discrete: false, formula: 'f(x) = e^(−(x−μ)²/2σ²) / (σ√2π)', note: 'Sums of many small effects; heights, measurement error.',
    params: [{ key: 'mu', label: 'Mean μ', min: -10, max: 10, step: 0.1, def: 0 }, { key: 'sigma', label: 'Std dev σ', min: 0.05, max: 10, step: 0.05, def: 1 }],
    pdf: (x, [m, s]) => Math.exp(-((x - m) ** 2) / (2 * s * s)) / (s * Math.sqrt(2 * PI)),
    cdf: (x, [m, s]) => 0.5 * (1 + erf((x - m) / (s * Math.SQRT2))),
    mean: ([m]) => m, variance: ([, s]) => s * s, support: () => [-Infinity, Infinity],
  },
  {
    id: 't', name: 'Student t', discrete: false, formula: 'f(t) ∝ (1 + t²/ν)^(−(ν+1)/2)', note: 'Means of small samples with unknown variance; t-tests.',
    params: [{ key: 'nu', label: 'Degrees of freedom ν', min: 0.5, max: 100, step: 0.5, def: 5 }],
    pdf: (x, [v]) => Math.exp(lgamma((v + 1) / 2) - lgamma(v / 2) - 0.5 * Math.log(v * PI) - ((v + 1) / 2) * Math.log(1 + (x * x) / v)),
    cdf: (x, [v]) => {
      const ib = betaI(v / (v + x * x), v / 2, 0.5)
      return x >= 0 ? 1 - ib / 2 : ib / 2
    },
    mean: ([v]) => (v > 1 ? 0 : NaN), variance: ([v]) => (v > 2 ? v / (v - 2) : v > 1 ? Infinity : NaN), support: () => [-Infinity, Infinity],
  },
  {
    id: 'chi2', name: 'Chi-square', discrete: false, formula: 'f(x) = x^(k/2−1) e^(−x/2) / (2^(k/2) Γ(k/2))', note: 'Sum of k squared standard normals; goodness-of-fit and variance tests.',
    params: [{ key: 'k', label: 'Degrees of freedom k', min: 0.5, max: 100, step: 0.5, def: 4 }],
    pdf: (x, [k]) => (x <= 0 ? (x === 0 && k === 2 ? 0.5 : 0) : Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.log(2) - lgamma(k / 2))),
    cdf: (x, [k]) => gammaP(k / 2, Math.max(0, x) / 2),
    mean: ([k]) => k, variance: ([k]) => 2 * k, support: () => [0, Infinity],
  },
  {
    id: 'f', name: 'F (Fisher–Snedecor)', discrete: false, formula: 'ratio of two scaled chi-squares', note: 'ANOVA and comparing two variances.',
    params: [{ key: 'd1', label: 'Numerator df d₁', min: 1, max: 100, step: 1, def: 5 }, { key: 'd2', label: 'Denominator df d₂', min: 1, max: 100, step: 1, def: 20 }],
    pdf: (x, [a, b]) => (x <= 0 ? 0 : Math.exp(0.5 * (a * Math.log(a * x) + b * Math.log(b) - (a + b) * Math.log(a * x + b)) - Math.log(x) - lbeta(a / 2, b / 2))),
    cdf: (x, [a, b]) => (x <= 0 ? 0 : betaI((a * x) / (a * x + b), a / 2, b / 2)),
    mean: ([, b]) => (b > 2 ? b / (b - 2) : NaN), variance: ([a, b]) => (b > 4 ? (2 * b * b * (a + b - 2)) / (a * (b - 2) ** 2 * (b - 4)) : NaN), support: () => [0, Infinity],
  },
  {
    id: 'exp', name: 'Exponential', discrete: false, formula: 'f(x) = λ e^(−λx)', note: 'Waiting time between Poisson events; memoryless.',
    params: [{ key: 'lambda', label: 'Rate λ', min: 0.05, max: 10, step: 0.05, def: 1 }],
    pdf: (x, [l]) => (x < 0 ? 0 : l * Math.exp(-l * x)), cdf: (x, [l]) => (x < 0 ? 0 : 1 - Math.exp(-l * x)),
    mean: ([l]) => 1 / l, variance: ([l]) => 1 / (l * l), support: () => [0, Infinity],
  },
  {
    id: 'gamma', name: 'Gamma', discrete: false, formula: 'f(x) = x^(k−1) e^(−x/θ) / (Γ(k) θ^k)', note: 'Time until the k-th event; insurance claims, rainfall.',
    params: [{ key: 'k', label: 'Shape k', min: 0.1, max: 30, step: 0.1, def: 2 }, { key: 'theta', label: 'Scale θ', min: 0.1, max: 10, step: 0.1, def: 2 }],
    pdf: (x, [k, t]) => (x <= 0 ? 0 : Math.exp((k - 1) * Math.log(x) - x / t - lgamma(k) - k * Math.log(t))), cdf: (x, [k, t]) => gammaP(k, Math.max(0, x) / t),
    mean: ([k, t]) => k * t, variance: ([k, t]) => k * t * t, support: () => [0, Infinity],
  },
  {
    id: 'beta', name: 'Beta', discrete: false, formula: 'f(x) = x^(α−1)(1−x)^(β−1) / B(α,β)', note: 'Proportions and probabilities; Bayesian prior for a rate.',
    params: [{ key: 'a', label: 'α', min: 0.1, max: 30, step: 0.1, def: 2 }, { key: 'b', label: 'β', min: 0.1, max: 30, step: 0.1, def: 5 }],
    pdf: (x, [a, b]) => (x <= 0 || x >= 1 ? 0 : Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - lbeta(a, b))), cdf: (x, [a, b]) => betaI(x, a, b),
    mean: ([a, b]) => a / (a + b), variance: ([a, b]) => (a * b) / ((a + b) ** 2 * (a + b + 1)), support: () => [0, 1],
  },
  {
    id: 'lognormal', name: 'Log-normal', discrete: false, formula: 'ln X ~ Normal(μ, σ)', note: 'Products of many factors; incomes, particle sizes, stock prices.',
    params: [{ key: 'mu', label: 'μ (of ln X)', min: -3, max: 3, step: 0.05, def: 0 }, { key: 'sigma', label: 'σ (of ln X)', min: 0.05, max: 3, step: 0.05, def: 0.5 }],
    pdf: (x, [m, s]) => (x <= 0 ? 0 : Math.exp(-((Math.log(x) - m) ** 2) / (2 * s * s)) / (x * s * Math.sqrt(2 * PI))), cdf: (x, [m, s]) => (x <= 0 ? 0 : 0.5 * (1 + erf((Math.log(x) - m) / (s * Math.SQRT2)))),
    mean: ([m, s]) => Math.exp(m + (s * s) / 2), variance: ([m, s]) => (Math.exp(s * s) - 1) * Math.exp(2 * m + s * s), support: () => [0, Infinity],
  },
  {
    id: 'uniform', name: 'Uniform', discrete: false, formula: 'f(x) = 1/(b−a) on [a, b]', note: 'Every value in the range is equally likely.',
    params: [{ key: 'a', label: 'Lower a', min: -10, max: 10, step: 0.5, def: 0 }, { key: 'b', label: 'Upper b', min: -10, max: 20, step: 0.5, def: 1 }],
    pdf: (x, [a, b]) => (x >= a && x <= b && b > a ? 1 / (b - a) : 0), cdf: (x, [a, b]) => (x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a)),
    mean: ([a, b]) => (a + b) / 2, variance: ([a, b]) => (b - a) ** 2 / 12, support: ([a, b]) => [a, b],
  },
  {
    id: 'weibull', name: 'Weibull', discrete: false, formula: 'f(x) = (k/λ)(x/λ)^(k−1) e^(−(x/λ)^k)', note: 'Time to failure; wind speeds. k<1 infant mortality, k>1 wear-out.',
    params: [{ key: 'k', label: 'Shape k', min: 0.2, max: 10, step: 0.1, def: 1.5 }, { key: 'lambda', label: 'Scale λ', min: 0.1, max: 10, step: 0.1, def: 1 }],
    pdf: (x, [k, l]) => (x < 0 ? 0 : (k / l) * (x / l) ** (k - 1) * Math.exp(-((x / l) ** k))), cdf: (x, [k, l]) => (x <= 0 ? 0 : 1 - Math.exp(-((x / l) ** k))),
    mean: ([k, l]) => l * Math.exp(lgamma(1 + 1 / k)), variance: ([k, l]) => l * l * (Math.exp(lgamma(1 + 2 / k)) - Math.exp(2 * lgamma(1 + 1 / k))), support: () => [0, Infinity],
  },
  {
    id: 'cauchy', name: 'Cauchy', discrete: false, formula: 'f(x) = 1 / (πγ[1 + ((x−x₀)/γ)²])', note: 'Heavy tails: mean and variance do not exist.',
    params: [{ key: 'x0', label: 'Location x₀', min: -10, max: 10, step: 0.1, def: 0 }, { key: 'gamma', label: 'Scale γ', min: 0.05, max: 10, step: 0.05, def: 1 }],
    pdf: (x, [x0, g]) => 1 / (PI * g * (1 + ((x - x0) / g) ** 2)), cdf: (x, [x0, g]) => 0.5 + Math.atan((x - x0) / g) / PI,
    mean: () => NaN, variance: () => NaN, support: () => [-Infinity, Infinity],
  },
  {
    id: 'binomial', name: 'Binomial', discrete: true, formula: 'P(k) = C(n,k) p^k (1−p)^(n−k)', note: 'Number of successes in n independent yes/no trials.',
    params: [{ key: 'n', label: 'Trials n', min: 1, max: 200, step: 1, def: 20, int: true }, { key: 'p', label: 'Success prob. p', min: 0, max: 1, step: 0.01, def: 0.3 }],
    pdf: (k, [n, p]) => (k < 0 || k > n || k !== Math.floor(k) ? 0 : p === 0 ? (k === 0 ? 1 : 0) : p === 1 ? (k === n ? 1 : 0) : Math.exp(lchoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p))),
    cdf: (x, [n, p]) => (x < 0 ? 0 : x >= n ? 1 : p === 0 ? 1 : p === 1 ? 0 : betaI(1 - p, n - Math.floor(x), Math.floor(x) + 1)),
    mean: ([n, p]) => n * p, variance: ([n, p]) => n * p * (1 - p), support: ([n]) => [0, n],
  },
  {
    id: 'poisson', name: 'Poisson', discrete: true, formula: 'P(k) = λ^k e^(−λ) / k!', note: 'Counts of rare events in a fixed interval: calls per hour, defects per sheet.',
    params: [{ key: 'lambda', label: 'Rate λ', min: 0.1, max: 100, step: 0.1, def: 4 }],
    pdf: (k, [l]) => (k < 0 || k !== Math.floor(k) ? 0 : Math.exp(k * Math.log(l) - l - lgamma(k + 1))),
    cdf: (x, [l]) => (x < 0 ? 0 : 1 - gammaP(Math.floor(x) + 1, l)),
    mean: ([l]) => l, variance: ([l]) => l, support: () => [0, Infinity],
  },
  {
    id: 'geometric', name: 'Geometric', discrete: true, formula: 'P(k) = (1−p)^(k−1) p, k = 1, 2, …', note: 'Number of trials until the first success.',
    params: [{ key: 'p', label: 'Success prob. p', min: 0.01, max: 1, step: 0.01, def: 0.25 }],
    pdf: (k, [p]) => (k < 1 || k !== Math.floor(k) ? 0 : (1 - p) ** (k - 1) * p), cdf: (x, [p]) => (x < 1 ? 0 : 1 - (1 - p) ** Math.floor(x)),
    mean: ([p]) => 1 / p, variance: ([p]) => (1 - p) / (p * p), support: () => [1, Infinity],
  },
  {
    id: 'negbin', name: 'Negative binomial', discrete: true, formula: 'P(k) = C(k+r−1,k) p^r (1−p)^k', note: 'Failures before the r-th success; over-dispersed counts.',
    params: [{ key: 'r', label: 'Successes r', min: 1, max: 50, step: 1, def: 3, int: true }, { key: 'p', label: 'Success prob. p', min: 0.01, max: 1, step: 0.01, def: 0.4 }],
    pdf: (k, [r, p]) => (k < 0 || k !== Math.floor(k) ? 0 : Math.exp(lchoose(k + r - 1, k) + r * Math.log(p) + k * Math.log1p(-p))),
    cdf: (x, [r, p]) => (x < 0 ? 0 : betaI(p, r, Math.floor(x) + 1)),
    mean: ([r, p]) => (r * (1 - p)) / p, variance: ([r, p]) => (r * (1 - p)) / (p * p), support: () => [0, Infinity],
  },
  {
    id: 'hyper', name: 'Hypergeometric', discrete: true, formula: 'P(k) = C(K,k) C(N−K,n−k) / C(N,n)', note: 'Successes in n draws without replacement (card hands, lot sampling).',
    params: [{ key: 'N', label: 'Population N', min: 1, max: 500, step: 1, def: 52, int: true }, { key: 'K', label: 'Successes in population K', min: 0, max: 500, step: 1, def: 13, int: true }, { key: 'n', label: 'Draws n', min: 0, max: 500, step: 1, def: 5, int: true }],
    pdf: (k, [N, K, n]) => {
      if (k !== Math.floor(k) || k < Math.max(0, n + K - N) || k > Math.min(n, K)) return 0
      return Math.exp(lchoose(K, k) + lchoose(N - K, n - k) - lchoose(N, n))
    },
    cdf: (x, p) => {
      let s = 0
      for (let k = 0; k <= Math.floor(x); k++) s += dists.find((d) => d.id === 'hyper')!.pdf(k, p)
      return Math.min(1, s)
    },
    mean: ([N, K, n]) => (n * K) / N, variance: ([N, K, n]) => (n * K * (N - K) * (N - n)) / (N * N * (N - 1 || 1)), support: ([N, K, n]) => [Math.max(0, n + K - N), Math.min(n, K)],
  },
]
export const DISTS = dists

/** Smallest x with CDF(x) ≥ p (integer for discrete), by bracketing + bisection. */
export function quantile(d: Dist, p: number[], q: number): number {
  const [lo0, hi0] = d.support(p)
  if (q <= 0) return lo0
  if (q >= 1) return hi0
  let lo = Number.isFinite(lo0) ? lo0 : -1, hi = Number.isFinite(hi0) ? hi0 : 1
  const m = d.mean(p)
  if (Number.isFinite(m) && !Number.isFinite(lo0)) lo = Math.min(lo, m - 1)
  if (Number.isFinite(m) && !Number.isFinite(hi0)) hi = Math.max(hi, m + 1)
  for (let i = 0; i < 200 && d.cdf(lo, p) > q; i++) lo = lo - Math.max(1, Math.abs(lo))
  for (let i = 0; i < 200 && d.cdf(hi, p) < q; i++) hi = hi + Math.max(1, Math.abs(hi))
  if (d.discrete) {
    lo = Math.floor(lo)
    hi = Math.ceil(hi)
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2)
      if (d.cdf(mid, p) >= q) hi = mid
      else lo = mid
    }
    return d.cdf(lo, p) >= q ? lo : hi
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (d.cdf(mid, p) < q) lo = mid
    else hi = mid
    if (hi - lo < 1e-12 * Math.max(1, Math.abs(mid))) break
  }
  return (lo + hi) / 2
}

/** Plot range: central 99.9% (clipped to support), widened slightly. */
export function plotRange(d: Dist, p: number[]): [number, number] {
  const [s0, s1] = d.support(p)
  let a = quantile(d, p, d.id === 'cauchy' ? 0.02 : 0.0005), b = quantile(d, p, d.id === 'cauchy' ? 0.98 : 0.9995)
  if (d.discrete) return [Math.max(s0, Math.floor(a) - 1), Math.min(s1, Math.ceil(b) + 1)]
  const pad = (b - a) * 0.05
  a = Math.max(s0, a - pad)
  b = Math.min(s1, b + pad)
  return [a, b]
}

/** P(lo ≤ X ≤ hi) — for discrete distributions both ends inclusive. */
export function between(d: Dist, p: number[], lo: number, hi: number): number {
  if (hi < lo) return 0
  if (d.discrete) return d.cdf(Math.floor(hi), p) - d.cdf(Math.ceil(lo) - 1, p)
  return d.cdf(hi, p) - d.cdf(lo, p)
}
