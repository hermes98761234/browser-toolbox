// Nursery layout checks on a rectangular room (metres; x → right, z → towards the viewer, origin at the
// back-left corner). Footprint geometry is shared with the room planner. Distances are general guidance only.
import { corners, inside, overlaps, pieceGap, segDist, wallClearance, type Piece, type Pt } from './room-planner'

export { corners, type Piece, type Pt }

export type Kind = 'crib' | 'minicrib' | 'changer' | 'dresser' | 'wardrobe' | 'bookcase' | 'chair' | 'toybox' | 'rug' | 'lamp' | 'monitor' | 'plant'

export const CATALOG: Record<Kind, { name: string; w: number; d: number; h: number; color: string; front: number; climb: boolean; tall: boolean; cord: boolean }> = {
  crib: { name: 'Cot / crib', w: 1.27, d: 0.67, h: 0.95, color: '#f1f5f9', front: 0.5, climb: false, tall: false, cord: false },
  minicrib: { name: 'Bedside crib', w: 0.9, d: 0.55, h: 0.85, color: '#e2e8f0', front: 0.4, climb: false, tall: false, cord: false },
  changer: { name: 'Changing table', w: 0.9, d: 0.55, h: 0.95, color: '#fde68a', front: 0.75, climb: true, tall: true, cord: false },
  dresser: { name: 'Dresser', w: 1.0, d: 0.5, h: 0.85, color: '#c7d2fe', front: 0.75, climb: true, tall: true, cord: false },
  wardrobe: { name: 'Wardrobe', w: 1.0, d: 0.6, h: 1.9, color: '#ddd6fe', front: 0.6, climb: true, tall: true, cord: false },
  bookcase: { name: 'Bookcase', w: 0.8, d: 0.3, h: 1.5, color: '#bbf7d0', front: 0.5, climb: true, tall: true, cord: false },
  chair: { name: 'Nursing chair', w: 0.75, d: 0.85, h: 1.0, color: '#fbcfe8', front: 0.5, climb: false, tall: false, cord: false },
  toybox: { name: 'Toy chest', w: 0.7, d: 0.4, h: 0.45, color: '#fed7aa', front: 0.4, climb: true, tall: false, cord: false },
  rug: { name: 'Rug', w: 1.6, d: 1.2, h: 0.01, color: '#a5b4fc', front: 0, climb: false, tall: false, cord: false },
  lamp: { name: 'Floor lamp', w: 0.35, d: 0.35, h: 1.5, color: '#fef3c7', front: 0, climb: false, tall: false, cord: true },
  monitor: { name: 'Baby monitor', w: 0.15, d: 0.15, h: 0.9, color: '#94a3b8', front: 0, climb: false, tall: false, cord: true },
  plant: { name: 'Plant', w: 0.4, d: 0.4, h: 0.9, color: '#86efac', front: 0, climb: false, tall: false, cord: false },
}

export interface Item extends Piece { kind: Kind }

export type Wall = 'N' | 'E' | 'S' | 'W'
export interface Feature { id: string; kind: 'window' | 'door' | 'radiator'; wall: Wall; offset: number; width: number }

export interface Room { w: number; d: number; h: number }

/** Guidance distances in metres (editable in the UI). */
export interface Rules { window: number; heater: number; climb: number; cord: number; walkway: number }
export const RULES: Rules = { window: 0.6, heater: 0.6, climb: 0.6, cord: 1.0, walkway: 0.6 }

export const wallLength = (r: Room, w: Wall) => (w === 'N' || w === 'S' ? r.w : r.d)

/** Feature as a wall segment [a, b] (offset measured from the left end as seen from inside the room… simplified: from the lower x / z). */
export function featureSeg(r: Room, f: Feature): [Pt, Pt] {
  const L = wallLength(r, f.wall)
  const a = Math.max(0, Math.min(L - f.width, f.offset)), b = a + Math.min(f.width, L)
  switch (f.wall) {
    case 'N': return [[a, 0], [b, 0]]
    case 'S': return [[a, r.d], [b, r.d]]
    case 'W': return [[0, a], [0, b]]
    default: return [[r.w, a], [r.w, b]]
  }
}

export const roomPoly = (r: Room): Pt[] => [[0, 0], [r.w, 0], [r.w, r.d], [0, r.d]]

/** Minimum distance between a piece footprint and a segment. */
export function distToSeg(p: Piece, [a, b]: [Pt, Pt]): number {
  const cs = corners(p)
  if (inside(a[0], a[1], cs) || inside(b[0], b[1], cs)) return 0
  let m = Infinity
  for (let i = 0; i < 4; i++) m = Math.min(m, segDist(cs[i], cs[(i + 1) % 4], a, b).dist)
  return m
}

/** The zone in front of a piece (its local +z side) used for access/drawers/doors, shrunk 2 cm so touching does not count. */
export function frontZone(p: Piece, depth: number): Piece {
  const a = (p.rot * Math.PI) / 180
  const off = p.d / 2 + depth / 2
  return { ...p, id: `${p.id}-front`, x: p.x - Math.sin(a) * off, z: p.z + Math.cos(a) * off, w: Math.max(0.01, p.w - 0.04), d: Math.max(0.01, depth - 0.04), h: 0 }
}

/** Swing area of a door: a square of the door width inside the room. */
export function doorZone(r: Room, f: Feature): Piece {
  const [a, b] = featureSeg(r, f)
  const s = f.width - 0.04, cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, h = f.width / 2
  const x = f.wall === 'W' ? h : f.wall === 'E' ? r.w - h : cx
  const z = f.wall === 'N' ? h : f.wall === 'S' ? r.d - h : cz
  return { id: f.id, name: 'Door swing', w: s, d: s, h: 0, x, z, rot: 0, color: '' }
}

