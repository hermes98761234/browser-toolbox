// Body measurement maths: ellipse half-widths from circumferences, ratios and change summaries.

export const MEASURES = ['neck', 'chest', 'waist', 'hips', 'arm', 'thigh', 'calf'] as const
export type Measure = (typeof MEASURES)[number]
export interface Entry { id: string; date: string; weight: number; neck: number; chest: number; waist: number; hips: number; arm: number; thigh: number; calf: number; note: string }

/** Ramanujan's second approximation of an ellipse perimeter with semi-axes a, b. */
export function ellipsePerimeter(a: number, b: number): number {
  if (a + b === 0) return 0
  const h = ((a - b) / (a + b)) ** 2
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
}

/** Semi-axis `a` (half-width) of an ellipse with depth ratio b/a whose perimeter equals `c`. */
export function halfWidth(c: number, ratio = 1): number {
  return c > 0 ? c / ellipsePerimeter(1, ratio) : 0
}

export const waistHip = (e: Pick<Entry, 'waist' | 'hips'>) => (e.hips > 0 ? e.waist / e.hips : NaN)
export const waistHeight = (waist: number, height: number) => (height > 0 ? waist / height : NaN)

/** WHO waist-to-hip cut-offs for substantially increased metabolic risk: ≥0.90 men, ≥0.85 women. */
export function whrRisk(whr: number, sex: 'male' | 'female'): 'low' | 'high' {
  return whr >= (sex === 'male' ? 0.9 : 0.85) ? 'high' : 'low'
}

/** Waist-to-height ratio bands commonly used in screening (0.5 = "keep your waist under half your height"). */
export function whtrBand(r: number): string {
  if (!Number.isFinite(r)) return '—'
  if (r < 0.4) return 'Low'
  if (r < 0.5) return 'Healthy'
  if (r < 0.6) return 'Increased'
  return 'High'
}

/** U.S. Navy body-fat estimate (all lengths in cm). */
export function navyBodyFat(sex: 'male' | 'female', height: number, neck: number, waist: number, hips: number): number {
  if (sex === 'male') {
    if (waist - neck <= 0) return NaN
    return 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450
  }
  if (waist + hips - neck <= 0) return NaN
  return 495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(height)) - 450
}

export function sortByDate<T extends { date: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date))
}

/** Change of each field between the first and last entry (sorted by date). */
export function changes(list: Entry[]): Record<Measure | 'weight', number> {
  const s = sortByDate(list)
  const out = {} as Record<Measure | 'weight', number>
  for (const k of [...MEASURES, 'weight'] as const) out[k] = s.length > 1 ? s[s.length - 1][k] - s[0][k] : 0
  return out
}
