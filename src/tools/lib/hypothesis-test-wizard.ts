// Statistical distributions (incomplete beta/gamma) and common hypothesis tests.

// ---------- special functions ----------
const LG = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x)
  x -= 1
  let a = 0.99999999999980993
  const t = x + 7.5
  for (let i = 0; i < 8; i++) a += LG[i] / (x + i + 1)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

function betacf(a: number, b: number, x: number): number {
  const EPS = 1e-14, FPMIN = 1e-300
  let c = 1, d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
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

/** Regularized lower incomplete gamma P(a, x). */
export function gammainc(a: number, x: number): number {
  if (x <= 0) return 0
  if (x < a + 1) {
    let sum = 1 / a, del = sum, ap = a
    for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a))
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-15) break
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h
}

export const normCdf = (z: number) => 0.5 * (1 + Math.sign(z) * gammainc(0.5, (z * z) / 2))
export const tCdf = (t: number, df: number) => {
  const p = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5)
  return t > 0 ? 1 - p : p
}
export const chi2Cdf = (x: number, k: number) => (x <= 0 ? 0 : gammainc(k / 2, x / 2))
export const fCdf = (x: number, d1: number, d2: number) => (x <= 0 ? 0 : ibeta((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2))

export const normPdf = (z: number) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI)
export const tPdf = (t: number, v: number) => Math.exp(lgamma((v + 1) / 2) - lgamma(v / 2) - 0.5 * Math.log(v * Math.PI) - ((v + 1) / 2) * Math.log(1 + (t * t) / v))
export const chi2Pdf = (x: number, k: number) => (x <= 0 ? 0 : Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.log(2) - lgamma(k / 2)))
export const fPdf = (x: number, a: number, b: number) =>
  x <= 0 ? 0 : Math.exp(0.5 * (a * Math.log(a * x) + b * Math.log(b) - (a + b) * Math.log(a * x + b)) - Math.log(x) - (lgamma(a / 2) + lgamma(b / 2) - lgamma((a + b) / 2)))

/** Inverse of a monotone CDF by bisection on [lo, hi]. */
export function invert(cdf: (x: number) => number, p: number, lo: number, hi: number): number {
  while (cdf(hi) < p) hi *= 2
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (cdf(mid) < p) lo = mid
    else hi = mid
    if (hi - lo < 1e-10) break
  }
  return (lo + hi) / 2
}

// ---------- descriptive ----------
export const parseNums = (s: string) => s.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => x !== '').map(Number).filter(Number.isFinite)
export const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
export function variance(a: number[]): number {
  const m = mean(a)
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)
}
export const sd = (a: number[]) => Math.sqrt(variance(a))

// ---------- tests ----------
export type Alt = 'two' | 'less' | 'greater'
export type Dist = { kind: 'z' } | { kind: 't'; df: number } | { kind: 'chi2'; df: number } | { kind: 'F'; df1: number; df2: number }

export interface TestResult {
  test: string
  statName: string
  stat: number
  df?: string
  p: number
  dist: Dist
  alt: Alt
  effect?: [string, number, string]
  ci?: [number, number, string]
  table: [string, string][]
  error?: string
}

function pFrom(stat: number, d: Dist, alt: Alt): number {
  const cdf = cdfOf(d)
  if (d.kind === 'chi2' || d.kind === 'F') return 1 - cdf(stat)
  if (alt === 'less') return cdf(stat)
  if (alt === 'greater') return 1 - cdf(stat)
  return Math.min(1, 2 * Math.min(cdf(stat), 1 - cdf(stat)))
}

export function cdfOf(d: Dist): (x: number) => number {
  if (d.kind === 'z') return normCdf
  if (d.kind === 't') return (x) => tCdf(x, d.df)
  if (d.kind === 'chi2') return (x) => chi2Cdf(x, d.df)
  return (x) => fCdf(x, d.df1, d.df2)
}
export function pdfOf(d: Dist): (x: number) => number {
  if (d.kind === 'z') return normPdf
  if (d.kind === 't') return (x) => tPdf(x, d.df)
  if (d.kind === 'chi2') return (x) => chi2Pdf(x, d.df)
  return (x) => fPdf(x, d.df1, d.df2)
}

/** Critical value(s) for alpha. Two-sided symmetric tests return the positive bound. */
export function critical(d: Dist, alpha: number, alt: Alt): number {
  const cdf = cdfOf(d)
  if (d.kind === 'chi2' || d.kind === 'F') return invert(cdf, 1 - alpha, 0, 10)
  const q = alt === 'two' ? 1 - alpha / 2 : 1 - alpha
  const c = invert(cdf, q, -50, 50)
  return alt === 'less' ? -c : c
}

