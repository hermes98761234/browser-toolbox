// Conjugate Bayesian updating: beta–binomial, gamma–Poisson and normal–normal (known σ).
// Densities, CDFs, equal-tailed and highest-density credible intervals, sequential posteriors.

import { betaI, gammaP, lnGamma, normCdf, normInv } from './statistics-calculator'

export type Kind = 'beta' | 'gamma' | 'normal'

/** A distribution over the parameter: Beta(a, b), Gamma(shape a, rate b) or Normal(mean a, sd b). */
export interface Dist { kind: Kind; a: number; b: number }

export function pdf(d: Dist, x: number): number {
  const { a, b } = d
  if (d.kind === 'beta') {
    if (x <= 0 || x >= 1) return 0
    return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) + lnGamma(a + b) - lnGamma(a) - lnGamma(b))
  }
  if (d.kind === 'gamma') {
    if (x <= 0) return 0
    return Math.exp(a * Math.log(b) - lnGamma(a) + (a - 1) * Math.log(x) - b * x)
  }
  return Math.exp(-0.5 * ((x - a) / b) ** 2) / (b * Math.sqrt(2 * Math.PI))
}

export function cdf(d: Dist, x: number): number {
  if (d.kind === 'beta') return betaI(Math.min(1, Math.max(0, x)), d.a, d.b)
  if (d.kind === 'gamma') return x <= 0 ? 0 : gammaP(d.a, d.b * x)
  return normCdf((x - d.a) / d.b)
}

export function quantile(d: Dist, p: number): number {
  if (d.kind === 'normal') return d.a + d.b * normInv(p)
  let lo = 0, hi = d.kind === 'beta' ? 1 : Math.max(1, (d.a / d.b) * 4 + 10 / d.b)
  if (d.kind === 'gamma') while (cdf(d, hi) < p) hi *= 2
  for (let i = 0; i < 100; i++) {
    const m = (lo + hi) / 2
    if (cdf(d, m) < p) lo = m
    else hi = m
  }
  return (lo + hi) / 2
}

export function mean(d: Dist): number {
  return d.kind === 'beta' ? d.a / (d.a + d.b) : d.kind === 'gamma' ? d.a / d.b : d.a
}

export function sd(d: Dist): number {
  if (d.kind === 'beta') {
    const s = d.a + d.b
    return Math.sqrt((d.a * d.b) / (s * s * (s + 1)))
  }
  return d.kind === 'gamma' ? Math.sqrt(d.a) / d.b : d.b
}

export function mode(d: Dist): number {
  if (d.kind === 'beta') return d.a > 1 && d.b > 1 ? (d.a - 1) / (d.a + d.b - 2) : d.a <= 1 && d.b > 1 ? 0 : d.a > 1 && d.b <= 1 ? 1 : NaN
  if (d.kind === 'gamma') return d.a >= 1 ? (d.a - 1) / d.b : 0
  return d.a
}

export function equalTailed(d: Dist, mass: number): [number, number] {
  return [quantile(d, (1 - mass) / 2), quantile(d, 1 - (1 - mass) / 2)]
}

/** Highest-density interval for a unimodal density: the shortest interval holding `mass`. */
export function hdi(d: Dist, mass: number): [number, number] {
  if (d.kind === 'normal') return equalTailed(d, mass)
  const width = (p: number) => quantile(d, p + mass) - quantile(d, p)
  let lo = 0, hi = 1 - mass
  const g = (Math.sqrt(5) - 1) / 2
  let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo)
  let f1 = width(x1), f2 = width(x2)
  for (let i = 0; i < 60; i++) {
    if (f1 < f2) {
      hi = x2; x2 = x1; f2 = f1; x1 = hi - g * (hi - lo); f1 = width(x1)
    } else {
      lo = x1; x1 = x2; f1 = f2; x2 = lo + g * (hi - lo); f2 = width(x2)
    }
  }
  const p = (lo + hi) / 2
  return [quantile(d, p), quantile(d, p + mass)]
}

// ---------- data & updates ----------

/** One batch of data. beta: k successes in n trials; gamma: total count over exposure; normal: observations. */
export interface Batch { label: string; k?: number; n?: number; count?: number; exposure?: number; xs?: number[] }

export function update(prior: Dist, batch: Batch, sigma = 1): Dist {
  if (prior.kind === 'beta') {
    const k = batch.k ?? 0, n = batch.n ?? 0
    return { kind: 'beta', a: prior.a + k, b: prior.b + (n - k) }
  }
  if (prior.kind === 'gamma') return { kind: 'gamma', a: prior.a + (batch.count ?? 0), b: prior.b + (batch.exposure ?? 0) }
  const xs = batch.xs ?? []
  if (!xs.length) return prior
  const n = xs.length, xbar = xs.reduce((a, b) => a + b, 0) / n
  const prec = 1 / prior.b ** 2 + n / sigma ** 2
  const m = (prior.a / prior.b ** 2 + (n * xbar) / sigma ** 2) / prec
  return { kind: 'normal', a: m, b: Math.sqrt(1 / prec) }
}

