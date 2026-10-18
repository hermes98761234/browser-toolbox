// ISO 286-1 limits and fits computed from the standard's formulas (sizes 0–500 mm):
// standard tolerance unit i, IT grade multipliers, fundamental-deviation formulas per letter,
// the Δ rule for holes J–ZC, and rounding of computed values. All deviations in µm.

export const MAIN: [number, number][] = [[0, 3], [3, 6], [6, 10], [10, 18], [18, 30], [30, 50], [50, 80], [80, 120], [120, 180], [180, 250], [250, 315], [315, 400], [400, 500]]
export const INTER: [number, number][] = [[0, 3], [3, 6], [6, 10], [10, 14], [14, 18], [18, 24], [24, 30], [30, 40], [40, 50], [50, 65], [65, 80], [80, 100], [100, 120], [120, 140], [140, 160], [160, 180], [180, 200], [200, 225], [225, 250], [250, 280], [280, 315], [315, 355], [355, 400], [400, 450], [450, 500]]

/** Size steps are "over a up to and including b". */
export function stepOf(size: number, steps = MAIN): [number, number] | null {
  if (!(size > 0) || size > 500) return null
  return steps.find(([a, b]) => size > a && size <= b) ?? null
}

/** Geometric mean of the step (ISO uses 1 mm as lower bound of the first step). */
export const geoMean = ([a, b]: [number, number]) => Math.sqrt(Math.max(1, a) * b)

/** Standard tolerance unit i (µm), D in mm, D ≤ 500. */
export const unitI = (D: number) => 0.45 * Math.cbrt(D) + 0.001 * D

const ITK: Record<number, number> = { 5: 7, 6: 10, 7: 16, 8: 25, 9: 40, 10: 64, 11: 100 }

/**
 * Published IT5–IT11 values per main step. ISO 286 rounded the formula results and adjusted a few
 * cells (mostly ≤ 18 mm); these tabulated values are what drawings and gauges use.
 */
const IT_TABLE: Record<number, number[]> = {
  5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
  6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
  7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
  8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
  9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
  10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
  11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400],
}

/** ISO rounding of computed tolerance values (µm). */
export function roundIT(v: number): number {
  const m = v <= 100 ? 1 : v <= 200 ? 5 : v <= 500 ? 10 : v <= 1000 ? 10 : v <= 2000 ? 100 : v <= 5000 ? 100 : 1000
  return Math.round(v / m) * m
}

/** Rounding of computed fundamental deviations (µm). */
export function roundDev(v: number): number {
  const a = Math.abs(v)
  const m = a <= 60 ? 1 : a <= 100 ? 2 : a <= 200 ? 5 : a <= 500 ? 10 : a <= 1000 ? 20 : 50
  return Math.sign(v) * Math.round(a / m) * m
}

export interface ITOpts { published: boolean }

/** Standard tolerance ITn (µm) for a nominal size; grades 1–18. */
export function IT(grade: number, size: number, o: ITOpts = { published: true }): number {
  const st = stepOf(size)
  if (!st) return NaN
  const D = geoMean(st)
  const k = MAIN.indexOf(st)
  if (grade >= 12) return 10 * IT(grade - 5, size, o) // R5 series: ×10 every five grades
  if (grade >= 5) return o.published ? IT_TABLE[grade][k] : roundIT(ITK[grade] * unitI(D))
  // IT1–IT4: IT1 = 0.8 + 0.020D, then geometric steps towards IT5
  const it1 = 0.8 + 0.02 * D
  if (grade === 1) return Math.round(it1 * 10) / 10
  const it5 = IT(5, size, o)
  const v = it1 * (it5 / it1) ** ((grade - 1) / 4)
  return Math.round(v * 10) / 10
}

export const SHAFT_LETTERS = ['a', 'b', 'c', 'cd', 'd', 'e', 'ef', 'f', 'fg', 'g', 'h', 'js', 'k', 'm', 'n', 'p', 'r', 's', 't', 'u', 'v', 'x', 'y', 'z', 'za', 'zb', 'zc'] as const
export type Letter = (typeof SHAFT_LETTERS)[number]

