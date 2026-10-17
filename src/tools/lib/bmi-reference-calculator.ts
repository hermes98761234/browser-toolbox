// BMI formulas and WHO reference categories.

export const LB = 0.45359237
export const IN = 0.0254

export const bmi = (kg: number, m: number) => (kg > 0 && m > 0 ? kg / (m * m) : NaN)
/** Imperial form: 703.0696 × lb / in². */
export const bmiImperial = (lb: number, inches: number) => bmi(lb * LB, inches * IN)
/** Ponderal index (kg/m³). */
export const ponderal = (kg: number, m: number) => (kg > 0 && m > 0 ? kg / m ** 3 : NaN)
/** Trefethen's "new BMI": 1.3 × kg / m^2.5. */
export const newBmi = (kg: number, m: number) => (kg > 0 && m > 0 ? (1.3 * kg) / m ** 2.5 : NaN)

export interface Cat { name: string; min: number; max: number; color: string; risk: string }

export const WHO: Cat[] = [
  { name: 'Underweight (severe thinness)', min: 0, max: 16, color: '#3b82f6', risk: 'High' },
  { name: 'Underweight (moderate thinness)', min: 16, max: 17, color: '#60a5fa', risk: 'Increased' },
  { name: 'Underweight (mild thinness)', min: 17, max: 18.5, color: '#93c5fd', risk: 'Increased' },
  { name: 'Normal weight', min: 18.5, max: 25, color: '#10b981', risk: 'Average' },
  { name: 'Overweight (pre-obese)', min: 25, max: 30, color: '#f59e0b', risk: 'Increased' },
  { name: 'Obesity class I', min: 30, max: 35, color: '#f97316', risk: 'Moderate' },
  { name: 'Obesity class II', min: 35, max: 40, color: '#ef4444', risk: 'Severe' },
  { name: 'Obesity class III', min: 40, max: Infinity, color: '#b91c1c', risk: 'Very severe' },
]

/** WHO expert consultation (2004) cut-offs often used for Asian populations. */
export const ASIAN: Cat[] = [
  { name: 'Underweight', min: 0, max: 18.5, color: '#60a5fa', risk: 'Increased' },
  { name: 'Normal weight', min: 18.5, max: 23, color: '#10b981', risk: 'Average' },
  { name: 'Overweight (increased risk)', min: 23, max: 27.5, color: '#f59e0b', risk: 'Increased' },
  { name: 'Obese (high risk)', min: 27.5, max: Infinity, color: '#ef4444', risk: 'High' },
]

export const category = (b: number, table: Cat[] = WHO) => table.find((c) => b >= c.min && b < c.max) ?? null

/** Weight range (kg) giving a "normal" BMI for the height. */
export const healthyRange = (m: number, table: Cat[] = WHO): [number, number] => {
  const n = table.find((c) => c.name === 'Normal weight')!
  return [n.min * m * m, n.max * m * m]
}
