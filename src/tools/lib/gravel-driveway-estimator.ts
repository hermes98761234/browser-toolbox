// Gravel driveway quantities: area, layer volumes (compacted → loose), tonnage, truckloads, cost.

export interface Material { id: string; name: string; density: number /* loose kg/m³ */; compaction: number /* loose ÷ compacted volume */; use: string }

export const MATERIALS: Material[] = [
  { id: 'n3', name: '#3 / #4 large stone (1½–3")', density: 1500, compaction: 1.1, use: 'sub-base' },
  { id: 'n57', name: '#57 crushed stone (¾–1")', density: 1450, compaction: 1.1, use: 'base / top' },
  { id: 'cr', name: 'Crusher run / road base (DGA)', density: 1700, compaction: 1.25, use: 'base' },
  { id: 'n411', name: '#411 (#57 + stone dust)', density: 1650, compaction: 1.2, use: 'top' },
  { id: 'rca', name: 'Recycled concrete aggregate', density: 1350, compaction: 1.2, use: 'sub-base / base' },
  { id: 'qp', name: 'Quarry process / screenings', density: 1600, compaction: 1.2, use: 'top' },
  { id: 'dg', name: 'Decomposed granite', density: 1550, compaction: 1.25, use: 'top' },
  { id: 'pea', name: 'Pea gravel (⅜")', density: 1520, compaction: 1.05, use: 'decorative top' },
  { id: 'river', name: 'River rock (¾–1½")', density: 1500, compaction: 1.05, use: 'decorative top' },
]
export const mat = (id: string) => MATERIALS.find((m) => m.id === id) ?? MATERIALS[1]

export interface Truck { id: string; name: string; tons: number /* short tons */; yd3: number }
export const TRUCKS: Truck[] = [
  { id: 'pickup', name: 'Pickup / trailer', tons: 1.5, yd3: 1.5 },
  { id: 'single', name: 'Single-axle dump', tons: 7, yd3: 5 },
  { id: 'tandem', name: 'Tandem-axle dump', tons: 14, yd3: 10 },
  { id: 'tri', name: 'Tri-axle dump', tons: 20, yd3: 15 },
  { id: 'semi', name: 'Semi end-dump', tons: 24, yd3: 20 },
]

export const FT = 0.3048
export const IN = 0.0254
export const YD3 = 0.764555 // m³
export const SHORT_TON = 907.185 // kg

export interface LayerResult { compacted: number /* m³ */; loose: number /* m³ */; kg: number }

/** Compacted depth × area gives in-place volume; multiply by the compaction factor for the loose volume to order. */
export function layer(area: number, depthM: number, m: Material, waste = 0): LayerResult {
  const compacted = area * depthM
  const loose = compacted * m.compaction * (1 + waste)
  return { compacted, loose, kg: loose * m.density }
}

/** Truckloads needed: limited by weight or by box volume, whichever runs out first. */
export function trucks(kg: number, looseM3: number, t: Truck): number {
  if (kg <= 0) return 0
  return Math.ceil(Math.max(kg / SHORT_TON / t.tons, looseM3 / YD3 / t.yd3) - 1e-9)
}
