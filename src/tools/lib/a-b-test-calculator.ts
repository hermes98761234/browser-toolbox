// A/B test statistics: two-proportion z-test, Wilson intervals, lift CIs, power, sample size, SRM check.
import { chi2Cdf } from './hypothesis-test-wizard'
import { normCdf, normInv } from './sample-size-calculator'

export { normCdf, normInv }
export type Sides = 'two' | 'one'

/** Wilson score interval for a binomial proportion. */
export function wilson(x: number, n: number, conf: number): [number, number] {
  if (n <= 0) return [NaN, NaN]
  const z = normInv(1 - (1 - conf) / 2)
  const p = x / n
  const den = 1 + (z * z) / n
  const c = (p + (z * z) / (2 * n)) / den
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den
  return [Math.max(0, c - h), Math.min(1, c + h)]
}

export interface Compare {
  pA: number; pB: number; diff: number; lift: number
  z: number; p: number; significant: boolean
  diffCI: [number, number]; liftCI: [number, number]
  probBBeats: number; power: number
}

/** Variant B vs control A. `alpha` already includes any multiple-comparison correction. */
export function compare(nA: number, xA: number, nB: number, xB: number, alpha: number, sides: Sides): Compare {
  const pA = xA / nA, pB = xB / nB
  const diff = pB - pA
  const pool = (xA + xB) / (nA + nB)
  const seP = Math.sqrt(pool * (1 - pool) * (1 / nA + 1 / nB))
  const z = seP > 0 ? diff / seP : 0
  const p = sides === 'two' ? 2 * (1 - normCdf(Math.abs(z))) : 1 - normCdf(z)
  const seU = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB)
  const zc = normInv(1 - (sides === 'two' ? alpha / 2 : alpha))
  const diffCI: [number, number] = sides === 'two' ? [diff - zc * seU, diff + zc * seU] : [diff - zc * seU, Infinity]
  const lift = pA > 0 ? pB / pA - 1 : NaN
  const seL = xA > 0 && xB > 0 ? Math.sqrt((1 - pA) / xA + (1 - pB) / xB) : NaN
  const lr = Math.log(pB / pA)
  const liftCI: [number, number] = sides === 'two' ? [Math.exp(lr - zc * seL) - 1, Math.exp(lr + zc * seL) - 1] : [Math.exp(lr - zc * seL) - 1, Infinity]
  const probBBeats = seU > 0 ? normCdf(diff / seU) : diff > 0 ? 1 : diff < 0 ? 0 : 0.5
  // power to detect the observed difference at these sample sizes
  const power = seU > 0 ? normCdf((Math.abs(diff) - zc * seP) / seU) : NaN
  return { pA, pB, diff, lift, z, p, significant: p < alpha && (sides === 'two' || diff > 0), diffCI, liftCI, probBBeats, power }
}

/** Visitors per variant to detect a relative lift `mde` over `base` (equal split). */
export function sampleSize(base: number, mde: number, alpha: number, power: number, sides: Sides): number {
  const p1 = base, p2 = base * (1 + mde)
  if (!(p1 > 0 && p1 < 1 && p2 > 0 && p2 < 1) || p1 === p2) return NaN
  const za = normInv(1 - (sides === 'two' ? alpha / 2 : alpha))
  const zb = normInv(power)
  const pbar = (p1 + p2) / 2
  const n = (za * Math.sqrt(2 * pbar * (1 - pbar)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / (p2 - p1) ** 2
  return Math.ceil(n)
}

/** Sample-ratio-mismatch: chi-square goodness of fit of visitor counts vs the intended split. */
export function srm(visitors: number[], weights?: number[]): { chi2: number; p: number } {
  const total = visitors.reduce((a, b) => a + b, 0)
  const w = weights ?? visitors.map(() => 1)
  const ws = w.reduce((a, b) => a + b, 0)
  const chi2 = visitors.reduce((a, v, i) => {
    const e = (total * w[i]) / ws
    return a + (e > 0 ? (v - e) ** 2 / e : 0)
  }, 0)
  return { chi2, p: 1 - chi2Cdf(chi2, visitors.length - 1) }
}

export const normPdf = (x: number, m: number, s: number) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI))
