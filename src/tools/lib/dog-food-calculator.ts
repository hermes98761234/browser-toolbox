// Dog energy requirements (RER/MER) and portion maths.

/** Resting energy requirement, kcal/day: 70 × kg^0.75. */
export const rer = (kg: number) => (kg > 0 ? 70 * kg ** 0.75 : 0)

export interface Stage { id: string; label: string; factor: number; useIdeal?: boolean; note: string }
// Typical multipliers (WSAVA / veterinary nutrition references).
export const STAGES: Stage[] = [
  { id: 'neutered', label: 'Adult, neutered/spayed', factor: 1.6, note: 'Typical pet dog.' },
  { id: 'intact', label: 'Adult, intact', factor: 1.8, note: 'Not neutered.' },
  { id: 'inactive', label: 'Inactive / obesity-prone', factor: 1.3, note: 'Range 1.2–1.4.' },
  { id: 'senior', label: 'Senior', factor: 1.4, note: 'Older, less active dogs.' },
  { id: 'loss', label: 'Weight loss', factor: 1.0, useIdeal: true, note: 'Applied to the ideal (target) weight.' },
  { id: 'gain', label: 'Weight gain', factor: 1.4, useIdeal: true, note: 'Applied to the ideal (target) weight; range 1.2–1.8.' },
  { id: 'light', label: 'Light work / very active', factor: 2.0, note: 'Daily long runs, agility.' },
  { id: 'moderate', label: 'Moderate work', factor: 3.0, note: 'Herding, hunting.' },
  { id: 'heavy', label: 'Heavy work', factor: 5.0, note: 'Sled dogs: 4–8.' },
  { id: 'puppy4', label: 'Puppy under 4 months', factor: 3.0, note: 'Feed 3–4 meals a day.' },
  { id: 'puppy', label: 'Puppy 4 months to adult', factor: 2.0, note: 'Adjust as growth slows.' },
  { id: 'preg', label: 'Pregnant (first 6 weeks)', factor: 1.8, note: 'Increase to 3.0 in the last 3 weeks.' },
  { id: 'preglate', label: 'Pregnant (last 3 weeks)', factor: 3.0, note: '' },
  { id: 'lact', label: 'Lactating', factor: 4.0, note: '4–8 depending on litter size; often fed free choice.' },
]

/** Ideal weight from a 9-point body condition score: each point above 5 ≈ 10 % over ideal. */
export const idealFromBcs = (kg: number, bcs: number) => (kg * 100) / (100 + (bcs - 5) * 10)

export interface Plan {
  kcal: number; treats: number; food: number; wetKcal: number; dryKcal: number
  dryGrams: number; dryCups: number; wetUnits: number; perMeal: { grams: number; cups: number; wet: number }
}

/**
 * Splits the daily calories: `treatPct` % for treats, then `wetPct` % of the rest from wet food.
 * kcalPerKg / kcalPerCup describe the dry food; kcalPerCan the wet food.
 */
export function plan(kcal: number, o: { treatPct: number; wetPct: number; kcalPerKg: number; kcalPerCup: number; kcalPerCan: number; meals: number }): Plan {
  const treats = kcal * (o.treatPct / 100)
  const food = kcal - treats
  const wetKcal = food * (o.wetPct / 100)
  const dryKcal = food - wetKcal
  const dryGrams = o.kcalPerKg > 0 ? (dryKcal / o.kcalPerKg) * 1000 : 0
  const dryCups = o.kcalPerCup > 0 ? dryKcal / o.kcalPerCup : 0
  const wetUnits = o.kcalPerCan > 0 ? wetKcal / o.kcalPerCan : 0
  const m = Math.max(1, Math.round(o.meals))
  return { kcal, treats, food, wetKcal, dryKcal, dryGrams, dryCups, wetUnits, perMeal: { grams: dryGrams / m, cups: dryCups / m, wet: wetUnits / m } }
}

/** Weeks to reach a target at a steady % of current body weight lost per week. */
export function weeksToTarget(kg: number, target: number, pctPerWeek: number): number {
  if (!(kg > target) || pctPerWeek <= 0) return 0
  return Math.ceil(Math.log(target / kg) / Math.log(1 - pctPerWeek / 100))
}
