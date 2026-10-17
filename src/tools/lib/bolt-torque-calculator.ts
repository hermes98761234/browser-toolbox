// Fastener preload & tightening torque: thread tables, tensile stress area, grades,
// short-form T = K·F·d and the long-form (Motosh / ISO 16047) friction breakdown.

export interface Thread { id: string; d: number /* mm */; p: number /* mm */; af: number /* across flats, mm */; system: 'metric' | 'inch'; tpi?: number }

const IN = 25.4
// [name, d mm, coarse pitch, fine pitch, across flats]
const M: [string, number, number, number, number][] = [
  ['M3', 3, 0.5, 0.35, 5.5], ['M4', 4, 0.7, 0.5, 7], ['M5', 5, 0.8, 0.5, 8], ['M6', 6, 1, 0.75, 10], ['M8', 8, 1.25, 1, 13],
  ['M10', 10, 1.5, 1.25, 16], ['M12', 12, 1.75, 1.25, 18], ['M14', 14, 2, 1.5, 21], ['M16', 16, 2, 1.5, 24], ['M18', 18, 2.5, 1.5, 27],
  ['M20', 20, 2.5, 1.5, 30], ['M22', 22, 2.5, 1.5, 32], ['M24', 24, 3, 2, 36], ['M27', 27, 3, 2, 41], ['M30', 30, 3.5, 2, 46], ['M36', 36, 4, 3, 55],
]
// [name, D in, UNC tpi, UNF tpi, across flats in]
const U: [string, number, number, number, number][] = [
  ['#6', 0.138, 32, 40, 5 / 16], ['#8', 0.164, 32, 36, 11 / 32], ['#10', 0.19, 24, 32, 3 / 8], ['1/4', 0.25, 20, 28, 7 / 16], ['5/16', 0.3125, 18, 24, 1 / 2],
  ['3/8', 0.375, 16, 24, 9 / 16], ['7/16', 0.4375, 14, 20, 5 / 8], ['1/2', 0.5, 13, 20, 3 / 4], ['9/16', 0.5625, 12, 18, 13 / 16], ['5/8', 0.625, 11, 18, 15 / 16],
  ['3/4', 0.75, 10, 16, 1.125], ['7/8', 0.875, 9, 14, 1.3125], ['1', 1, 8, 12, 1.5], ['1-1/8', 1.125, 7, 12, 1.6875], ['1-1/4', 1.25, 7, 12, 1.875], ['1-1/2', 1.5, 6, 12, 2.25],
]

export const THREADS: Thread[] = [
  ...M.flatMap(([n, d, pc, pf, af]) => [{ id: `${n}×${pc}`, d, p: pc, af, system: 'metric' as const }, { id: `${n}×${pf} fine`, d, p: pf, af, system: 'metric' as const }]),
  ...U.flatMap(([n, D, c, f, af]) => [{ id: `${n}-${c} UNC`, d: D * IN, p: IN / c, af: af * IN, system: 'inch' as const, tpi: c }, { id: `${n}-${f} UNF`, d: D * IN, p: IN / f, af: af * IN, system: 'inch' as const, tpi: f }]),
]

export interface Grade { id: string; name: string; proof: (d: number) => number /* MPa */; yield: (d: number) => number; system: 'metric' | 'inch' }
const KSI = 6.894757
export const GRADES: Grade[] = [
  { id: '4.6', name: 'Class 4.6', proof: () => 225, yield: () => 240, system: 'metric' },
  { id: '5.8', name: 'Class 5.8', proof: () => 380, yield: () => 400, system: 'metric' },
  { id: '8.8', name: 'Class 8.8', proof: (d) => (d <= 16 ? 580 : 600), yield: (d) => (d <= 16 ? 640 : 660), system: 'metric' },
  { id: '10.9', name: 'Class 10.9', proof: () => 830, yield: () => 940, system: 'metric' },
  { id: '12.9', name: 'Class 12.9', proof: () => 970, yield: () => 1100, system: 'metric' },
  { id: 'A2-70', name: 'Stainless A2-70', proof: () => 450, yield: () => 450, system: 'metric' },
  { id: 'A4-80', name: 'Stainless A4-80', proof: () => 600, yield: () => 600, system: 'metric' },
  { id: 'SAE2', name: 'SAE Grade 2', proof: (d) => (d <= 0.75 * IN + 0.01 ? 55 : 33) * KSI, yield: (d) => (d <= 0.75 * IN + 0.01 ? 57 : 36) * KSI, system: 'inch' },
  { id: 'SAE5', name: 'SAE Grade 5', proof: (d) => (d <= IN + 0.01 ? 85 : 74) * KSI, yield: (d) => (d <= IN + 0.01 ? 92 : 81) * KSI, system: 'inch' },
  { id: 'SAE8', name: 'SAE Grade 8', proof: () => 120 * KSI, yield: () => 130 * KSI, system: 'inch' },
  { id: 'A193B7', name: 'ASTM A193 B7', proof: () => 105 * KSI * 0.95, yield: () => 105 * KSI, system: 'inch' },
]

export const NUT_FACTORS: [string, number][] = [
  ['Dry, plain steel', 0.2], ['Zinc plated, dry', 0.2], ['Black oxide, oiled', 0.18], ['Lightly oiled', 0.16], ['Cadmium plated', 0.16],
  ['Anti-seize (copper/nickel)', 0.13], ['MoS₂ paste', 0.12], ['PTFE / wax coated', 0.1], ['Stainless, dry (galling risk)', 0.3],
]

/** Tensile stress area (mm²): ISO 898-1 π/4·(d − 0.9382·P)², ASME B1.1 π/4·(D − 0.9743·P)². */
export const stressArea = (t: Pick<Thread, 'd' | 'p' | 'system'>) => (Math.PI / 4) * (t.d - (t.system === 'inch' ? 0.9743 : 0.9382) * t.p) ** 2

/** Pitch diameter d2 = d − 0.6495·P (60° thread). */
export const pitchDia = (t: Pick<Thread, 'd' | 'p'>) => t.d - 0.649519 * t.p

/** Effective bearing diameter under the head: mean of across-flats and clearance hole (≈1.1 d). */
export const bearingDia = (t: Thread) => (t.af + 1.1 * t.d) / 2

/** Short form: T [N·m] = K · F [N] · d [mm] / 1000. */
export const torqueShort = (K: number, F: number, dmm: number) => (K * F * dmm) / 1000

/** Long form (ISO 16047): T = F·(P/2π + μt·d2/(2·cos30°) + μb·Db/2). Returns N·m and its three parts. */
export function torqueLong(t: Thread, F: number, muT: number, muB: number) {
  const pitch = (F * t.p) / (2 * Math.PI) / 1000
  const thread = (F * muT * pitchDia(t)) / (2 * Math.cos(Math.PI / 6)) / 1000
  const head = (F * muB * bearingDia(t)) / 2 / 1000
  return { total: pitch + thread + head, pitch, thread, head }
}

/** Equivalent nut factor for given friction coefficients. */
export const equivalentK = (t: Thread, muT: number, muB: number) => torqueLong(t, 1000, muT, muB).total / t.d

export const NM_TO_FTLB = 0.737562
export const N_TO_LBF = 0.224809
