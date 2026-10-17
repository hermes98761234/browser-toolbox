// Heart-rate training zones: max-HR estimates, Karvonen (heart-rate reserve) and %HRmax methods.

export type MaxFormula = 'fox' | 'tanaka' | 'gellish' | 'nes' | 'gulati' | 'measured'

export const MAX_FORMULAS: [MaxFormula, string][] = [
  ['tanaka', 'Tanaka (208 − 0.7·age)'],
  ['fox', 'Fox (220 − age)'],
  ['gellish', 'Gellish (207 − 0.7·age)'],
  ['nes', 'Nes (211 − 0.64·age)'],
  ['gulati', 'Gulati, women (206 − 0.88·age)'],
  ['measured', 'Measured / known max'],
]

export function maxHr(f: MaxFormula, age: number, measured = 0): number {
  switch (f) {
    case 'fox': return 220 - age
    case 'tanaka': return 208 - 0.7 * age
    case 'gellish': return 207 - 0.7 * age
    case 'nes': return 211 - 0.64 * age
    case 'gulati': return 206 - 0.88 * age
    default: return measured
  }
}

/** Karvonen: target = rest + intensity × (max − rest). */
export const karvonen = (max: number, rest: number, intensity: number) => rest + intensity * (max - rest)

export interface ZoneDef { name: string; lo: number; hi: number; color: string; purpose: string; feel: string }

export const ZONES: ZoneDef[] = [
  { name: 'Z1 Recovery', lo: 0.5, hi: 0.6, color: '#94a3b8', purpose: 'Warm-up, cool-down, active recovery', feel: 'Very easy, full conversation' },
  { name: 'Z2 Endurance', lo: 0.6, hi: 0.7, color: '#0ea5e9', purpose: 'Aerobic base, fat oxidation, capillary growth', feel: 'Easy, can talk in sentences' },
  { name: 'Z3 Tempo', lo: 0.7, hi: 0.8, color: '#10b981', purpose: 'Aerobic capacity, muscular endurance', feel: 'Moderate, short sentences' },
  { name: 'Z4 Threshold', lo: 0.8, hi: 0.9, color: '#f59e0b', purpose: 'Lactate threshold, race pace', feel: 'Hard, a few words' },
  { name: 'Z5 VO₂max', lo: 0.9, hi: 1.0, color: '#ef4444', purpose: 'Maximal aerobic power, speed', feel: 'All-out, no talking' },
]

export interface Zone extends ZoneDef { bpmLo: number; bpmHi: number }

export function zones(max: number, rest: number, method: 'karvonen' | 'percent'): Zone[] {
  return ZONES.map((z) => ({
    ...z,
    bpmLo: Math.round(method === 'karvonen' ? karvonen(max, rest, z.lo) : max * z.lo),
    bpmHi: Math.round(method === 'karvonen' ? karvonen(max, rest, z.hi) : max * z.hi),
  }))
}

/** Index of the zone containing `bpm`, −1 below Z1, ZONES.length above max. */
export function zoneOf(zs: Zone[], bpm: number): number {
  if (bpm < zs[0].bpmLo) return -1
  for (let i = 0; i < zs.length; i++) if (bpm < zs[i].bpmHi || i === zs.length - 1) return bpm > zs[i].bpmHi ? zs.length : i
  return zs.length
}

/** Intensity (fraction of heart-rate reserve) for a given bpm. */
export const hrrFraction = (max: number, rest: number, bpm: number) => (bpm - rest) / (max - rest || 1)