export function sequence(prior: Dist, batches: Batch[], sigma = 1): Dist[] {
  const out = [prior]
  for (const b of batches) out.push(update(out[out.length - 1], b, sigma))
  return out
}

/**
 * Parses batches. beta: "7/10" or "1 0 1 1" (0/1 outcomes); gamma: "count" or "count/exposure";
 * normal: whitespace/comma separated observations. One batch per line; "#label" after the data.
 */
export function parseBatches(kind: Kind, text: string): { batches: Batch[]; errors: string[] } {
  const batches: Batch[] = [], errors: string[] = []
  text.split(/\n/).forEach((raw, i) => {
    const [data, ...lab] = raw.split('#')
    const line = data.trim()
    if (!line) return
    const label = lab.join('#').trim() || `Batch ${batches.length + 1}`
    if (kind === 'beta') {
      const m = /^(\d+)\s*\/\s*(\d+)$/.exec(line)
      if (m) {
        const k = Number(m[1]), n = Number(m[2])
        if (k > n) errors.push(`Line ${i + 1}: successes exceed trials`)
        else batches.push({ label, k, n })
        return
      }
      const bits = line.split(/[\s,]+/)
      if (bits.every((b) => b === '0' || b === '1')) batches.push({ label, k: bits.filter((b) => b === '1').length, n: bits.length })
      else errors.push(`Line ${i + 1}: use "k/n" or a list of 0/1 outcomes`)
    } else if (kind === 'gamma') {
      const m = /^(\d+)\s*(?:\/\s*([\d.]+))?$/.exec(line)
      if (m) batches.push({ label, count: Number(m[1]), exposure: m[2] ? Number(m[2]) : 1 })
      else {
        const cs = line.split(/[\s,]+/).map(Number)
        if (cs.every((c) => Number.isInteger(c) && c >= 0)) batches.push({ label, count: cs.reduce((a, b) => a + b, 0), exposure: cs.length })
        else errors.push(`Line ${i + 1}: use "count/exposure" or a list of counts (one per unit)`)
      }
    } else {
      const xs = line.split(/[\s,;]+/).map(Number)
      if (xs.every(Number.isFinite)) batches.push({ label, xs })
      else errors.push(`Line ${i + 1}: not a list of numbers`)
    }
  })
  return { batches, errors }
}

/** Normalised likelihood of all data (as a density over the parameter), for plotting. */
export function likelihoodDist(kind: Kind, batches: Batch[], sigma = 1): Dist | null {
  if (!batches.length) return null
  if (kind === 'beta') {
    const k = batches.reduce((s, b) => s + (b.k ?? 0), 0), n = batches.reduce((s, b) => s + (b.n ?? 0), 0)
    return { kind: 'beta', a: k + 1, b: n - k + 1 }
  }
  if (kind === 'gamma') {
    const c = batches.reduce((s, b) => s + (b.count ?? 0), 0), e = batches.reduce((s, b) => s + (b.exposure ?? 0), 0)
    return e > 0 ? { kind: 'gamma', a: c + 1, b: e } : null
  }
  const xs = batches.flatMap((b) => b.xs ?? [])
  return xs.length ? { kind: 'normal', a: xs.reduce((a, b) => a + b, 0) / xs.length, b: sigma / Math.sqrt(xs.length) } : null
}

/** Beta prior from a mean and an "effective number of prior observations". */
export const betaFromMean = (m: number, n: number): Dist => ({ kind: 'beta', a: Math.max(1e-3, m * n), b: Math.max(1e-3, (1 - m) * n) })
/** Gamma prior from a mean rate and an "effective exposure". */
export const gammaFromMean = (m: number, e: number): Dist => ({ kind: 'gamma', a: Math.max(1e-3, m * e), b: Math.max(1e-6, e) })

/** Posterior predictive probability for the next trial / count. */
export function predictive(d: Dist, sigma = 1): string {
  if (d.kind === 'beta') return `P(next trial succeeds) = ${(mean(d) * 100).toFixed(1)}%`
  if (d.kind === 'gamma') return `next unit: negative binomial with mean ${mean(d).toFixed(3)}, variance ${(mean(d) * (1 + 1 / d.b)).toFixed(3)}`
  return `next observation ~ Normal(${d.a.toFixed(3)}, sd ${Math.sqrt(d.b ** 2 + sigma ** 2).toFixed(3)})`
}