const INTER_LETTERS = new Set(['a', 'b', 'c', 'r', 's', 't', 'u', 'v', 'x', 'y', 'z', 'za', 'zb', 'zc'])
/** Addend chosen by the standard where the formula reads "IT7 + 0 to 5" (p) and "IT8 + 1 to 4" (s ≤ 50 mm). */
const P_ADD = [-4, 0, 0, 0, 1, 1, 2, 2, 3, 4, 4, 5, 5]
const S_ADD = [0, 1, 1, 1, 2, 4]

/**
 * Fundamental deviation of a shaft letter (µm): es for a–h, ei for k–zc. NaN when undefined
 * (e.g. t below 24 mm; letters with no formula).
 */
export function shaftFD(letter: Letter, size: number, grade: number, o: ITOpts = { published: true }): number {
  const main = stepOf(size)
  if (!main) return NaN
  const st = INTER_LETTERS.has(letter) && size > 10 ? stepOf(size, INTER)! : main
  const D = geoMean(st)
  const mi = MAIN.indexOf(main)
  const it = (g: number) => IT(g, size, o)
  const gm = (a: number, b: number) => -Math.sqrt(a * b)
  switch (letter) {
    case 'a': return size <= 1 ? NaN : -roundDev(D <= 120 ? 265 + 1.3 * D : 3.5 * D)
    case 'b': return size <= 1 ? NaN : -roundDev(D <= 160 ? 140 + 0.85 * D : 1.8 * D)
    case 'c': return -roundDev(D <= 40 ? 52 * D ** 0.2 : 95 + 0.8 * D)
    case 'cd': return size > 10 ? NaN : roundDev(gm(-shaftFD('c', size, grade, o), -shaftFD('d', size, grade, o)))
    case 'd': return -roundDev(16 * D ** 0.44)
    case 'e': return -roundDev(11 * D ** 0.41)
    case 'ef': return size > 10 ? NaN : roundDev(gm(-shaftFD('e', size, grade, o), -shaftFD('f', size, grade, o)))
    case 'f': return -roundDev(5.5 * D ** 0.41)
    case 'fg': return size > 10 ? NaN : roundDev(gm(-shaftFD('f', size, grade, o), -shaftFD('g', size, grade, o)))
    case 'g': return -roundDev(2.5 * D ** 0.34)
    case 'h': return 0
    case 'js': return 0
    case 'k': return grade >= 4 && grade <= 7 ? roundDev(0.6 * Math.cbrt(D)) : 0
    case 'm': return it(7) - it(6)
    case 'n': return roundDev(5 * D ** 0.34)
    case 'p': return it(7) + P_ADD[mi]
    case 's': return size <= 50 ? it(8) + S_ADD[mi] : roundDev(it(7) + 0.4 * D)
    case 'r': return roundDev(Math.sqrt(shaftFD('p', size, grade, o) * shaftFD('s', size, grade, o)))
    case 't': return size <= 24 ? NaN : roundDev(it(7) + 0.63 * D)
    case 'u': return roundDev(it(7) + D)
    case 'v': return size <= 14 ? NaN : roundDev(it(7) + 1.25 * D)
    case 'x': return roundDev(it(7) + 1.6 * D)
    case 'y': return size <= 18 ? NaN : roundDev(it(7) + 2 * D)
    case 'z': return roundDev(it(7) + 2.5 * D)
    case 'za': return roundDev(it(8) + 3.15 * D)
    case 'zb': return roundDev(it(9) + 4 * D)
    case 'zc': return roundDev(it(10) + 5 * D)
  }
}

export interface Limits { upper: number; lower: number; it: number; fd: number; delta: number }

/** Shaft limits es/ei (µm). */
export function shaft(letter: Letter, grade: number, size: number, o: ITOpts = { published: true }): Limits | null {
  const it = IT(grade, size, o)
  const fd = shaftFD(letter, size, grade, o)
  if (!Number.isFinite(it) || !Number.isFinite(fd)) return null
  if (letter === 'js') return { upper: it / 2, lower: -it / 2, it, fd: 0, delta: 0 }
  const isUpper = SHAFT_LETTERS.indexOf(letter) <= SHAFT_LETTERS.indexOf('h')
  return isUpper ? { upper: fd, lower: fd - it, it, fd, delta: 0 } : { upper: fd + it, lower: fd, it, fd, delta: 0 }
}

