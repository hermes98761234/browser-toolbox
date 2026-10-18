// Ideal body weight formulas (kg), height in cm. Each formula is linear in inches over 5 feet.
export type Sex = 'male' | 'female'
export const IN = 2.54
export const LB = 0.45359237

export interface FormulaDef { id: string; name: string; year: number; male: [number, number]; female: [number, number]; note: string }
export const FORMULAS: FormulaDef[] = [
  { id: 'devine', name: 'Devine', year: 1974, male: [50, 2.3], female: [45.5, 2.3], note: 'Most widely used clinically (drug dosing, ventilator settings).' },
  { id: 'robinson', name: 'Robinson', year: 1983, male: [52, 1.9], female: [49, 1.7], note: 'Revision of Devine based on Metropolitan Life tables.' },
  { id: 'miller', name: 'Miller', year: 1983, male: [56.2, 1.41], female: [53.1, 1.36], note: 'Flatter slope — higher values for short, lower for tall people.' },
  { id: 'hamwi', name: 'Hamwi', year: 1964, male: [48, 2.7], female: [45.5, 2.2], note: 'Dietetics rule of thumb; ±10% for large/small frame.' },
]

export const inchesOver5ft = (cm: number) => cm / IN - 60

export function ibw(f: FormulaDef, sex: Sex, cm: number): number {
  const [base, per] = f[sex]
  return base + per * inchesOver5ft(cm)
}

/** BMI-based targets: healthy range 18.5–24.9 and the BMI 22 reference (Lemmens 2005). */
export function bmiWeights(cm: number) {
  const m2 = (cm / 100) ** 2
  return { low: 18.5 * m2, high: 24.9 * m2, bmi22: 22 * m2 }
}

/** Adjusted body weight: IBW + factor × (actual − IBW); factor 0.4 is the usual dosing convention. */
export const adjustedBW = (ideal: number, actual: number, factor = 0.4) => ideal + factor * (actual - ideal)

/** Lean body weight (Janmahasatian 2005). */
export function leanBW(sex: Sex, kg: number, cm: number): number {
  const bmi = kg / (cm / 100) ** 2
  return sex === 'male' ? (9270 * kg) / (6680 + 216 * bmi) : (9270 * kg) / (8780 + 244 * bmi)
}

export const ftInToCm = (ft: number, inch: number) => (ft * 12 + inch) * IN
export function cmToFtIn(cm: number): [number, number] {
  const total = cm / IN
  let ft = Math.floor(total / 12)
  let inch = Math.round((total - ft * 12) * 10) / 10
  if (inch >= 12) { ft++; inch -= 12 }
  return [ft, inch]
}