const tq = (df: number, q: number) => invert((x) => tCdf(x, df), q, -100, 100)
const f = (x: number, d = 4) => (Number.isFinite(x) ? Number(x.toPrecision(d)).toString() : '—')

export function oneSampleT(a: number[], mu0: number, alt: Alt, alpha = 0.05): TestResult {
  const n = a.length
  if (n < 2) return bad('One-sample t-test', 'Need at least 2 values')
  const m = mean(a), s = sd(a), se = s / Math.sqrt(n), t = (m - mu0) / se, df = n - 1
  const d: Dist = { kind: 't', df }
  const h = tq(df, 1 - alpha / 2) * se
  return {
    test: 'One-sample t-test', statName: 't', stat: t, df: String(df), p: pFrom(t, d, alt), dist: d, alt,
    effect: ["Cohen's d", (m - mu0) / s, size(Math.abs((m - mu0) / s), [0.2, 0.5, 0.8])],
    ci: [m - h, m + h, `${f((1 - alpha) * 100, 3)}% CI for the mean`],
    table: [['n', String(n)], ['Mean', f(m)], ['SD', f(s)], ['Std. error', f(se)], ['Hypothesised mean', f(mu0)]],
  }
}

export function twoSampleT(a: number[], b: number[], alt: Alt, equalVar: boolean, alpha = 0.05): TestResult {
  const n1 = a.length, n2 = b.length
  if (n1 < 2 || n2 < 2) return bad('Two-sample t-test', 'Each group needs at least 2 values')
  const m1 = mean(a), m2 = mean(b), v1 = variance(a), v2 = variance(b)
  let se: number, df: number
  const sp = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2))
  if (equalVar) {
    se = sp * Math.sqrt(1 / n1 + 1 / n2)
    df = n1 + n2 - 2
  } else {
    se = Math.sqrt(v1 / n1 + v2 / n2)
    df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1))
  }
  const t = (m1 - m2) / se
  const d: Dist = { kind: 't', df }
  const h = tq(df, 1 - alpha / 2) * se
  const cd = (m1 - m2) / sp
  return {
    test: equalVar ? "Student's two-sample t-test" : "Welch's two-sample t-test", statName: 't', stat: t, df: f(df, 4), p: pFrom(t, d, alt), dist: d, alt,
    effect: ["Cohen's d", cd, size(Math.abs(cd), [0.2, 0.5, 0.8])],
    ci: [m1 - m2 - h, m1 - m2 + h, `${f((1 - alpha) * 100, 3)}% CI for mean₁ − mean₂`],
    table: [['n₁ / n₂', `${n1} / ${n2}`], ['Mean₁ / Mean₂', `${f(m1)} / ${f(m2)}`], ['SD₁ / SD₂', `${f(Math.sqrt(v1))} / ${f(Math.sqrt(v2))}`], ['Difference', f(m1 - m2)], ['Std. error', f(se)]],
  }
}

export function pairedT(a: number[], b: number[], alt: Alt, alpha = 0.05): TestResult {
  if (a.length !== b.length) return bad('Paired t-test', `Both columns need the same number of values (${a.length} vs ${b.length})`)
  const r = oneSampleT(a.map((x, i) => x - b[i]), 0, alt, alpha)
  return { ...r, test: 'Paired t-test', ci: r.ci && [r.ci[0], r.ci[1], r.ci[2].replace('the mean', 'the mean difference')], table: [['Pairs', String(a.length)], ...r.table.slice(1, 4).map(([k, v]) => [`${k} of differences`, v] as [string, string])] }
}

export function anova(groups: number[][]): TestResult {
  const g = groups.filter((x) => x.length > 0)
  const k = g.length, N = g.reduce((s, x) => s + x.length, 0)
  if (k < 2 || N - k < 1) return bad('One-way ANOVA', 'Need at least 2 groups and more values than groups')
  const all = g.flat(), gm = mean(all)
  const ssb = g.reduce((s, x) => s + x.length * (mean(x) - gm) ** 2, 0)
  const ssw = g.reduce((s, x) => s + x.reduce((t, v) => t + (v - mean(x)) ** 2, 0), 0)
  const df1 = k - 1, df2 = N - k
  const F = ssb / df1 / (ssw / df2)
  const d: Dist = { kind: 'F', df1, df2 }
  const eta = ssb / (ssb + ssw)
  return {
    test: 'One-way ANOVA', statName: 'F', stat: F, df: `${df1}, ${df2}`, p: pFrom(F, d, 'greater'), dist: d, alt: 'greater',
    effect: ['η² (eta squared)', eta, size(eta, [0.01, 0.06, 0.14])],
    table: [['Groups / N', `${k} / ${N}`], ['SS between', f(ssb)], ['SS within', f(ssw)], ['MS between', f(ssb / df1)], ['MS within', f(ssw / df2)], ...g.map((x, i) => [`Group ${i + 1} mean (n=${x.length})`, f(mean(x))] as [string, string])],
  }
}