/** Hole limits ES/EI (µm), with the Δ = ITn − IT(n−1) rule for K, M, N (≤ IT8) and P–ZC (≤ IT7). */
export function hole(letter: Letter, grade: number, size: number, o: ITOpts = { published: true }): Limits | null {
  const it = IT(grade, size, o)
  if (!Number.isFinite(it)) return null
  if (letter === 'js') return { upper: it / 2, lower: -it / 2, it, fd: 0, delta: 0 }
  const li = SHAFT_LETTERS.indexOf(letter)
  if (li <= SHAFT_LETTERS.indexOf('h')) {
    const es = shaftFD(letter, size, grade, o)
    if (!Number.isFinite(es)) return null
    const EI = -es || 0
    return { upper: EI + it, lower: EI, it, fd: EI, delta: 0 }
  }
  const ei = shaftFD(letter, size, grade, o)
  if (!Number.isFinite(ei)) return null
  const small = size <= 3
  const deltaApplies = !small && grade >= 3 && ((['k', 'm', 'n'].includes(letter) && grade <= 8) || (li >= SHAFT_LETTERS.indexOf('p') && grade <= 7))
  const delta = deltaApplies ? IT(grade, size, o) - IT(grade - 1, size, o) : 0
  let ES: number
  if (letter === 'k' && grade > 8) ES = 0
  else if (letter === 'n' && grade > 8 && !small) ES = 0
  else ES = -ei + delta
  return { upper: ES, lower: ES - it, it, fd: ES, delta }
}

export type FitKind = 'clearance' | 'transition' | 'interference'
export interface Fit { maxClear: number; minClear: number; kind: FitKind; mean: number }

/** Clearance = hole − shaft; negative clearance is interference. */
export function fit(h: Limits, s: Limits): Fit {
  const maxClear = h.upper - s.lower
  const minClear = h.lower - s.upper
  return { maxClear, minClear, mean: (maxClear + minClear) / 2, kind: minClear >= 0 ? 'clearance' : maxClear <= 0 ? 'interference' : 'transition' }
}

/** Parses "H7", "js6", "ZC10" → [letter, grade] with case meaning hole (upper) or shaft (lower). */
export function parseZone(z: string): { letter: Letter; grade: number; isHole: boolean } | null {
  const m = /^\s*([A-Za-z]{1,2})\s*(\d{1,2})\s*$/.exec(z)
  if (!m) return null
  const l = m[1].toLowerCase() as Letter
  if (!SHAFT_LETTERS.includes(l)) return null
  const g = Number(m[2])
  if (g < 1 || g > 18) return null
  return { letter: l, grade: g, isHole: m[1][0] === m[1][0].toUpperCase() }
}

export const PRESETS: { fit: string; name: string; use: string }[] = [
  { fit: 'H11/c11', name: 'Loose running', use: 'Wide commercial tolerances, external parts' },
  { fit: 'H9/d9', name: 'Free running', use: 'Large temperature variations, high speeds, heavy journal pressure' },
  { fit: 'H8/f7', name: 'Close running', use: 'Accurate location at moderate speeds, running on machines' },
  { fit: 'H7/g6', name: 'Sliding', use: 'Parts that move and turn freely and locate accurately' },
  { fit: 'H7/h6', name: 'Locational clearance', use: 'Snug fit for stationary parts, freely assembled' },
  { fit: 'H7/k6', name: 'Locational transition', use: 'Accurate location, compromise between clearance and interference' },
  { fit: 'H7/n6', name: 'Locational transition (tighter)', use: 'More accurate location where greater interference is allowed' },
  { fit: 'H7/p6', name: 'Locational interference', use: 'Rigidity and alignment without special bore pressure' },
  { fit: 'H7/s6', name: 'Medium drive', use: 'Ordinary steel parts, shrink fits on light sections' },
  { fit: 'H7/u6', name: 'Force', use: 'Parts that can be highly stressed, or shrink fits' },
  { fit: 'C11/h11', name: 'Loose running (shaft basis)', use: 'Shaft-basis equivalent of H11/c11' },
  { fit: 'F8/h7', name: 'Close running (shaft basis)', use: 'Shaft-basis equivalent of H8/f7' },
  { fit: 'G7/h6', name: 'Sliding (shaft basis)', use: 'Shaft-basis equivalent of H7/g6' },
  { fit: 'K7/h6', name: 'Transition (shaft basis)', use: 'Shaft-basis equivalent of H7/k6' },
  { fit: 'P7/h6', name: 'Interference (shaft basis)', use: 'Shaft-basis equivalent of H7/p6' },
]
