// Battery pack math: series/parallel configuration, energy, current limits, sag, runtime, mass.

export type Shape = 'cyl' | 'prism'
export interface Cell {
  id: string
  name: string
  chem: string
  vNom: number
  vMax: number
  vMin: number
  /** Capacity, Ah. */
  ah: number
  /** Max continuous discharge, A. */
  iMax: number
  /** DC internal resistance, mΩ. */
  rMilli: number
  /** Mass, g. */
  g: number
  shape: Shape
  /** Cylinder: [diameter, length]; prism/pouch: [width, thickness, height], mm. */
  dims: number[]
}

// Typical datasheet-class values for common formats (not a specific product). Always check your cell's datasheet.
export const CELLS: Cell[] = [
  { id: '18650-p', name: '18650 Li-ion, high-drain 3.0 Ah', chem: 'NMC', vNom: 3.6, vMax: 4.2, vMin: 2.5, ah: 3.0, iMax: 15, rMilli: 15, g: 47, shape: 'cyl', dims: [18.4, 65] },
  { id: '18650-e', name: '18650 Li-ion, high-energy 3.5 Ah', chem: 'NMC', vNom: 3.6, vMax: 4.2, vMin: 2.5, ah: 3.5, iMax: 8, rMilli: 30, g: 48, shape: 'cyl', dims: [18.4, 65] },
  { id: '21700-e', name: '21700 Li-ion, high-energy 5.0 Ah', chem: 'NMC', vNom: 3.6, vMax: 4.2, vMin: 2.5, ah: 5.0, iMax: 10, rMilli: 18, g: 70, shape: 'cyl', dims: [21.2, 70] },
  { id: '21700-p', name: '21700 Li-ion, high-power 4.0 Ah', chem: 'NMC', vNom: 3.6, vMax: 4.2, vMin: 2.5, ah: 4.0, iMax: 30, rMilli: 10, g: 67, shape: 'cyl', dims: [21.2, 70] },
  { id: '26650-lfp', name: '26650 LiFePO4 3.0 Ah', chem: 'LFP', vNom: 3.2, vMax: 3.65, vMin: 2.5, ah: 3.0, iMax: 9, rMilli: 20, g: 85, shape: 'cyl', dims: [26, 65] },
  { id: '32700-lfp', name: '32700 LiFePO4 6.0 Ah', chem: 'LFP', vNom: 3.2, vMax: 3.65, vMin: 2.5, ah: 6.0, iMax: 18, rMilli: 10, g: 140, shape: 'cyl', dims: [32, 70] },
  { id: 'lfp-100', name: 'Prismatic LiFePO4 100 Ah', chem: 'LFP', vNom: 3.2, vMax: 3.65, vMin: 2.5, ah: 100, iMax: 100, rMilli: 0.5, g: 2000, shape: 'prism', dims: [130, 36, 200] },
  { id: 'lfp-280', name: 'Prismatic LiFePO4 280 Ah', chem: 'LFP', vNom: 3.2, vMax: 3.65, vMin: 2.5, ah: 280, iMax: 140, rMilli: 0.25, g: 5300, shape: 'prism', dims: [174, 72, 207] },
  { id: 'lipo-5', name: 'LiPo pouch 5.0 Ah', chem: 'LiPo', vNom: 3.7, vMax: 4.2, vMin: 3.0, ah: 5.0, iMax: 50, rMilli: 3, g: 100, shape: 'prism', dims: [45, 10, 140] },
  { id: 'nimh-aa', name: 'NiMH AA 2.0 Ah', chem: 'NiMH', vNom: 1.2, vMax: 1.45, vMin: 1.0, ah: 2.0, iMax: 2, rMilli: 30, g: 27, shape: 'cyl', dims: [14.5, 50.5] },
]

export interface Inputs {
  cell: Cell
  s: number
  p: number
  /** Load: watts when mode is 'W', amps when 'A'. */
  load: number
  mode: 'W' | 'A'
  /** Usable depth of discharge, %. */
  dod: number
  /** Converter / wiring efficiency, %. */
  eff: number
  /** Extra mass for BMS, wiring, enclosure, % of cell mass. */
  overhead: number
  /** Gap between cells, mm (holders, spacing). */
  gap: number
}

