// Exposure value math. Brightness ∝ t·ISO / N². EV100 = log2(N²/t) − log2(ISO/100).

export const APERTURES = [1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22, 25, 29, 32]
export const SHUTTERS = [
  30, 25, 20, 15, 13, 10, 8, 6, 5, 4, 3.2, 2.5, 2, 1.6, 1.3, 1, 0.8, 0.6, 0.5, 0.4, 0.3,
  1 / 4, 1 / 5, 1 / 6, 1 / 8, 1 / 10, 1 / 13, 1 / 15, 1 / 20, 1 / 25, 1 / 30, 1 / 40, 1 / 50, 1 / 60, 1 / 80, 1 / 100, 1 / 125,
  1 / 160, 1 / 200, 1 / 250, 1 / 320, 1 / 400, 1 / 500, 1 / 640, 1 / 800, 1 / 1000, 1 / 1250, 1 / 1600, 1 / 2000, 1 / 2500,
  1 / 3200, 1 / 4000, 1 / 5000, 1 / 6400, 1 / 8000,
]
export const ISOS = [50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800, 16000, 20000, 25600, 51200, 102400]

export type Param = 'n' | 't' | 'iso'
export interface Exposure { n: number; t: number; iso: number }

export const ev100 = (e: Exposure) => Math.log2((e.n * e.n) / e.t) - Math.log2(e.iso / 100)

/** Solves the missing parameter so that the exposure matches `ev` (an EV100 value). */
export function solve(param: Param, e: Exposure, ev: number): number {
  if (param === 't') return (e.n * e.n) / 2 ** (ev + Math.log2(e.iso / 100))
  if (param === 'n') return Math.sqrt(e.t * 2 ** (ev + Math.log2(e.iso / 100)))
  return 100 * 2 ** (Math.log2((e.n * e.n) / e.t) - ev)
}

/** Position of a value on a stop scale (larger = brighter exposure). */
export function stops(param: Param, v: number): number {
  if (param === 'n') return -2 * Math.log2(v)
  if (param === 't') return Math.log2(v)
  return Math.log2(v / 100)
}

/** Nearest marked value on a log scale; returns the value and the error in stops (+ = brighter than exact). */
export function nearest(param: Param, list: number[], v: number): { v: number; err: number } {
  let best = list[0]
  for (const x of list) if (Math.abs(stops(param, x) - stops(param, v)) < Math.abs(stops(param, best) - stops(param, v))) best = x
  return { v: best, err: stops(param, best) - stops(param, v) }
}

export function fmtShutter(t: number): string {
  if (t >= 0.3) return `${+t.toFixed(t < 1 ? 1 : t < 10 ? 1 : 0)}″`
  return `1/${Math.round(1 / t)}`
}
export const fmtN = (n: number) => `f/${n < 10 ? +n.toFixed(1) : Math.round(n)}`
export const fmtIso = (i: number) => `ISO ${Math.round(i)}`
export const fmt = (p: Param, v: number) => (p === 'n' ? fmtN(v) : p === 't' ? fmtShutter(v) : fmtIso(v))

/** Full-stop sequences for the reference table. */
export const FULL = {
  n: [1, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22, 32],
  t: [1, 1 / 2, 1 / 4, 1 / 8, 1 / 15, 1 / 30, 1 / 60, 1 / 125, 1 / 250, 1 / 500, 1 / 1000, 1 / 2000, 1 / 4000, 1 / 8000],
  iso: [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600],
}

/** Approximate scene luminance in EV100 (classic exposure tables). */
export const SCENES: [string, number][] = [
  ['Snow / beach, bright sun', 16],
  ['Sunny day (sunny 16)', 15],
  ['Hazy sun', 14],
  ['Overcast, bright', 13],
  ['Heavy overcast / open shade', 12],
  ['Sunset', 11],
  ['Just after sunset', 9],
  ['Bright interior / stadium at night', 8],
  ['Home interior', 6],
  ['Street at night', 5],
  ['Candle-lit close-up', 4],
  ['Fireworks', 3],
  ['Full-moon landscape', -2],
  ['Milky Way', -6],
]