export function chiIndependence(t: number[][]): TestResult {
  const rows = t.filter((r) => r.length), R = rows.length, C = Math.max(0, ...rows.map((r) => r.length))
  if (R < 2 || C < 2 || rows.some((r) => r.length !== C)) return bad('Chi-square test of independence', 'Enter a table with at least 2 rows and 2 columns of equal length')
  const rs = rows.map((r) => r.reduce((a, b) => a + b, 0)), cs = Array.from({ length: C }, (_, j) => rows.reduce((a, r) => a + r[j], 0)), N = rs.reduce((a, b) => a + b, 0)
  let x2 = 0, lowE = 0
  rows.forEach((r, i) => r.forEach((o, j) => { const e = (rs[i] * cs[j]) / N; if (e < 5) lowE++; x2 += (o - e) ** 2 / e }))
  const df = (R - 1) * (C - 1)
  const d: Dist = { kind: 'chi2', df }
  const v = Math.sqrt(x2 / (N * Math.min(R - 1, C - 1)))
  return {
    test: 'Chi-square test of independence', statName: 'χ²', stat: x2, df: String(df), p: pFrom(x2, d, 'greater'), dist: d, alt: 'greater',
    effect: ["Cramér's V", v, size(v, [0.1, 0.3, 0.5])],
    table: [['Table', `${R} × ${C}`], ['Total N', String(N)], ['Cells with expected < 5', `${lowE} of ${R * C}`]],
  }
}

export function chiGof(obs: number[], expected: number[]): TestResult {
  const k = obs.length
  if (k < 2) return bad('Chi-square goodness of fit', 'Need at least 2 categories')
  const N = obs.reduce((a, b) => a + b, 0)
  const ex = expected.length === k ? expected : Array(k).fill(1)
  const es = ex.reduce((a, b) => a + b, 0)
  const E = ex.map((e) => (e / es) * N)
  const x2 = obs.reduce((s, o, i) => s + (o - E[i]) ** 2 / E[i], 0)
  const d: Dist = { kind: 'chi2', df: k - 1 }
  const w = Math.sqrt(x2 / N)
  return {
    test: 'Chi-square goodness of fit', statName: 'χ²', stat: x2, df: String(k - 1), p: pFrom(x2, d, 'greater'), dist: d, alt: 'greater',
    effect: ["Cohen's w", w, size(w, [0.1, 0.3, 0.5])],
    table: obs.map((o, i) => [`Category ${i + 1}`, `observed ${o}, expected ${f(E[i])}`] as [string, string]),
  }
}

export function twoProportionZ(x1: number, n1: number, x2: number, n2: number, alt: Alt, alpha = 0.05): TestResult {
  if (!(n1 > 0 && n2 > 0) || x1 < 0 || x2 < 0 || x1 > n1 || x2 > n2) return bad('Two-proportion z-test', 'Successes must be between 0 and n')
  const p1 = x1 / n1, p2 = x2 / n2, pp = (x1 + x2) / (n1 + n2)
  const se = Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2))
  const z = (p1 - p2) / se
  const d: Dist = { kind: 'z' }
  const seU = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2)
  const zc = invert(normCdf, 1 - alpha / 2, -10, 10)
  const h = 2 * Math.asin(Math.sqrt(p1)) - 2 * Math.asin(Math.sqrt(p2))
  return {
    test: 'Two-proportion z-test', statName: 'z', stat: z, p: pFrom(z, d, alt), dist: d, alt,
    effect: ["Cohen's h", h, size(Math.abs(h), [0.2, 0.5, 0.8])],
    ci: [p1 - p2 - zc * seU, p1 - p2 + zc * seU, `${f((1 - alpha) * 100, 3)}% CI for p₁ − p₂`],
    table: [['p₁', `${x1}/${n1} = ${f(p1)}`], ['p₂', `${x2}/${n2} = ${f(p2)}`], ['Pooled p', f(pp)], ['Std. error', f(se)]],
  }
}

