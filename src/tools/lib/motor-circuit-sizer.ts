// Motor branch-circuit sizing following NEC Article 430 (FLC tables 430.248 / 430.250, conductors 430.22,
// short-circuit/ground-fault protection 430.52, overloads 430.32, feeders 430.24 / 430.62) with
// conductor ampacity from Table 310.16 (shared with the wire gauge selector).
import { fillFactor, GAUGES, tempFactor, type Gauge, type Material, type Rating } from './wire-gauge-selector'

export type Phase = 1 | 3
export const HP_1PH = ['1/6', '1/4', '1/3', '1/2', '3/4', '1', '1-1/2', '2', '3', '5', '7-1/2', '10'] as const
export const V_1PH = [115, 200, 208, 230] as const
// Table 430.248 — single-phase AC motors, full-load current in amperes
const T248: number[][] = [
  [4.4, 2.5, 2.4, 2.2], [5.8, 3.3, 3.2, 2.9], [7.2, 4.1, 4.0, 3.6], [9.8, 5.6, 5.4, 4.9], [13.8, 7.9, 7.6, 6.9], [16, 9.2, 8.8, 8],
  [20, 11.5, 11, 10], [24, 13.8, 13.2, 12], [34, 19.6, 18.7, 17], [56, 32.2, 30.8, 28], [80, 46, 44, 40], [100, 57.5, 55, 50],
]
export const HP_3PH = ['1/2', '3/4', '1', '1-1/2', '2', '3', '5', '7-1/2', '10', '15', '20', '25', '30', '40', '50', '60', '75', '100', '125', '150', '200', '250', '300', '350', '400', '450', '500'] as const
export const V_3PH = [115, 200, 208, 230, 460, 575] as const
// Table 430.250 — three-phase induction (squirrel-cage and wound-rotor) motors, amperes; 0 = not listed
const T250: number[][] = [
  [4.4, 2.5, 2.4, 2.2, 1.1, 0.9], [6.4, 3.7, 3.5, 3.2, 1.6, 1.3], [8.4, 4.8, 4.6, 4.2, 2.1, 1.7], [12, 6.9, 6.6, 6, 3, 2.4], [13.6, 7.8, 7.5, 6.8, 3.4, 2.7],
  [0, 11, 10.6, 9.6, 4.8, 3.9], [0, 17.5, 16.7, 15.2, 7.6, 6.1], [0, 25.3, 24.2, 22, 11, 9], [0, 32.2, 30.8, 28, 14, 11], [0, 48.3, 46.2, 42, 21, 17],
  [0, 62.1, 59.4, 54, 27, 22], [0, 78.2, 74.8, 68, 34, 27], [0, 92, 88, 80, 40, 32], [0, 120, 114, 104, 52, 41], [0, 150, 143, 130, 65, 52],
  [0, 177, 169, 154, 77, 62], [0, 221, 211, 192, 96, 77], [0, 285, 273, 248, 124, 99], [0, 359, 343, 312, 156, 125], [0, 414, 396, 360, 180, 144],
  [0, 552, 528, 480, 240, 192], [0, 0, 0, 0, 302, 242], [0, 0, 0, 0, 361, 289], [0, 0, 0, 0, 414, 336], [0, 0, 0, 0, 477, 382], [0, 0, 0, 0, 515, 412], [0, 0, 0, 0, 590, 472],
]

/** Table full-load current, or NaN when the table has no value. */
export function flc(phase: Phase, hp: string, volts: number): number {
  const hps: readonly string[] = phase === 1 ? HP_1PH : HP_3PH
  const vs: readonly number[] = phase === 1 ? V_1PH : V_3PH
  const i = hps.indexOf(hp), j = vs.indexOf(volts)
  const v = i < 0 || j < 0 ? 0 : (phase === 1 ? T248 : T250)[i][j]
  return v || NaN
}

export const hpValue = (hp: string) => hp.split('-').reduce((a, p) => a + (p.includes('/') ? Number(p.split('/')[0]) / Number(p.split('/')[1]) : Number(p)), 0)

export type MotorType = 'sq' | 'designB' | 'sync' | 'wound'
export type Device = 'ntd' | 'td' | 'inst' | 'itb'
export const MOTOR_TYPES: [MotorType, string][] = [['sq', 'Single-phase / squirrel cage (other than Design B energy-efficient)'], ['designB', 'Design B energy-efficient / premium efficiency'], ['sync', 'Synchronous'], ['wound', 'Wound rotor']]
export const DEVICES: [Device, string][] = [['ntd', 'Non-time-delay fuse'], ['td', 'Dual-element (time-delay) fuse'], ['inst', 'Instantaneous-trip breaker'], ['itb', 'Inverse-time breaker']]

// Table 430.52(C)(1): maximum rating, % of FLC
const T52: Record<MotorType, Record<Device, number>> = {
  sq: { ntd: 300, td: 175, inst: 800, itb: 250 },
  designB: { ntd: 300, td: 175, inst: 1100, itb: 250 },
  sync: { ntd: 300, td: 175, inst: 800, itb: 250 },
  wound: { ntd: 150, td: 150, inst: 800, itb: 150 },
}
export const maxPct = (t: MotorType, d: Device) => T52[t][d]

