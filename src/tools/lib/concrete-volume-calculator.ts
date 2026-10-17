// Concrete volume formulas per shape, waste, bag counts and unit conversions. Internally m³.

export type Sys = 'imperial' | 'metric'
export type ShapeId = 'slab' | 'footing' | 'column' | 'pier' | 'tube' | 'stairs' | 'circle'
/** 'long' = ft / m, 'short' = in / cm, 'n' = count. */
export interface Field { k: string; label: string; kind: 'long' | 'short' | 'n' }
export interface Shape { id: ShapeId; name: string; fields: Field[] }

export const SHAPES: Shape[] = [
  { id: 'slab', name: 'Slab / patio', fields: [{ k: 'l', label: 'Length', kind: 'long' }, { k: 'w', label: 'Width', kind: 'long' }, { k: 't', label: 'Thickness', kind: 'short' }] },
  { id: 'footing', name: 'Wall footing', fields: [{ k: 'l', label: 'Length', kind: 'long' }, { k: 'w', label: 'Width', kind: 'short' }, { k: 'd', label: 'Depth', kind: 'short' }] },
  { id: 'column', name: 'Round column', fields: [{ k: 'dia', label: 'Diameter', kind: 'short' }, { k: 'h', label: 'Height', kind: 'long' }, { k: 'n', label: 'How many', kind: 'n' }] },
  { id: 'pier', name: 'Square column / pad', fields: [{ k: 'a', label: 'Side A', kind: 'short' }, { k: 'b', label: 'Side B', kind: 'short' }, { k: 'h', label: 'Height', kind: 'long' }, { k: 'n', label: 'How many', kind: 'n' }] },
  { id: 'tube', name: 'Hollow tube', fields: [{ k: 'od', label: 'Outer diameter', kind: 'short' }, { k: 'id', label: 'Inner diameter', kind: 'short' }, { k: 'h', label: 'Height', kind: 'long' }, { k: 'n', label: 'How many', kind: 'n' }] },
  { id: 'circle', name: 'Round slab', fields: [{ k: 'dia', label: 'Diameter', kind: 'long' }, { k: 't', label: 'Thickness', kind: 'short' }] },
  { id: 'stairs', name: 'Stairs', fields: [{ k: 'w', label: 'Width', kind: 'long' }, { k: 'rise', label: 'Rise per step', kind: 'short' }, { k: 'run', label: 'Run (tread)', kind: 'short' }, { k: 'n', label: 'Steps', kind: 'n' }, { k: 'land', label: 'Top landing depth', kind: 'short' }] },
]
export const shapeById = (id: string) => SHAPES.find((s) => s.id === id) ?? SHAPES[0]

const FT = 0.3048, IN = 0.0254, M = 1, CM = 0.01
export const unitOf = (kind: Field['kind'], sys: Sys) => (kind === 'n' ? '' : sys === 'imperial' ? (kind === 'long' ? 'ft' : 'in') : kind === 'long' ? 'm' : 'cm')
const toM = (kind: Field['kind'], sys: Sys) => (kind === 'n' ? 1 : sys === 'imperial' ? (kind === 'long' ? FT : IN) : kind === 'long' ? M : CM)

/** Converts a field value between unit systems. */
export const convert = (v: number, kind: Field['kind'], from: Sys, to: Sys) => (kind === 'n' || from === to ? v : (v * toM(kind, from)) / toM(kind, to))

/** Volume in m³ of one element (dims in the given system). */
export function volume(shape: ShapeId, dims: Record<string, number>, sys: Sys): number {
  const sh = shapeById(shape)
  const d: Record<string, number> = {}
  for (const f of sh.fields) d[f.k] = Math.max(0, (dims[f.k] ?? 0) * toM(f.kind, sys))
  const n = Math.max(0, Math.round(dims.n ?? 1))
  switch (shape) {
    case 'slab': return d.l * d.w * d.t
    case 'footing': return d.l * d.w * d.d
    case 'column': return n * Math.PI * (d.dia / 2) ** 2 * d.h
    case 'pier': return n * d.a * d.b * d.h
    case 'tube': return n * Math.PI * Math.max(0, (d.od / 2) ** 2 - (d.id / 2) ** 2) * d.h
    case 'circle': return Math.PI * (d.dia / 2) ** 2 * d.t
    case 'stairs': {
      // step i (1-based from the bottom) is a solid block i risers tall and one run deep; the landing sits on top of all n risers
      const steps = d.rise * d.run * ((n * (n + 1)) / 2)
      return d.w * (steps + d.land * n * d.rise)
    }
  }
}

export const M3_PER_YD3 = 0.764554857984
export const M3_PER_FT3 = 0.028316846592
export const toYd3 = (m3: number) => m3 / M3_PER_YD3
export const toFt3 = (m3: number) => m3 / M3_PER_FT3

/** Premixed bag sizes and approximate yields. */
export const BAGS: { id: string; label: string; yieldM3: number; sys: Sys }[] = [
  { id: '40lb', label: '40 lb', yieldM3: 0.3 * M3_PER_FT3, sys: 'imperial' },
  { id: '50lb', label: '50 lb', yieldM3: 0.375 * M3_PER_FT3, sys: 'imperial' },
  { id: '60lb', label: '60 lb', yieldM3: 0.45 * M3_PER_FT3, sys: 'imperial' },
  { id: '80lb', label: '80 lb', yieldM3: 0.6 * M3_PER_FT3, sys: 'imperial' },
  { id: '20kg', label: '20 kg', yieldM3: 0.0095, sys: 'metric' },
  { id: '25kg', label: '25 kg', yieldM3: 0.012, sys: 'metric' },
  { id: '30kg', label: '30 kg', yieldM3: 0.0143, sys: 'metric' },
  { id: '40kg', label: '40 kg', yieldM3: 0.019, sys: 'metric' },
]

export const bagsNeeded = (m3: number, yieldM3: number) => (m3 > 0 ? Math.ceil(m3 / yieldM3 - 1e-9) : 0)
export const withWaste = (m3: number, wastePct: number) => m3 * (1 + Math.max(0, wastePct) / 100)
/** Ready-mix is ordered in steps (¼ yd³ or 0.25 m³ here, 0.5 m³ common in Europe). */
export const roundUp = (x: number, step: number) => (x > 0 ? Math.ceil(x / step - 1e-9) * step : 0)
/** Approximate fresh weight of normal-weight concrete. */
export const weightKg = (m3: number) => m3 * 2400
