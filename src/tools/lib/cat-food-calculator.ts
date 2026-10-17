// Cat energy needs (RER × life-stage factor) and wet/dry portion maths.

/** Resting energy requirement, kcal/day: 70 × kg^0.75. */
export const rer = (kg: number) => (kg > 0 ? 70 * Math.pow(kg, 0.75) : 0)

export const STAGES = [
  ['kitten-young', 'Kitten, under 4 months', 3.0],
  ['kitten', 'Kitten, 4–12 months', 2.0],
  ['neutered', 'Adult, neutered/spayed', 1.2],
  ['intact', 'Adult, intact', 1.4],
  ['inactive', 'Adult, indoor/inactive', 1.0],
  ['senior', 'Senior (11+ years)', 1.1],
  ['loss', 'Weight loss (at ideal weight)', 0.8],
  ['gain', 'Weight gain (at ideal weight)', 1.3],
  ['pregnant', 'Pregnant', 1.8],
  ['lactating', 'Nursing kittens', 3.0],
] as const
export type Stage = (typeof STAGES)[number][0]
export const factorOf = (s: Stage) => STAGES.find((x) => x[0] === s)![2]

/**
 * Ideal weight estimate from the 9-point body condition score: every point above 5 ≈ 10 % excess
 * weight, every point below ≈ 10 % deficit.
 */
export const idealWeight = (kg: number, bcs: number) => kg / (1 + 0.1 * (bcs - 5))

export interface Portion {
  kcal: number
  wetKcal: number
  dryKcal: number
  wetGrams: number
  cans: number
  dryGrams: number
  cups: number
}

/** Splits daily kcal between wet (share by calories) and dry food. */
export function portions(kcal: number, wetShare: number, wetKcalPer100g: number, canGrams: number, dryKcalPerKg: number, dryKcalPerCup: number): Portion {
  const w = Math.max(0, Math.min(1, wetShare))
  const wetKcal = kcal * w, dryKcal = kcal - wetKcal
  const wetGrams = wetKcalPer100g > 0 ? (wetKcal / wetKcalPer100g) * 100 : 0
  return {
    kcal, wetKcal, dryKcal, wetGrams,
    cans: canGrams > 0 ? wetGrams / canGrams : 0,
    dryGrams: dryKcalPerKg > 0 ? (dryKcal / dryKcalPerKg) * 1000 : 0,
    cups: dryKcalPerCup > 0 ? dryKcal / dryKcalPerCup : 0,
  }
}

/** Nearest quarter as a friendly fraction, e.g. 1.27 → "1 ¼". */
export function quarters(x: number): string {
  const q = Math.round(x * 4)
  const whole = Math.floor(q / 4), rest = q % 4
  const frac = ['', '¼', '½', '¾'][rest]
  if (!whole && !rest) return x > 0 ? '< ¼' : '0'
  return whole ? `${whole}${frac ? ' ' + frac : ''}` : frac
}
