// Daily energy and macronutrient targets.

export type Sex = 'male' | 'female'

/** Mifflin-St Jeor resting energy (kcal/day). */
export function mifflin(sex: Sex, kg: number, cm: number, age: number): number {
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161)
}

/** Katch-McArdle resting energy from lean body mass (kcal/day). */
export function katch(kg: number, bodyFatPct: number): number {
  return 370 + 21.6 * kg * (1 - bodyFatPct / 100)
}

export const ACTIVITY: [number, string, string][] = [
  [1.2, 'Sedentary', 'desk job, little exercise'],
  [1.375, 'Light', 'exercise 1–3 days/week'],
  [1.55, 'Moderate', 'exercise 3–5 days/week'],
  [1.725, 'Very active', 'hard exercise 6–7 days/week'],
  [1.9, 'Athlete', 'physical job + training'],
]

/** kcal per kg of body-weight change (fat tissue approximation). */
export const KCAL_PER_KG = 7700

export const KCAL = { protein: 4, carbs: 4, fat: 9 } as const

export interface Macros {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/** Splits `kcal` into grams by percentage of energy (carbs take the remainder). */
export function split(kcal: number, proteinPct: number, fatPct: number): Macros {
  const p = Math.max(0, proteinPct), f = Math.max(0, fatPct)
  const c = Math.max(0, 100 - p - f)
  return {
    kcal,
    protein: (kcal * p) / 100 / KCAL.protein,
    fat: (kcal * f) / 100 / KCAL.fat,
    carbs: (kcal * c) / 100 / KCAL.carbs,
  }
}

/** Daily kcal offset that produces `kgPerWeek` of weight change. */
export const weeklyDelta = (kgPerWeek: number) => (kgPerWeek * KCAL_PER_KG) / 7

export const lbToKg = (lb: number) => lb * 0.45359237
export const inToCm = (inch: number) => inch * 2.54