export function correlation(x: number[], y: number[], alt: Alt, alpha = 0.05): TestResult {
  const n = Math.min(x.length, y.length)
  if (x.length !== y.length) return bad('Pearson correlation test', `X and Y need the same length (${x.length} vs ${y.length})`)
  if (n < 3) return bad('Pearson correlation test', 'Need at least 3 pairs')
  const mx = mean(x), my = mean(y)
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2 }
  const r = sxy / Math.sqrt(sxx * syy)
  const df = n - 2
  const t = r * Math.sqrt(df / (1 - r * r))
  const d: Dist = { kind: 't', df }
  const z = Math.atanh(r), zc = invert(normCdf, 1 - alpha / 2, -10, 10) / Math.sqrt(n - 3)
  return {
    test: 'Pearson correlation test', statName: 't', stat: t, df: String(df), p: pFrom(t, d, alt), dist: d, alt,
    effect: ['r', r, size(Math.abs(r), [0.1, 0.3, 0.5])],
    ci: n > 3 ? [Math.tanh(z - zc), Math.tanh(z + zc), `${f((1 - alpha) * 100, 3)}% CI for r (Fisher z)`] : undefined,
    table: [['Pairs', String(n)], ['r', f(r)], ['r²', f(r * r)], ['Slope (Y on X)', f(sxy / sxx)], ['Intercept', f(my - (sxy / sxx) * mx)]],
  }
}

function ranks(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0])
  const r = Array(v.length).fill(0)
  for (let i = 0; i < idx.length; ) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1
    i = j + 1
  }
  return r
}

export function mannWhitney(a: number[], b: number[], alt: Alt): TestResult {
  const n1 = a.length, n2 = b.length
  if (n1 < 2 || n2 < 2) return bad('Mann–Whitney U test', 'Each group needs at least 2 values')
  const r = ranks([...a, ...b])
  const R1 = r.slice(0, n1).reduce((s, x) => s + x, 0)
  const U1 = R1 - (n1 * (n1 + 1)) / 2
  const N = n1 + n2
  const ties = Object.values(r.reduce((m: Record<number, number>, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).reduce((s, t) => s + t ** 3 - t, 0)
  const sigma = Math.sqrt(((n1 * n2) / 12) * (N + 1 - ties / (N * (N - 1))))
  const mu = (n1 * n2) / 2
  const cc = alt === 'two' ? 0.5 * Math.sign(U1 - mu) : alt === 'greater' ? 0.5 : -0.5
  const z = (U1 - mu - cc) / sigma
  const d: Dist = { kind: 'z' }
  const rbc = 1 - (2 * Math.min(U1, n1 * n2 - U1)) / (n1 * n2)
  return {
    test: 'Mann–Whitney U test', statName: 'z', stat: z, p: pFrom(z, d, alt), dist: d, alt,
    effect: ['Rank-biserial r', (2 * U1) / (n1 * n2) - 1, size(rbc, [0.1, 0.3, 0.5])],
    table: [['n₁ / n₂', `${n1} / ${n2}`], ['U₁', f(U1)], ['Median₁ / Median₂', `${f(median(a))} / ${f(median(b))}`], ['Normal approx. (tie-corrected)', `μ=${f(mu)}, σ=${f(sigma)}`]],
  }
}

export function wilcoxonSigned(a: number[], b: number[], alt: Alt): TestResult {
  if (a.length !== b.length) return bad('Wilcoxon signed-rank test', `Both columns need the same number of values (${a.length} vs ${b.length})`)
  const dif = a.map((x, i) => x - b[i]).filter((x) => x !== 0)
  const n = dif.length
  if (n < 3) return bad('Wilcoxon signed-rank test', 'Need at least 3 non-zero differences')
  const r = ranks(dif.map(Math.abs))
  const Wp = r.reduce((s, x, i) => s + (dif[i] > 0 ? x : 0), 0)
  const mu = (n * (n + 1)) / 4
  const ties = Object.values(r.reduce((m: Record<number, number>, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).reduce((s, t) => s + t ** 3 - t, 0)
  const sigma = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - ties / 48)
  const z = (Wp - mu) / sigma
  const d: Dist = { kind: 'z' }
  return {
    test: 'Wilcoxon signed-rank test', statName: 'z', stat: z, p: pFrom(z, d, alt), dist: d, alt,
    effect: ['r = z/√n', z / Math.sqrt(n), size(Math.abs(z / Math.sqrt(n)), [0.1, 0.3, 0.5])],
    table: [['Non-zero pairs', String(n)], ['W⁺', f(Wp)], ['Median difference', f(median(dif))]],
  }
}

export function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function size(v: number, [s, m, l]: number[]): string {
  return v >= l ? 'large' : v >= m ? 'medium' : v >= s ? 'small' : 'negligible'
}

function bad(test: string, error: string): TestResult {
  return { test, statName: '', stat: NaN, p: NaN, dist: { kind: 'z' }, alt: 'two', table: [], error }
}