export interface Result {
  cells: number
  vNom: number
  vMax: number
  vMin: number
  ah: number
  wh: number
  usableWh: number
  iMax: number
  pMax: number
  rPack: number
  current: number
  power: number
  cRate: number
  perCellA: number
  sagV: number
  vLoad: number
  heatW: number
  runtimeH: number
  massKg: number
  whPerKg: number
  size: [number, number, number]
  warnings: string[]
}

export function compute(x: Inputs): Result {
  const c = x.cell
  const s = Math.max(1, Math.round(x.s)), p = Math.max(1, Math.round(x.p))
  const vNom = s * c.vNom, vMax = s * c.vMax, vMin = s * c.vMin
  const ah = p * c.ah, wh = vNom * ah
  const usableWh = wh * (x.dod / 100)
  const iMax = p * c.iMax
  const rPack = (s * c.rMilli) / p / 1000
  // current drawn from the pack: for a power load the converter loss is added on top
  const power = x.mode === 'W' ? x.load / (x.eff / 100) : x.load * vNom
  const current = x.mode === 'W' ? power / vNom : x.load
  const sagV = current * rPack
  const heatW = current * current * rPack
  const deliveredW = x.mode === 'W' ? x.load : power * (x.eff / 100)
  const runtimeH = deliveredW > 0 ? (usableWh * (x.eff / 100)) / deliveredW : Infinity
  const cellKg = (s * p * c.g) / 1000
  const massKg = cellKg * (1 + x.overhead / 100)
  const g = x.gap
  const size: [number, number, number] = c.shape === 'cyl'
    ? [s * c.dims[0] + (s - 1) * g, p * c.dims[0] + (p - 1) * g, c.dims[1]]
    : [s * c.dims[1] + (s - 1) * g, p * c.dims[0] + (p - 1) * g, c.dims[2]]
  const warnings: string[] = []
  const perCellA = current / p
  if (current > iMax) warnings.push(`Load current ${current.toFixed(1)} A exceeds the pack's continuous rating ${iMax.toFixed(0)} A — add parallel cells or pick a higher-drain cell.`)
  else if (current > 0.8 * iMax) warnings.push('Load is above 80 % of the continuous rating; expect heating and shorter cycle life.')
  if (vNom > 0 && sagV / vNom > 0.08) warnings.push(`Voltage sag of ${sagV.toFixed(2)} V (${((sagV / vNom) * 100).toFixed(0)} %) at this load — the low-voltage cutoff will be reached early.`)
  if (vMax > 60) warnings.push('Pack voltage above 60 V DC is generally treated as hazardous voltage — insulation, fusing and handling rules get stricter.')
  if (s > 1 && c.chem !== 'NiMH') warnings.push(`Use a ${s}S BMS for balancing and over/under-voltage, over-current and temperature protection.`)
  return { cells: s * p, vNom, vMax, vMin, ah, wh, usableWh, iMax, pMax: iMax * vNom, rPack, current, power, cRate: c.ah ? perCellA / c.ah : 0, perCellA, sagV, vLoad: vNom - sagV, heatW, runtimeH, massKg, whPerKg: massKg ? wh / massKg : 0, size, warnings }
}

/** Smallest S×P meeting a target voltage, runtime and peak current. */
export function suggest(cell: Cell, targetV: number, loadW: number, hours: number, peakA: number, dod: number, eff: number): { s: number; p: number } {
  const s = Math.max(1, Math.round(targetV / cell.vNom))
  const vNom = s * cell.vNom
  const needWh = (loadW * hours) / (eff / 100) / (dod / 100)
  const byEnergy = Math.ceil(needWh / (vNom * cell.ah) - 1e-9)
  const byCurrent = Math.ceil(Math.max(peakA, loadW / (eff / 100) / vNom) / cell.iMax - 1e-9)
  return { s, p: Math.max(1, byEnergy, byCurrent) }
}

/** Runtime (h) as a function of load power, for charting. */
export function runtimeCurve(x: Inputs, maxW: number, n = 40): [number, number][] {
  const out: [number, number][] = []
  for (let i = 1; i <= n; i++) {
    const w = (maxW * i) / n
    out.push([w, compute({ ...x, mode: 'W', load: w }).runtimeH])
  }
  return out
}

export const fmtH = (h: number) => {
  if (!Number.isFinite(h)) return '∞'
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 48) return `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min`
  return `${(h / 24).toFixed(1)} days`
}
