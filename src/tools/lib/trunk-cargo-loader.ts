// Trunk cargo loader: car boot presets, luggage presets, opening check and box collisions.
// Packing reuses the container loader's extreme-point heuristic (x = depth from the seat backs, y = width, z = height; mm).
import { packContainer, type Item as CItem, type LoadResult, type Placed } from './container-loading-planner'

export { packContainer, type LoadResult, type Placed }

export interface Trunk { name: string; L: number; W: number; H: number; folded: number; openW: number; openH: number }

/** Typical usable boot dimensions (mm). `folded` = extra depth with rear seats down. Check your own car. */
export const TRUNKS: Trunk[] = [
  { name: 'City car', L: 600, W: 950, H: 520, folded: 750, openW: 900, openH: 580 },
  { name: 'Compact hatchback', L: 780, W: 1000, H: 560, folded: 820, openW: 1000, openH: 650 },
  { name: 'Mid-size sedan', L: 1020, W: 1050, H: 470, folded: 800, openW: 1000, openH: 450 },
  { name: 'Estate / wagon', L: 1060, W: 1050, H: 720, folded: 900, openW: 1050, openH: 720 },
  { name: 'Compact SUV', L: 900, W: 1050, H: 780, folded: 850, openW: 1050, openH: 780 },
  { name: 'Large SUV', L: 1100, W: 1150, H: 880, folded: 950, openW: 1150, openH: 850 },
  { name: 'Minivan (3rd row folded)', L: 1250, W: 1200, H: 1050, folded: 900, openW: 1200, openH: 1000 },
]

export interface Luggage { id: string; name: string; l: number; w: number; h: number; kg: number; qty: number; soft: boolean; fragile: boolean; color: string }

export const LUGGAGE: Omit<Luggage, 'id' | 'qty' | 'color'>[] = [
  { name: 'Large suitcase', l: 750, w: 500, h: 300, kg: 20, soft: false, fragile: false },
  { name: 'Medium suitcase', l: 650, w: 450, h: 270, kg: 15, soft: false, fragile: false },
  { name: 'Carry-on', l: 550, w: 400, h: 230, kg: 9, soft: false, fragile: false },
  { name: 'Duffel bag', l: 600, w: 320, h: 300, kg: 10, soft: true, fragile: false },
  { name: 'Backpack', l: 500, w: 330, h: 220, kg: 7, soft: true, fragile: false },
  { name: 'Folded stroller', l: 850, w: 550, h: 300, kg: 9, soft: false, fragile: false },
  { name: 'Cool box', l: 600, w: 400, h: 400, kg: 12, soft: false, fragile: false },
  { name: 'Golf bag', l: 1250, w: 350, h: 350, kg: 13, soft: true, fragile: false },
  { name: 'Grocery bag', l: 400, w: 250, h: 350, kg: 6, soft: true, fragile: true },
  { name: 'Moving box (M)', l: 460, w: 310, h: 310, kg: 10, soft: false, fragile: false },
  { name: 'Dog crate (M)', l: 760, w: 530, h: 610, kg: 12, soft: false, fragile: true },
  { name: 'Camping tent', l: 650, w: 220, h: 220, kg: 5, soft: true, fragile: false },
]

export const trunkDims = (t: Trunk, seatsDown: boolean) => ({ L: t.L + (seatsDown ? t.folded : 0), W: t.W, H: t.H })
export const litres = (l: number, w: number, h: number) => (l * w * h) / 1e6

/** Can the item pass through the opening in some orientation (two smallest dims vs opening)? Soft items squeeze by `squeeze`. */
export function fitsOpening(it: Pick<Luggage, 'l' | 'w' | 'h' | 'soft'>, openW: number, openH: number, squeeze = 0.1): boolean {
  const k = it.soft ? 1 - squeeze : 1
  const [a, b] = [it.l, it.w, it.h].map((v) => v * k).sort((x, y) => x - y)
  const [o1, o2] = [openW, openH].sort((x, y) => x - y)
  return a <= o1 && b <= o2
}

/** Converts luggage to packer items; soft bags are packed at (1 − squeeze) of their nominal size. */
export function toItems(list: Luggage[], squeeze = 0.1): CItem[] {
  return list.map((g) => {
    const k = g.soft ? 1 - squeeze : 1
    return { id: g.id, name: g.name, l: Math.round(g.l * k), w: Math.round(g.w * k), h: Math.round(g.h * k), kg: g.kg, qty: g.qty, rotate: true, stackable: !g.fragile, color: g.color }
  })
}

/** Index pairs of placed boxes that overlap (manual moves can create them). */
export function collisions(ps: Placed[], eps = 1): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j]
      if (a.x < b.x + b.l - eps && a.x + a.l > b.x + eps && a.y < b.y + b.w - eps && a.y + a.w > b.y + eps && a.z < b.z + b.h - eps && a.z + a.h > b.z + eps) out.push([i, j])
    }
  return out
}

export const outside = (p: Placed, L: number, W: number, H: number, eps = 1) => p.x < -eps || p.y < -eps || p.z < -eps || p.x + p.l > L + eps || p.y + p.w > W + eps || p.z + p.h > H + eps

/** Lowest height at (x, y) footprint where box `p` rests on the floor or on top of other boxes (gravity drop). */
export function dropZ(p: Placed, others: Placed[]): number {
  let z = 0
  for (const o of others) {
    const ox = Math.min(p.x + p.l, o.x + o.l) - Math.max(p.x, o.x)
    const oy = Math.min(p.y + p.w, o.y + o.w) - Math.max(p.y, o.y)
    if (ox > 1 && oy > 1) z = Math.max(z, o.z + o.h)
  }
  return z
}