/** 430.52(C)(1) Exception 2 upper limits when the motor will not start: % of FLC. */
export function ex2Pct(d: Device, flcA: number, t: MotorType): number {
  if (d === 'ntd') return 400
  if (d === 'td') return 225
  if (d === 'itb') return flcA <= 100 ? 400 : 300
  return t === 'designB' ? 1700 : 1300
}

// 240.6(A) standard ampere ratings
export const STD = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6000]
export const stdUp = (a: number) => STD.find((s) => s >= a - 1e-9) ?? NaN
export const stdDown = (a: number) => [...STD].reverse().find((s) => s <= a + 1e-9) ?? NaN

// Table 250.122 equipment grounding conductor by OCPD rating: [max A, Cu, Al]
const T122: [number, string, string][] = [
  [15, '14 AWG', '12 AWG'], [20, '12 AWG', '10 AWG'], [60, '10 AWG', '8 AWG'], [100, '8 AWG', '6 AWG'], [200, '6 AWG', '4 AWG'], [300, '4 AWG', '2 AWG'],
  [400, '3 AWG', '1 AWG'], [500, '2 AWG', '1/0 AWG'], [600, '1 AWG', '2/0 AWG'], [800, '1/0 AWG', '3/0 AWG'], [1000, '2/0 AWG', '4/0 AWG'], [1200, '3/0 AWG', '250 kcmil'],
]
export function egc(ocpd: number, m: Material): string {
  const r = T122.find((t) => ocpd <= t[0])
  return r ? (m === 'cu' ? r[1] : r[2]) : 'see Table 250.122'
}

export interface ConductorPick { gauge: Gauge | null; ampacity: number; required: number; limit: string }

/** Smallest conductor with ampacity ≥ required after correction (insulation column) and termination limit. */
export function pickConductor(required: number, m: Material, insulation: Rating, termination: Rating, ambientC: number, ccc: number): ConductorPick {
  const ci = insulation === 60 ? 0 : insulation === 75 ? 1 : 2
  const ct = termination === 60 ? 0 : termination === 75 ? 1 : 2
  const f = tempFactor(ambientC, insulation) * fillFactor(ccc)
  for (const g of GAUGES) {
    const t = m === 'cu' ? g.cu : g.al
    if (!t) continue
    const corrected = t[ci] * f
    const term = t[Math.min(ct, ci)]
    const amp = Math.min(corrected, term)
    if (amp >= required - 1e-9) return { gauge: g, ampacity: amp, required, limit: corrected < term ? 'correction/adjustment' : `${[60, 75, 90][Math.min(ct, ci)]} °C terminations` }
  }
  return { gauge: null, ampacity: 0, required, limit: 'exceeds 750 kcmil — use parallel sets' }
}

export interface MotorInputs {
  phase: Phase
  volts: number
  hp: string
  type: MotorType
  nameplate: number
  sf115: boolean
  rise40: boolean
  material: Material
  insulation: Rating
  termination: Rating
  ambient: number
  ccc: number
  lengthFt: number
}

export function sizeMotor(x: MotorInputs) {
  const I = flc(x.phase, x.hp, x.volts)
  const condReq = 1.25 * I
  const cond = pickConductor(condReq, x.material, x.insulation, x.termination, x.ambient, x.ccc)
  const ocpd = DEVICES.map(([d, name]) => {
    const pct = maxPct(x.type, d)
    const calc = (I * pct) / 100
    const ex2 = (I * ex2Pct(d, I, x.type)) / 100
    return { d, name, pct, calc, std: d === 'inst' ? calc : stdUp(calc), ex2Max: d === 'inst' ? ex2 : stdDown(ex2) }
  })
  const olPct = x.sf115 || x.rise40 ? 125 : 115
  const olMaxPct = x.sf115 || x.rise40 ? 140 : 130
  const fla = x.nameplate > 0 ? x.nameplate : I
  const r = cond.gauge ? (x.material === 'cu' ? cond.gauge.rCu : cond.gauge.rAl) : NaN
  const vd = ((x.phase === 3 ? Math.sqrt(3) : 2) * I * r * x.lengthFt) / 1000
  const itb = ocpd.find((o) => o.d === 'itb')!.std
  return {
    flc: I, condReq, cond, ocpd,
    overload: { pct: olPct, amps: (fla * olPct) / 100, maxPct: olMaxPct, maxAmps: (fla * olMaxPct) / 100, fla },
    disconnect: 1.15 * I,
    egc: egc(itb, x.material),
    vd, vdPct: (vd / x.volts) * 100,
  }
}

/** 430.24 feeder conductor ampacity and 430.62(A) maximum feeder OCPD for several motors. */
export function feeder(flcs: number[], branchOcpd: number[]) {
  if (!flcs.length) return { ampacity: 0, ocpdMax: 0, ocpdStd: NaN }
  const iL = flcs.indexOf(Math.max(...flcs))
  const sum = flcs.reduce((a, b) => a + b, 0)
  const ampacity = sum + 0.25 * flcs[iL]
  const jL = branchOcpd.indexOf(Math.max(...branchOcpd))
  const ocpdMax = branchOcpd[jL] + flcs.reduce((a, b, i) => a + (i === jL ? 0 : b), 0)
  return { ampacity, ocpdMax, ocpdStd: stdDown(ocpdMax) }
}