export interface Check { level: 'ok' | 'warn' | 'err'; text: string; ids: string[] }

export function check(r: Room, items: Item[], feats: Feature[], R: Rules = RULES): Check[] {
  const out: Check[] = []
  const poly = roomPoly(r)
  const solid = items.filter((i) => i.h >= 0.05)
  const beds = items.filter((i) => i.kind === 'crib' || i.kind === 'minicrib')
  const fmt = (m: number) => `${Math.round(m * 100)} cm`
  for (const it of items) {
    if (!corners(it).every(([x, z]) => x >= -1e-6 && x <= r.w + 1e-6 && z >= -1e-6 && z <= r.d + 1e-6)) out.push({ level: 'err', text: `${it.name} sticks out of the room.`, ids: [it.id] })
  }
  for (const [a, b] of overlaps(items)) out.push({ level: 'err', text: `${a.name} and ${b.name} overlap.`, ids: [a.id, b.id] })
  for (const c of beds) {
    for (const f of feats) {
      const d = distToSeg(c, featureSeg(r, f))
      if (f.kind === 'window') out.push(d < R.window ? { level: 'warn', text: `${c.name} is ${fmt(d)} from a window (keep at least ${fmt(R.window)}: blind cords, drafts, direct sun).`, ids: [c.id] } : { level: 'ok', text: `${c.name} is clear of the window (${fmt(d)}).`, ids: [c.id] })
      if (f.kind === 'radiator') out.push(d < R.heater ? { level: 'warn', text: `${c.name} is ${fmt(d)} from a radiator/heater (keep at least ${fmt(R.heater)} to avoid overheating).`, ids: [c.id] } : { level: 'ok', text: `${c.name} is clear of the radiator (${fmt(d)}).`, ids: [c.id] })
    }
    for (const o of items) {
      if (o.id === c.id) continue
      const g = pieceGap(c, o)
      if (CATALOG[o.kind].climb && g < R.climb) out.push({ level: 'warn', text: `${o.name} is ${fmt(g)} from the ${c.name.toLowerCase()}: a standing toddler could climb across (keep ${fmt(R.climb)}+).`, ids: [c.id, o.id] })
      if (CATALOG[o.kind].cord && g < R.cord) out.push({ level: 'warn', text: `${o.name} is ${fmt(g)} from the ${c.name.toLowerCase()}: keep cords and cables at least ${fmt(R.cord)} out of reach.`, ids: [c.id, o.id] })
    }
    const wc = wallClearance(c, poly).dist
    if (wc > 0.03 && wc < 0.25) out.push({ level: 'warn', text: `${c.name} has a ${fmt(wc)} gap to the wall where a baby could get trapped: push it flush or leave a wide gap.`, ids: [c.id] })
  }
  for (const it of items) {
    const meta = CATALOG[it.kind]
    if (meta.tall && it.h >= 0.75) {
      const wc = wallClearance(it, poly).dist
      out.push(wc > 0.05 ? { level: 'warn', text: `${it.name} is not against a wall, so it cannot be anchored (tip-over risk).`, ids: [it.id] } : { level: 'ok', text: `${it.name} is against a wall: anchor it with an anti-tip strap.`, ids: [it.id] })
    }
    if (meta.front > 0 && it.kind !== 'rug') {
      const z = frontZone(it, Math.max(meta.front, it.kind === 'changer' || it.kind === 'dresser' ? R.walkway : 0))
      const inRoom = corners(z).every(([x, zz]) => x >= -0.02 && x <= r.w + 0.02 && zz >= -0.02 && zz <= r.d + 0.02)
      const block = solid.filter((o) => o.id !== it.id && pieceGap(z, o) === 0)
      if (!inRoom || block.length) out.push({ level: 'warn', text: `Not enough space in front of the ${it.name.toLowerCase()} (${fmt(z.d + 0.04)} needed)${block.length ? `: blocked by ${block.map((b) => b.name).join(', ')}` : ': faces a wall'}.`, ids: [it.id, ...block.map((b) => b.id)] })
    }
  }
  for (const f of feats.filter((x) => x.kind === 'door')) {
    const z = doorZone(r, f)
    const block = solid.filter((o) => pieceGap(z, o) === 0)
    out.push(block.length ? { level: 'err', text: `Door swing is blocked by ${block.map((b) => b.name).join(', ')}.`, ids: block.map((b) => b.id) } : { level: 'ok', text: 'Door can open fully.', ids: [] })
  }
  const chair = items.find((i) => i.kind === 'chair')
  if (chair && beds[0]) {
    const g = pieceGap(chair, beds[0])
    if (g > 2) out.push({ level: 'warn', text: `The nursing chair is ${fmt(g)} from the ${beds[0].name.toLowerCase()}: closer (under ~2 m) makes night feeds easier.`, ids: [chair.id] })
  }
  if (!beds.length) out.push({ level: 'warn', text: 'Add a cot or crib to check sleep-area guidance.', ids: [] })
  const order = { err: 0, warn: 1, ok: 2 }
  return out.sort((a, b) => order[a.level] - order[b.level])
}

/** Free floor share: 1 − solid footprint area / room area (rugs excluded). */
export function freeFloor(r: Room, items: Item[]): number {
  const used = items.filter((i) => i.h >= 0.05).reduce((a, i) => a + i.w * i.d, 0)
  return Math.max(0, 1 - used / (r.w * r.d))
}

export function makeItem(kind: Kind, x: number, z: number, rot = 0, id = `${kind}-${Math.random().toString(36).slice(2, 7)}`): Item {
  const c = CATALOG[kind]
  return { id, kind, name: c.name, w: c.w, d: c.d, h: c.h, x, z, rot, color: c.color }
}
