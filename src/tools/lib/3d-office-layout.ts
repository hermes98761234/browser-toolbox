// Office floor-plan logic: furniture catalogue, seat counts, space metrics and walk-mode
// collision. Footprint, overlap and walkway geometry are shared with the 3D store planner.
import { aisles as storeAisles, clampFix as storeClamp, foot, overlaps as storeOverlaps, type Aisle, type Fixture } from './3d-store-planner'

export { foot, type Aisle }

export type Kind =
  | 'desk' | 'ldesk' | 'bench' | 'meet6' | 'meet10' | 'round' | 'sofa' | 'armchair' | 'coffee'
  | 'storage' | 'shelf' | 'filing' | 'partition' | 'glass' | 'plant' | 'printer' | 'kitchen' | 'booth' | 'board'
export type Use = 'work' | 'meet' | 'lounge' | 'support' | 'divider'

export interface Item { id: string; kind: Kind; name: string; w: number; d: number; h: number; x: number; z: number; rot: number; color: string }
export interface Room { w: number; d: number; h: number; door: number; doorW: number }

export const CATALOG: Record<Kind, { name: string; w: number; d: number; h: number; color: string; seats: number; use: Use }> = {
  desk: { name: 'Workstation 160', w: 1.6, d: 1.4, h: 0.75, color: '#e7e5e4', seats: 1, use: 'work' },
  ldesk: { name: 'L-desk 180', w: 1.8, d: 1.6, h: 0.75, color: '#d6d3d1', seats: 1, use: 'work' },
  bench: { name: 'Bench desk ×4', w: 3.2, d: 2.9, h: 0.75, color: '#f5f5f4', seats: 4, use: 'work' },
  meet6: { name: 'Meeting table 6', w: 2.6, d: 2.5, h: 0.75, color: '#78716c', seats: 6, use: 'meet' },
  meet10: { name: 'Board table 10', w: 4.2, d: 2.6, h: 0.75, color: '#57534e', seats: 10, use: 'meet' },
  round: { name: 'Round table 4', w: 2.2, d: 2.2, h: 0.75, color: '#a8a29e', seats: 4, use: 'meet' },
  sofa: { name: 'Sofa 3-seat', w: 2.1, d: 0.9, h: 0.8, color: '#0d9488', seats: 3, use: 'lounge' },
  armchair: { name: 'Lounge chair', w: 0.85, d: 0.85, h: 0.8, color: '#f59e0b', seats: 1, use: 'lounge' },
  coffee: { name: 'Coffee table', w: 1.1, d: 0.6, h: 0.42, color: '#a16207', seats: 0, use: 'lounge' },
  storage: { name: 'Storage cabinet', w: 1.2, d: 0.45, h: 1.2, color: '#cbd5e1', seats: 0, use: 'support' },
  shelf: { name: 'Bookshelf', w: 0.9, d: 0.35, h: 2.0, color: '#92400e', seats: 0, use: 'support' },
  filing: { name: 'Filing cabinet', w: 0.45, d: 0.6, h: 1.3, color: '#94a3b8', seats: 0, use: 'support' },
  partition: { name: 'Acoustic screen', w: 1.6, d: 0.06, h: 1.5, color: '#6366f1', seats: 0, use: 'divider' },
  glass: { name: 'Glass wall 3 m', w: 3.0, d: 0.08, h: 0, color: '#7dd3fc', seats: 0, use: 'divider' },
  plant: { name: 'Plant', w: 0.5, d: 0.5, h: 1.4, color: '#16a34a', seats: 0, use: 'support' },
  printer: { name: 'Printer / copier', w: 0.65, d: 0.6, h: 1.1, color: '#e2e8f0', seats: 0, use: 'support' },
  kitchen: { name: 'Kitchenette', w: 2.4, d: 0.65, h: 0.9, color: '#f8fafc', seats: 0, use: 'support' },
  booth: { name: 'Phone booth', w: 1.1, d: 1.1, h: 2.2, color: '#334155', seats: 1, use: 'meet' },
  board: { name: 'Whiteboard', w: 1.8, d: 0.5, h: 1.9, color: '#f1f5f9', seats: 0, use: 'support' },
}

/** Items with h = 0 inherit the room height (full-height walls). */
export const heightOf = (it: Item, room: Pick<Room, 'h'>) => (it.h > 0 ? it.h : room.h)

const asFix = (it: Item) => ({ ...it, levels: 0, sides: 0 }) as unknown as Fixture

export const clampItem = (it: Item, room: Pick<Room, 'w' | 'd'>): Item => ({ ...it, ...pick(storeClamp(asFix(it), room)) })
const pick = (f: Fixture) => ({ x: f.x, z: f.z })

export function clashes(items: Item[]): [Item, Item][] {
  const by = new Map(items.map((i) => [i.id, i]))
  return storeOverlaps(items.map(asFix)).map(([a, b]) => [by.get(a.id)!, by.get(b.id)!])
}

const NO_AISLE: Kind[] = ['plant', 'coffee', 'board']

/**
 * Walkways between facing items. Gaps under 0.3 m count as items placed side by side (not a
 * route), gaps to walls are ignored, and small movable pieces (plants, coffee tables, boards) don't form aisles.
 */
export function walkways(items: Item[], room: Pick<Room, 'w' | 'd'>): Aisle[] {
  return storeAisles(items.filter((i) => !NO_AISLE.includes(i.kind)).map(asFix), room).filter((a) => a.b !== 'wall' && a.gap >= 0.3)
}

export interface Metrics { area: number; work: number; meet: number; lounge: number; perDesk: number; coverage: number; byUse: Record<Use, number> }

export function metrics(items: Item[], room: Pick<Room, 'w' | 'd'>): Metrics {
  const area = room.w * room.d
  const byUse: Record<Use, number> = { work: 0, meet: 0, lounge: 0, support: 0, divider: 0 }
  let work = 0, meet = 0, lounge = 0, used = 0
  for (const it of items) {
    const c = CATALOG[it.kind]
    byUse[c.use] += it.w * it.d
    if (c.use === 'work') work += c.seats
    else if (c.use === 'meet') meet += c.seats
    else if (c.use === 'lounge') lounge += c.seats
    if (c.use !== 'divider') used += it.w * it.d
  }
  return { area, work, meet, lounge, perDesk: work ? area / work : Infinity, coverage: used / area, byUse }
}

/** Is a walker (circle radius r at x,z in room coordinates) free of walls and solid furniture? */
export function canStand(x: number, z: number, items: Item[], room: Pick<Room, 'w' | 'd'>, r = 0.25): boolean {
  if (x < r || z < r || x > room.w - r || z > room.d - r) return false
  for (const it of items) {
    const { fw, fd } = foot(it)
    const dx = Math.max(Math.abs(x - it.x) - fw / 2, 0), dz = Math.max(Math.abs(z - it.z) - fd / 2, 0)
    if (dx * dx + dz * dz < r * r) return false
  }
  return true
}
