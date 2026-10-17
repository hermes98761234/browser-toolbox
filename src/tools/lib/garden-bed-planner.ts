// Garden bed layout logic: plant data, spacing conflicts, grid auto-fill. Units: metres.

export type Shape = 'bush' | 'tall' | 'leafy' | 'root' | 'vine'

export interface PlantType { name: string; spacing: number; height: number; spread: number; color: string; shape: Shape; fruit?: string }

export const PLANTS: Record<string, PlantType> = {
  tomato: { name: 'Tomato', spacing: 0.6, height: 1.5, spread: 0.6, color: '#15803d', shape: 'tall', fruit: '#ef4444' },
  pepper: { name: 'Pepper', spacing: 0.45, height: 0.6, spread: 0.45, color: '#16a34a', shape: 'bush', fruit: '#f97316' },
  cucumber: { name: 'Cucumber', spacing: 0.3, height: 1.8, spread: 0.45, color: '#22c55e', shape: 'vine' },
  zucchini: { name: 'Zucchini', spacing: 0.9, height: 0.6, spread: 1.0, color: '#4d7c0f', shape: 'leafy', fruit: '#facc15' },
  bean: { name: 'Bush bean', spacing: 0.15, height: 0.5, spread: 0.2, color: '#65a30d', shape: 'bush' },
  lettuce: { name: 'Lettuce', spacing: 0.25, height: 0.2, spread: 0.25, color: '#84cc16', shape: 'leafy' },
  spinach: { name: 'Spinach', spacing: 0.15, height: 0.2, spread: 0.15, color: '#166534', shape: 'leafy' },
  kale: { name: 'Kale', spacing: 0.45, height: 0.6, spread: 0.45, color: '#3f6212', shape: 'bush' },
  carrot: { name: 'Carrot', spacing: 0.08, height: 0.3, spread: 0.08, color: '#4ade80', shape: 'root' },
  radish: { name: 'Radish', spacing: 0.05, height: 0.15, spread: 0.05, color: '#86efac', shape: 'root' },
  onion: { name: 'Onion', spacing: 0.1, height: 0.4, spread: 0.1, color: '#a3e635', shape: 'root' },
  basil: { name: 'Basil', spacing: 0.25, height: 0.45, spread: 0.3, color: '#22c55e', shape: 'bush' },
  strawberry: { name: 'Strawberry', spacing: 0.3, height: 0.2, spread: 0.3, color: '#15803d', shape: 'leafy', fruit: '#dc2626' },
  marigold: { name: 'Marigold', spacing: 0.25, height: 0.3, spread: 0.25, color: '#65a30d', shape: 'bush', fruit: '#f59e0b' },
}

/** Classic companion-planting pairs (traditional garden lore, not hard science). */
export const GOOD: [string, string][] = [['tomato', 'basil'], ['tomato', 'marigold'], ['carrot', 'onion'], ['lettuce', 'radish'], ['bean', 'cucumber'], ['strawberry', 'spinach'], ['pepper', 'basil'], ['cucumber', 'marigold']]
export const BAD: [string, string][] = [['bean', 'onion'], ['tomato', 'kale'], ['cucumber', 'basil'], ['tomato', 'cucumber'], ['strawberry', 'kale']]

export interface Bed { id: string; name: string; x: number; z: number; w: number; d: number; h: number }
export interface Plant { id: string; bed: string; type: string; u: number; v: number }

/** Minimum centre distance between two plants: average of their recommended spacings. */
export const minDist = (a: string, b: string) => ((PLANTS[a]?.spacing ?? 0.3) + (PLANTS[b]?.spacing ?? 0.3)) / 2

/** Ids of plants that are too close to a neighbour in the same bed or stick out of their bed. */
export function conflicts(plants: Plant[], beds: Bed[]): Set<string> {
  const bad = new Set<string>()
  const bedById = new Map(beds.map((b) => [b.id, b]))
  for (const p of plants) {
    const b = bedById.get(p.bed)
    if (!b || p.u < 0 || p.v < 0 || p.u > b.w || p.v > b.d) bad.add(p.id)
  }
  for (let i = 0; i < plants.length; i++)
    for (let j = i + 1; j < plants.length; j++) {
      const a = plants[i], c = plants[j]
      if (a.bed !== c.bed) continue
      if (Math.hypot(a.u - c.u, a.v - c.v) < minDist(a.type, c.type) - 1e-6) {
        bad.add(a.id)
        bad.add(c.id)
      }
    }
  return bad
}

/** Grid positions (bed-local) that fit `type` with its spacing, centred in the bed. */
export function gridSpots(bed: Pick<Bed, 'w' | 'd'>, type: string): [number, number][] {
  const s = PLANTS[type]?.spacing ?? 0.3
  const cols = Math.max(0, Math.floor(bed.w / s + 1e-9))
  const rows = Math.max(0, Math.floor(bed.d / s + 1e-9))
  const u0 = (bed.w - (cols - 1) * s) / 2
  const v0 = (bed.d - (rows - 1) * s) / 2
  const out: [number, number][] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([u0 + c * s, v0 + r * s])
  return out
}

/** Grid spots of `type` that keep spacing to the plants already in the bed. */
export function autoFill(bed: Bed, type: string, existing: Plant[]): [number, number][] {
  const inBed = existing.filter((p) => p.bed === bed.id)
  return gridSpots(bed, type).filter(([u, v]) => inBed.every((p) => Math.hypot(p.u - u, p.v - v) >= minDist(p.type, type) - 1e-6))
}

export function companions(types: string[]): { good: [string, string][]; bad: [string, string][] } {
  const has = new Set(types)
  const f = (l: [string, string][]) => l.filter(([a, b]) => has.has(a) && has.has(b))
  return { good: f(GOOD), bad: f(BAD) }
}

/** Soil volume of a bed in litres. */
export const soilLitres = (b: Pick<Bed, 'w' | 'd' | 'h'>) => b.w * b.d * b.h * 1000
