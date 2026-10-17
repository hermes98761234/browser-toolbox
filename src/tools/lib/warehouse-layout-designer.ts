// Warehouse racking geometry: footprints, pallet capacity, aisle and clearance checks, auto-fill.

export interface Rack { id: string; name: string; x: number; z: number; along: 'x' | 'z'; bays: number; bayW: number; depth: number; levels: number; levelH: number; double: boolean }
export interface Zone { id: string; name: string; x: number; z: number; w: number; d: number; color: string }
export interface Floor { w: number; d: number; h: number }
export interface Rect { x: number; z: number; w: number; d: number }

export const FLUE = 0.3 // gap between back-to-back racks (m)
export const SPRINKLER_CLEARANCE = 0.45

export const EQUIPMENT: Record<string, number> = {
  'Counterbalance forklift': 3.6,
  'Reach truck': 2.8,
  'Pallet jack / stacker': 2.2,
  'Very-narrow-aisle (VNA) truck': 1.8,
}

export const rackDepth = (r: Rack) => (r.double ? r.depth * 2 + FLUE : r.depth)
export const rackLength = (r: Rack) => r.bays * r.bayW
export const rackHeight = (r: Rack) => r.levels * r.levelH
export function footprint(r: Rack): Rect {
  return r.along === 'x' ? { x: r.x, z: r.z, w: rackLength(r), d: rackDepth(r) } : { x: r.x, z: r.z, w: rackDepth(r), d: rackLength(r) }
}
export const positions = (r: Rack, perBay: number) => r.bays * r.levels * perBay * (r.double ? 2 : 1)

const overlap1 = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0)

export interface Issue { kind: 'collision' | 'aisle' | 'bounds' | 'height' | 'zone'; msg: string; ids: string[]; rect?: Rect }

export function checks(racks: Rack[], zones: Zone[], floor: Floor, minAisle: number): Issue[] {
  const out: Issue[] = []
  const fps = racks.map((r) => ({ r, f: footprint(r) }))
  for (const { r, f } of fps) {
    if (f.x < -1e-6 || f.z < -1e-6 || f.x + f.w > floor.w + 1e-6 || f.z + f.d > floor.d + 1e-6) out.push({ kind: 'bounds', msg: `${r.name} sticks out of the building`, ids: [r.id] })
    if (rackHeight(r) + SPRINKLER_CLEARANCE > floor.h) out.push({ kind: 'height', msg: `${r.name} is ${rackHeight(r).toFixed(1)} m tall — needs ${SPRINKLER_CLEARANCE} m below the ${floor.h} m ceiling`, ids: [r.id] })
    for (const z of zones) {
      if (overlap1(f.x, f.x + f.w, z.x, z.x + z.w) > 1e-6 && overlap1(f.z, f.z + f.d, z.z, z.z + z.d) > 1e-6) out.push({ kind: 'zone', msg: `${r.name} intrudes into ${z.name}`, ids: [r.id, z.id] })
    }
  }
  for (let i = 0; i < fps.length; i++) {
    for (let j = i + 1; j < fps.length; j++) {
      const a = fps[i].f, b = fps[j].f
      const ox = overlap1(a.x, a.x + a.w, b.x, b.x + b.w)
      const oz = overlap1(a.z, a.z + a.d, b.z, b.z + b.d)
      const ids = [fps[i].r.id, fps[j].r.id]
      const names = `${fps[i].r.name} / ${fps[j].r.name}`
      if (ox > 1e-6 && oz > 1e-6) { out.push({ kind: 'collision', msg: `${names} overlap`, ids }); continue }
      let gap = -1, rect: Rect | undefined
      if (ox > 1e-6) {
        const [lo, hi] = a.z < b.z ? [a, b] : [b, a]
        gap = hi.z - (lo.z + lo.d)
        rect = { x: Math.max(a.x, b.x), z: lo.z + lo.d, w: ox, d: gap }
      } else if (oz > 1e-6) {
        const [lo, hi] = a.x < b.x ? [a, b] : [b, a]
        gap = hi.x - (lo.x + lo.w)
        rect = { x: lo.x + lo.w, z: Math.max(a.z, b.z), w: gap, d: oz }
      }
      if (gap > 0.05 && gap < minAisle - 1e-6) out.push({ kind: 'aisle', msg: `Aisle ${names} is ${gap.toFixed(2)} m — needs ${minAisle} m`, ids, rect })
    }
  }
  return out
}

/** Fills the floor between `z0` and `z1` with rows along X: single row at each wall, back-to-back rows between, separated by aisles. */
export function autoFill(floor: Floor, o: { aisle: number; cross: number; bayW: number; depth: number; levels: number; levelH: number; z0: number; z1: number }): Rack[] {
  const bays = Math.floor((floor.w - 2 * o.cross) / o.bayW)
  if (bays < 1) return []
  const x = (floor.w - bays * o.bayW) / 2
  const racks: Rack[] = []
  let z = o.z0
  let n = 1
  const add = (double: boolean) => {
    racks.push({ id: `r${n}`, name: `Row ${n}`, x, z, along: 'x', bays, bayW: o.bayW, depth: o.depth, levels: o.levels, levelH: o.levelH, double })
    n++
    z += double ? o.depth * 2 + FLUE : o.depth
  }
  if (z + o.depth <= o.z1) add(false)
  while (z + o.aisle + o.depth * 2 + FLUE <= o.z1) {
    z += o.aisle
    add(true)
  }
  if (z + o.aisle + o.depth <= o.z1) {
    z += o.aisle
    add(false)
  }
  return racks
}
