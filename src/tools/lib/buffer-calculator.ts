// Buffer recipes via Henderson–Hasselbalch with temperature and (optional) Davies ionic-strength correction.

export interface Buffer {
  id: string; name: string; pKa: number; dT: number
  acid: string; acidMw: number; za: number // charge of the acid form
  base: string; baseMw: number
  counter: 'Na' | 'Cl' // counter-ion that balances the salt forms
}

/** pKa at 25 °C, dpKa/dT (per °C) from Good et al. 1966/1980, Goldberg et al. 2002 (J. Phys. Chem. Ref. Data 31:231). */
export const BUFFERS: Buffer[] = [
  { id: 'formate', name: 'Formate', pKa: 3.75, dT: 0.0, acid: 'Formic acid', acidMw: 46.03, za: 0, base: 'Sodium formate', baseMw: 68.01, counter: 'Na' },
  { id: 'acetate', name: 'Acetate', pKa: 4.76, dT: 0.0002, acid: 'Acetic acid (glacial)', acidMw: 60.05, za: 0, base: 'Sodium acetate trihydrate', baseMw: 136.08, counter: 'Na' },
  { id: 'mes', name: 'MES', pKa: 6.1, dT: -0.011, acid: 'MES free acid (monohydrate)', acidMw: 213.25, za: 0, base: 'MES sodium salt', baseMw: 217.22, counter: 'Na' },
  { id: 'bistris', name: 'Bis-Tris', pKa: 6.46, dT: -0.017, acid: 'Bis-Tris hydrochloride', acidMw: 245.7, za: 1, base: 'Bis-Tris', baseMw: 209.24, counter: 'Cl' },
  { id: 'pipes', name: 'PIPES', pKa: 6.76, dT: -0.0085, acid: 'PIPES monosodium', acidMw: 324.35, za: -1, base: 'PIPES disodium', baseMw: 346.33, counter: 'Na' },
  { id: 'imidazole', name: 'Imidazole', pKa: 6.95, dT: -0.02, acid: 'Imidazole hydrochloride', acidMw: 104.54, za: 1, base: 'Imidazole', baseMw: 68.08, counter: 'Cl' },
  { id: 'mops', name: 'MOPS', pKa: 7.2, dT: -0.015, acid: 'MOPS free acid', acidMw: 209.26, za: 0, base: 'MOPS sodium salt', baseMw: 231.25, counter: 'Na' },
  { id: 'phosphate', name: 'Sodium phosphate (pKa₂)', pKa: 7.2, dT: -0.0028, acid: 'NaH₂PO₄·H₂O', acidMw: 137.99, za: -1, base: 'Na₂HPO₄ (anhydrous)', baseMw: 141.96, counter: 'Na' },
  { id: 'hepes', name: 'HEPES', pKa: 7.48, dT: -0.014, acid: 'HEPES free acid', acidMw: 238.3, za: 0, base: 'HEPES sodium salt', baseMw: 260.29, counter: 'Na' },
  { id: 'tricine', name: 'Tricine', pKa: 8.05, dT: -0.021, acid: 'Tricine', acidMw: 179.17, za: 0, base: 'Tricine sodium salt', baseMw: 201.15, counter: 'Na' },
  { id: 'tris', name: 'Tris', pKa: 8.06, dT: -0.028, acid: 'Tris-HCl', acidMw: 157.6, za: 1, base: 'Tris base', baseMw: 121.14, counter: 'Cl' },
  { id: 'bicine', name: 'Bicine', pKa: 8.26, dT: -0.018, acid: 'Bicine', acidMw: 163.17, za: 0, base: 'Bicine sodium salt', baseMw: 185.15, counter: 'Na' },
  { id: 'ammonium', name: 'Ammonium', pKa: 9.25, dT: -0.031, acid: 'Ammonium chloride', acidMw: 53.49, za: 1, base: 'Ammonia (as NH₃)', baseMw: 17.03, counter: 'Cl' },
  { id: 'ches', name: 'CHES', pKa: 9.5, dT: -0.011, acid: 'CHES free acid', acidMw: 207.29, za: 0, base: 'CHES sodium salt', baseMw: 229.27, counter: 'Na' },
  { id: 'glycine', name: 'Glycine (pKa₂)', pKa: 9.78, dT: -0.025, acid: 'Glycine', acidMw: 75.07, za: 0, base: 'Sodium glycinate', baseMw: 97.05, counter: 'Na' },
  { id: 'carbonate', name: 'Carbonate (pKa₂)', pKa: 10.33, dT: -0.009, acid: 'Sodium bicarbonate', acidMw: 84.01, za: -1, base: 'Sodium carbonate (anhydrous)', baseMw: 105.99, counter: 'Na' },
  { id: 'caps', name: 'CAPS', pKa: 10.4, dT: -0.009, acid: 'CAPS free acid', acidMw: 221.32, za: 0, base: 'CAPS sodium salt', baseMw: 243.3, counter: 'Na' },
]

export const pKaAt = (b: Buffer, T: number) => b.pKa + b.dT * (T - 25)

/** Davies term with the Debye–Hückel A constant adjusted for temperature (≈0.509 at 25 °C). */
export function davies(I: number, T = 25) {
  const A = 0.4918 + 6.6098e-4 * T + 5.0231e-6 * T * T
  const s = Math.sqrt(I)
  return A * (s / (1 + s) - 0.3 * I)
}

/** Ionic strength (mol/L) of a mix of acid (ca) and base (cb) forms plus counter-ions, and added salt. */
export function ionicStrength(b: Buffer, ca: number, cb: number, salt = 0) {
  const za = b.za, zb = b.za - 1
  const charge = ca * za + cb * zb
  const counter = Math.abs(charge) // monovalent Na+ or Cl−
  return 0.5 * (ca * za * za + cb * zb * zb + counter) + salt
}

export interface Recipe { pKa: number; ratio: number; ca: number; cb: number; I: number; massAcid: number; massBase: number; titrant: number; titrantFrom: 'acid' | 'base'; beta: number; inRange: boolean }

/**
 * @param C total buffer concentration (mol/L), V volume (L), salt extra ionic strength (mol/L, e.g. NaCl)
 */
export function recipe(b: Buffer, pH: number, C: number, V: number, T: number, correct: boolean, salt = 0): Recipe {
  let pKa = pKaAt(b, T)
  let ca = C / 2, cb = C / 2, I = 0
  for (let k = 0; k < 30; k++) {
    I = ionicStrength(b, ca, cb, salt)
    const p = correct ? pKaAt(b, T) + (2 * b.za - 1) * davies(I, T) : pKaAt(b, T)
    pKa = p
    const r = 10 ** (pH - p)
    cb = (C * r) / (1 + r)
    ca = C - cb
  }
  const ratio = cb / ca
  const H = 10 ** -pH, Ka = 10 ** -pKa
  const beta = 2.303 * ((C * Ka * H) / (Ka + H) ** 2 + H + 1e-14 / H)
  // Titration route: sodium-salt systems start from the acid form + NaOH; chloride systems (Tris…) from the base + HCl
  const fromAcid = b.counter === 'Na'
  return { pKa, ratio, ca, cb, I, massAcid: ca * V * b.acidMw, massBase: cb * V * b.baseMw, titrant: (fromAcid ? cb : ca) * V, titrantFrom: fromAcid ? 'acid' : 'base', beta, inRange: Math.abs(pH - pKa) <= 1 }
}

/** pH of a mixture given moles of acid and base forms (inverse HH). */
export const phOf = (pKa: number, ca: number, cb: number) => pKa + Math.log10(cb / ca)
