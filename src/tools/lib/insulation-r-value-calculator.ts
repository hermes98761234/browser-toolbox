// Wall/roof assembly R-value: layer stack, parallel-path framing correction, U-factor, heat loss,
// temperature profile and indoor dew point. Material values are typical published figures
// (manufacturer data sheets and building-science handbooks); real products vary — check labels.
// Imperial R (ft²·°F·h/BTU) internally; RSI = R × 0.1761.

export const RSI = 0.17611

export interface Mat { id: string; name: string; perIn?: number; fixed?: number; mm: number; cat: 'film' | 'board' | 'insul' | 'struct' | 'clad' | 'masonry' | 'air' }

export const MATS: Mat[] = [
  { id: 'film-in', name: 'Inside air film (wall)', fixed: 0.68, mm: 0, cat: 'film' },
  { id: 'film-out', name: 'Outside air film (windy)', fixed: 0.17, mm: 0, cat: 'film' },
  { id: 'film-ceil', name: 'Inside air film (ceiling, heat up)', fixed: 0.61, mm: 0, cat: 'film' },
  { id: 'gyp', name: 'Gypsum board', perIn: 0.9, mm: 12.7, cat: 'board' },
  { id: 'plaster', name: 'Lime / gypsum plaster', perIn: 0.2, mm: 20, cat: 'board' },
  { id: 'osb', name: 'OSB sheathing', perIn: 1.24, mm: 11, cat: 'struct' },
  { id: 'ply', name: 'Plywood', perIn: 1.25, mm: 12, cat: 'struct' },
  { id: 'wood', name: 'Softwood lumber', perIn: 1.25, mm: 89, cat: 'struct' },
  { id: 'fg', name: 'Fiberglass batt (R-13 in 3½″)', perIn: 3.7, mm: 89, cat: 'insul' },
  { id: 'fg-hd', name: 'Fiberglass batt, high density (R-15)', perIn: 4.3, mm: 89, cat: 'insul' },
  { id: 'mw', name: 'Mineral wool batt', perIn: 4.0, mm: 89, cat: 'insul' },
  { id: 'cell', name: 'Cellulose, dense-pack', perIn: 3.7, mm: 89, cat: 'insul' },
  { id: 'cell-loose', name: 'Cellulose, loose-fill attic', perIn: 3.4, mm: 250, cat: 'insul' },
  { id: 'ocsf', name: 'Open-cell spray foam', perIn: 3.7, mm: 89, cat: 'insul' },
  { id: 'ccsf', name: 'Closed-cell spray foam', perIn: 6.5, mm: 50, cat: 'insul' },
  { id: 'eps', name: 'EPS rigid foam', perIn: 4.0, mm: 25, cat: 'insul' },
  { id: 'xps', name: 'XPS rigid foam', perIn: 5.0, mm: 25, cat: 'insul' },
  { id: 'iso', name: 'Polyiso foam (foil faced)', perIn: 6.0, mm: 25, cat: 'insul' },
  { id: 'mwb', name: 'Mineral wool board', perIn: 4.2, mm: 38, cat: 'insul' },
  { id: 'wfb', name: 'Wood-fibre board', perIn: 2.6, mm: 60, cat: 'insul' },
  { id: 'cork', name: 'Expanded cork board', perIn: 3.6, mm: 50, cat: 'insul' },
  { id: 'straw', name: 'Straw bale (across)', perIn: 1.45, mm: 450, cat: 'insul' },
  { id: 'aero', name: 'Aerogel blanket', perIn: 10, mm: 10, cat: 'insul' },
  { id: 'gap', name: 'Air gap ≥ 19 mm (vented rainscreen)', fixed: 0.9, mm: 19, cat: 'air' },
  { id: 'gap-ref', name: 'Air gap with reflective foil', fixed: 2.8, mm: 19, cat: 'air' },
  { id: 'wrap', name: 'Housewrap / membrane', fixed: 0, mm: 0.5, cat: 'board' },
  { id: 'vinyl', name: 'Vinyl siding', fixed: 0.61, mm: 10, cat: 'clad' },
  { id: 'wsid', name: 'Wood siding (bevel)', fixed: 0.8, mm: 13, cat: 'clad' },
  { id: 'fcs', name: 'Fibre-cement siding', fixed: 0.15, mm: 8, cat: 'clad' },
  { id: 'stucco', name: 'Stucco / render', perIn: 0.2, mm: 22, cat: 'clad' },
  { id: 'brick', name: 'Brick (face)', perIn: 0.11, mm: 90, cat: 'masonry' },
  { id: 'brick-c', name: 'Brick (common)', perIn: 0.2, mm: 100, cat: 'masonry' },
  { id: 'conc', name: 'Concrete, normal weight', perIn: 0.08, mm: 200, cat: 'masonry' },
  { id: 'cmu', name: 'Concrete block 8″ hollow', fixed: 1.11, mm: 190, cat: 'masonry' },
  { id: 'aac', name: 'Autoclaved aerated concrete', perIn: 1.25, mm: 200, cat: 'masonry' },
  { id: 'stone', name: 'Stone', perIn: 0.08, mm: 300, cat: 'masonry' },
]
export const matById = (id: string) => MATS.find((m) => m.id === id) ?? MATS[0]

