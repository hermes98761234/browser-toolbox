// Growing degree day (heat unit) methods. All temperatures in one consistent unit.

export type Method = 'average' | 'modified' | 'sine'

/** Simple average: max(0, (Tmax+Tmin)/2 − base). */
export const gddAverage = (tmin: number, tmax: number, base: number) => Math.max(0, (tmax + tmin) / 2 - base)

/** Modified (e.g. corn 86/50 °F): Tmax capped at `upper`, both temps floored at `base`. */
export function gddModified(tmin: number, tmax: number, base: number, upper: number): number {
  const hi = Math.max(base, Math.min(upper, tmax))
  const lo = Math.max(base, Math.min(upper, tmin))
  return Math.max(0, (hi + lo) / 2 - base)
}

/** Single-sine method (Baskerville & Emin 1969) with horizontal upper cutoff. */
export function gddSine(tmin: number, tmax: number, base: number, upper = Infinity): number {
  if (tmax < tmin) [tmin, tmax] = [tmax, tmin]
  if (tmax <= base) return 0
  if (tmin >= upper) return upper - base
  const M = (tmax + tmin) / 2, a = (tmax - tmin) / 2
  if (a === 0) return Math.max(0, Math.min(upper, M) - base)
  const t1 = tmin >= base ? -Math.PI / 2 : Math.asin((base - M) / a)
  const t2 = tmax <= upper ? Math.PI / 2 : Math.asin((upper - M) / a)
  const cut = Number.isFinite(upper) ? (upper - base) * (Math.PI / 2 - t2) : 0
  return ((M - base) * (t2 - t1) + a * (Math.cos(t1) - Math.cos(t2)) + cut) / Math.PI
}

export function gdd(method: Method, tmin: number, tmax: number, base: number, upper: number): number {
  if (!Number.isFinite(tmin) || !Number.isFinite(tmax)) return 0
  if (method === 'average') return gddAverage(tmin, tmax, base)
  if (method === 'modified') return gddModified(tmin, tmax, base, upper)
  return gddSine(tmin, tmax, base, upper)
}

export const cToF = (c: number) => (c * 9) / 5 + 32
export const fToC = (f: number) => ((f - 32) * 5) / 9

/** Running sum. */
export function accumulate(xs: number[]): number[] {
  let s = 0
  return xs.map((x) => (s += x))
}

/** Index of first cumulative value ≥ target, or −1. */
export const reachedAt = (cum: number[], target: number) => cum.findIndex((v) => v >= target)
