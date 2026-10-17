// Body composition formulas. All lengths in cm, mass in kg.

export type Sex = 'male' | 'female'

export const bmi = (kg: number, cm: number) => (cm > 0 ? kg / (cm / 100) ** 2 : NaN)

/** US Navy circumference method (Hodgdon & Beckett 1984), metric form. Returns % body fat or NaN. */
export function navyBodyFat(sex: Sex, heightCm: number, neckCm: number, waistCm: number, hipCm = 0): number {
  if (sex === 'male') {
    const d = waistCm - neckCm
    if (!(d > 0) || !(heightCm > 0)) return NaN
    return 495 / (1.0324 - 0.19077 * Math.log10(d) + 0.15456 * Math.log10(heightCm)) - 450
  }
  const d = waistCm + hipCm - neckCm
  if (!(d > 0) || !(heightCm > 0)) return NaN
  return 495 / (1.29579 - 0.35004 * Math.log10(d) + 0.221 * Math.log10(heightCm)) - 450
}

/** Deurenberg et al. 1991: body fat % estimated from BMI, age and sex (adults). */
export const bmiBodyFat = (sex: Sex, b: number, age: number) => 1.2 * b + 0.23 * age - 10.8 * (sex === 'male' ? 1 : 0) - 5.4

/** Mifflin–St Jeor resting energy, kcal/day. */
export const mifflinBmr = (sex: Sex, kg: number, cm: number, age: number) => 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161)

/** Katch–McArdle resting energy from lean mass, kcal/day. */
export const katchBmr = (leanKg: number) => 370 + 21.6 * leanKg

/** Devine ideal body weight, kg. */
export const devineIbw = (sex: Sex, cm: number) => (sex === 'male' ? 50 : 45.5) + 2.3 * (cm / 2.54 - 60)

export interface Band { label: string; from: number; to: number; color: string }

export const BMI_BANDS: Band[] = [
  { label: 'Underweight', from: 12, to: 18.5, color: '#0ea5e9' },
  { label: 'Healthy', from: 18.5, to: 25, color: '#10b981' },
  { label: 'Overweight', from: 25, to: 30, color: '#f59e0b' },
  { label: 'Obesity I', from: 30, to: 35, color: '#f97316' },
  { label: 'Obesity II+', from: 35, to: 45, color: '#ef4444' },
]

/** American Council on Exercise body-fat categories. */
export function fatBands(sex: Sex): Band[] {
  const m = sex === 'male'
  return [
    { label: 'Essential', from: m ? 2 : 10, to: m ? 6 : 14, color: '#0ea5e9' },
    { label: 'Athletes', from: m ? 6 : 14, to: m ? 14 : 21, color: '#14b8a6' },
    { label: 'Fitness', from: m ? 14 : 21, to: m ? 18 : 25, color: '#10b981' },
    { label: 'Average', from: m ? 18 : 25, to: m ? 25 : 32, color: '#f59e0b' },
    { label: 'Obese', from: m ? 25 : 32, to: m ? 40 : 48, color: '#ef4444' },
  ]
}

export function bandOf(bands: Band[], v: number): Band | undefined {
  if (!Number.isFinite(v)) return undefined
  if (v < bands[0].from) return bands[0]
  return bands.find((b) => v >= b.from && v < b.to) ?? bands[bands.length - 1]
}

export const IN = 2.54
export const LB = 0.45359237