export interface Layer { id: string; mat: string; mm: number; cavity?: boolean }

export const layerR = (l: Pick<Layer, 'mat' | 'mm'>) => {
  const m = matById(l.mat)
  return m.fixed ?? ((m.perIn ?? 0) * l.mm) / 25.4
}

export type Framing = 'wood' | 'steel' | 'none'

export interface Result {
  rCavityPath: number
  rFramePath: number
  rNominal: number // sum of layer R with cavity insulation only (what labels advertise)
  rEff: number
  u: number
  bridging: number // fraction of nominal R lost
}

/**
 * Parallel-path method: two heat paths through the same layers, one with the cavity insulation and
 * one through the framing member; U = f/R_frame + (1−f)/R_cavity. Steel studs bridge far more than
 * the parallel path predicts, so the cavity R is multiplied by a correction factor (ASHRAE-style ≈ 0.5).
 */
export function assembly(layers: Layer[], framing: Framing, fraction: number, steelFactor = 0.5): Result {
  const cav = layers.reduce((a, l) => a + layerR(l), 0)
  const hasCavity = layers.some((l) => l.cavity)
  if (!hasCavity || framing === 'none' || fraction <= 0) return { rCavityPath: cav, rFramePath: cav, rNominal: cav, rEff: cav, u: 1 / cav, bridging: 0 }
  if (framing === 'steel') {
    const r = layers.reduce((a, l) => a + (l.cavity ? layerR(l) * steelFactor : layerR(l)), 0)
    return { rCavityPath: cav, rFramePath: r, rNominal: cav, rEff: r, u: 1 / r, bridging: 1 - r / cav }
  }
  const fr = layers.reduce((a, l) => a + (l.cavity ? layerR({ mat: 'wood', mm: l.mm }) : layerR(l)), 0)
  const f = Math.min(1, fraction)
  const u = f / fr + (1 - f) / cav
  return { rCavityPath: cav, rFramePath: fr, rNominal: cav, rEff: 1 / u, u, bridging: 1 - 1 / u / cav }
}

/** Interface temperatures through the cavity path, inside → outside (same unit as inputs). */
export function profile(layers: Layer[], tIn: number, tOut: number): number[] {
  const rs = layers.map(layerR)
  const tot = rs.reduce((a, b) => a + b, 0) || 1
  const out = [tIn]
  let acc = 0
  for (const r of rs) {
    acc += r
    out.push(tIn - ((tIn - tOut) * acc) / tot)
  }
  return out
}

/** Dew point (°C) from air temperature (°C) and relative humidity (%) — Magnus formula. */
export function dewPoint(tC: number, rh: number): number {
  const a = 17.62, b = 243.12
  const g = Math.log(Math.max(1, rh) / 100) + (a * tC) / (b + tC)
  return (b * g) / (a - g)
}

export const fToC = (f: number) => ((f - 32) * 5) / 9
export const cToF = (c: number) => (c * 9) / 5 + 32

/** Peak loss (BTU/h) and annual loss (kWh) from U (imperial), area ft², ΔT °F and heating degree-days (°F·day). */
export function heatLoss(u: number, areaFt2: number, dTf: number, hddF: number) {
  const btuh = u * areaFt2 * dTf
  const annualBtu = u * areaFt2 * hddF * 24
  return { btuh, watts: btuh * 0.29307107, annualKwh: annualBtu / 3412.142 }
}
