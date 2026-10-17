// Voltage drop in copper / aluminium conductors (single-phase, three-phase, DC).

export type Metal = 'cu' | 'al'
export type System = 'dc' | '1ph' | '3ph'

/** Resistivity at 20 °C (Ω·mm²/m) and temperature coefficient (1/K). */
export const METALS: Record<Metal, { name: string; rho20: number; alpha: number }> = {
  cu: { name: 'Copper', rho20: 0.017241, alpha: 0.00393 },
  al: { name: 'Aluminium', rho20: 0.028264, alpha: 0.00403 },
}

export function rho(metal: Metal, tempC: number): number {
  const m = METALS[metal]
  return m.rho20 * (1 + m.alpha * (tempC - 20))
}

/** AWG gauge (0 = 1/0, -1 = 2/0 …) → cross-section in mm². */
export function awgArea(n: number): number {
  const d = 0.127 * 92 ** ((36 - n) / 39)
  return (Math.PI / 4) * d * d
}
export const KCMIL_MM2 = 0.506707

export interface Size { label: string; mm2: number }

export const METRIC: Size[] = [1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400].map((a) => ({ label: `${a} mm²`, mm2: a }))
export const AWG: Size[] = [
  ...[18, 16, 14, 12, 10, 8, 6, 4, 3, 2, 1].map((n) => ({ label: `${n} AWG`, mm2: awgArea(n) })),
  ...[0, -1, -2, -3].map((n) => ({ label: `${1 - n}/0 AWG`, mm2: awgArea(n) })),
  ...[250, 300, 350, 400, 500, 600, 750].map((k) => ({ label: `${k} kcmil`, mm2: k * KCMIL_MM2 })),
]

export interface DropInput {
  system: System
  V: number // nominal voltage (line-to-line for 3ph)
  I: number // load current, A
  L: number // one-way length, m
  mm2: number // cross-section per conductor
  parallel: number // conductors in parallel per phase
  metal: Metal
  tempC: number
  pf: number // power factor (ignored for DC)
  x: number // reactance, Ω/km per conductor (ignored for DC)
}

export interface DropResult { R: number; Z: number; Vd: number; pct: number; Vend: number; loss: number }

/** Effective impedance per metre of one conductor: R·cosφ + X·sinφ. */
export function drop(i: DropInput): DropResult {
  const R = rho(i.metal, i.tempC) / (i.mm2 * Math.max(1, i.parallel)) // Ω/m
  const pf = i.system === 'dc' ? 1 : Math.min(1, Math.max(0, i.pf))
  const X = i.system === 'dc' ? 0 : i.x / 1000 / Math.max(1, i.parallel)
  const Z = R * pf + X * Math.sqrt(1 - pf * pf)
  const k = i.system === '3ph' ? Math.sqrt(3) : 2
  const Vd = k * i.I * i.L * Z
  const conductors = i.system === '3ph' ? 3 : 2
  return { R, Z, Vd, pct: (Vd / i.V) * 100, Vend: i.V - Vd, loss: conductors * i.I * i.I * R * i.L }
}

/** Current drawn by a load of P watts. */
export function currentFromPower(system: System, P: number, V: number, pf: number): number {
  if (system === 'dc') return P / V
  return system === '3ph' ? P / (Math.sqrt(3) * V * pf) : P / (V * pf)
}

/** Longest one-way run that keeps the drop at or below `limitPct`. */
export function maxLength(i: DropInput, limitPct: number): number {
  const d = drop({ ...i, L: 1 })
  return d.Vd > 0 ? ((limitPct / 100) * i.V) / d.Vd : Infinity
}
