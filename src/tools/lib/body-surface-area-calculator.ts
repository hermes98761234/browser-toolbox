// Body surface area (m²) from weight (kg) and height (cm) using published formulas.

export type Sex = 'female' | 'male'
export interface Formula { id: string; name: string; year: number; f: (w: number, h: number, sex: Sex) => number; expr: string; cite: string; note: string }

export const FORMULAS: Formula[] = [
  { id: 'mosteller', name: 'Mosteller', year: 1987, f: (w, h) => Math.sqrt((w * h) / 3600), expr: '√(H × W / 3600)', cite: 'Mosteller RD. Simplified calculation of body-surface area. N Engl J Med. 1987;317(17):1098.', note: 'Most widely used clinically (oncology dosing).' },
  { id: 'dubois', name: 'Du Bois & Du Bois', year: 1916, f: (w, h) => 0.007184 * w ** 0.425 * h ** 0.725, expr: '0.007184 × W^0.425 × H^0.725', cite: 'Du Bois D, Du Bois EF. A formula to estimate the approximate surface area if height and weight be known. Arch Intern Med. 1916;17:863–871.', note: 'Classic; derived from only 9 subjects, underestimates in obesity.' },
  { id: 'haycock', name: 'Haycock', year: 1978, f: (w, h) => 0.024265 * w ** 0.5378 * h ** 0.3964, expr: '0.024265 × W^0.5378 × H^0.3964', cite: 'Haycock GB, Schwartz GJ, Wisotsky DH. Geometric method for measuring body surface area. J Pediatr. 1978;93(1):62–66.', note: 'Validated in infants, children and adults.' },
  { id: 'gehan', name: 'Gehan & George', year: 1970, f: (w, h) => 0.0235 * w ** 0.51456 * h ** 0.42246, expr: '0.0235 × W^0.51456 × H^0.42246', cite: 'Gehan EA, George SL. Estimation of human body surface area from height and weight. Cancer Chemother Rep. 1970;54(4):225–235.', note: 'Fitted on 401 measurements; common in paediatric oncology.' },
  { id: 'boyd', name: 'Boyd', year: 1935, f: (w, h) => { const g = w * 1000; return 0.0003207 * h ** 0.3 * g ** (0.7285 - 0.0188 * Math.log10(g)) }, expr: '0.0003207 × H^0.3 × Wg^(0.7285 − 0.0188·log₁₀ Wg)', cite: 'Boyd E. The Growth of the Surface Area of the Human Body. University of Minnesota Press; 1935.', note: 'Weight in grams; good across a wide size range.' },
  { id: 'fujimoto', name: 'Fujimoto', year: 1968, f: (w, h) => 0.008883 * w ** 0.444 * h ** 0.663, expr: '0.008883 × W^0.444 × H^0.663', cite: 'Fujimoto S, Watanabe T, Sakamoto A, et al. Studies on the physical surface area of Japanese. Nippon Eiseigaku Zasshi. 1968;23(5):443–450.', note: 'Derived in a Japanese population.' },
  { id: 'schlich', name: 'Schlich', year: 2010, f: (w, h, s) => (s === 'female' ? 0.000975482 * w ** 0.46 * h ** 1.08 : 0.000579479 * w ** 0.38 * h ** 1.24), expr: '♀ 0.000975482 × W^0.46 × H^1.08 · ♂ 0.000579479 × W^0.38 × H^1.24', cite: 'Schlich E, Schumm M, Schlich M. 3-D-Body-Scan als anthropometrisches Verfahren zur Bestimmung der spezifischen Körperoberfläche. Ernährungs Umschau. 2010;57:178–183.', note: 'Sex-specific, from 3-D body scans.' },
]

export const bsa = (id: string, w: number, h: number, sex: Sex = 'female') => FORMULAS.find((f) => f.id === id)!.f(w, h, sex)
export const LB = 0.45359237
export const IN = 2.54
export const bmi = (w: number, h: number) => w / (h / 100) ** 2
