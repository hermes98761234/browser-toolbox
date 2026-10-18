// Lawn seed and fertilizer quantities. Seeding rates are typical extension-service ranges
// (lb of seed per 1000 sq ft); always check the bag label for the specific cultivar.

export type P = [number, number]

export interface Grass { id: string; name: string; newLawn: number; overseed: number; zone: string; germ: string }

export const GRASSES: Grass[] = [
  { id: 'kbg', name: 'Kentucky bluegrass', newLawn: 2.5, overseed: 1.5, zone: 'Cool season', germ: '14–30 days' },
  { id: 'prg', name: 'Perennial ryegrass', newLawn: 8, overseed: 4, zone: 'Cool season', germ: '5–10 days' },
  { id: 'tf', name: 'Tall fescue', newLawn: 7, overseed: 4, zone: 'Cool season', germ: '7–14 days' },
  { id: 'ff', name: 'Fine fescue', newLawn: 4.5, overseed: 2.5, zone: 'Cool season, shade', germ: '7–14 days' },
  { id: 'mix', name: 'Sun & shade mix', newLawn: 6, overseed: 3, zone: 'Cool season', germ: '7–21 days' },
  { id: 'bent', name: 'Creeping bentgrass', newLawn: 1, overseed: 0.5, zone: 'Cool season', germ: '7–14 days' },
  { id: 'berm', name: 'Bermudagrass (hulled)', newLawn: 1.5, overseed: 1, zone: 'Warm season', germ: '10–30 days' },
  { id: 'zoy', name: 'Zoysiagrass', newLawn: 2, overseed: 1, zone: 'Warm season', germ: '14–21 days' },
  { id: 'bahia', name: 'Bahiagrass', newLawn: 7, overseed: 5, zone: 'Warm season', germ: '21–28 days' },
  { id: 'cent', name: 'Centipedegrass', newLawn: 0.5, overseed: 0.25, zone: 'Warm season', germ: '14–21 days' },
  { id: 'buff', name: 'Buffalograss', newLawn: 3, overseed: 1.5, zone: 'Warm season, dry', germ: '14–30 days' },
]

export const FT2_PER_M2 = 10.7639
/** 1 lb per 1000 sq ft expressed in grams per square metre. */
export const LB1000_TO_GM2 = 453.59237 / (1000 / FT2_PER_M2)

/** Shoelace area (absolute). */
export function polyArea(p: P[]): number {
  if (p.length < 3) return 0
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]
    const [x2, y2] = p[(i + 1) % p.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

export function polyPerimeter(p: P[]): number {
  if (p.length < 2) return 0
  let s = 0
  for (let i = 0; i < p.length; i++) s += Math.hypot(p[(i + 1) % p.length][0] - p[i][0], p[(i + 1) % p.length][1] - p[i][1])
  return s
}

function cross(o: P, a: P, b: P) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}
/** True if any two non-adjacent edges cross. */
export function selfCrossing(p: P[]): boolean {
  const n = p.length
  if (n < 4) return false
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      const a = p[i], b = p[(i + 1) % n], c = p[j], d = p[(j + 1) % n]
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true
    }
  return false
}

/** Index after which a new point at `q` should be inserted: the closest edge. */
export function nearestEdge(p: P[], q: P): number {
  let best = p.length - 1
  let bd = Infinity
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
    const d = Math.hypot(a[0] + t * dx - q[0], a[1] + t * dy - q[1])
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return best
}

export interface Plan {
  areaFt2: number
  rateLb1000: number
  seedLb: number
  bags: number
  seedCost: number
  fertLb: number
  fertBags: number
  fertCost: number
}

/**
 * areaFt2: net lawn area; rate: lb seed / 1000 ft²; extra: overlap/waste fraction;
 * nRate: lb nitrogen / 1000 ft²; nPct: fertilizer N percentage.
 */
export function plan(areaFt2: number, rate: number, extra: number, bagLb: number, bagPrice: number, nRate: number, nPct: number, fertBagLb: number, fertPrice: number): Plan {
  const a = Math.max(0, areaFt2)
  const seedLb = (a / 1000) * rate * (1 + Math.max(0, extra))
  const bags = bagLb > 0 ? Math.ceil(seedLb / bagLb - 1e-9) : 0
  const fertLb = nPct > 0 ? ((a / 1000) * nRate) / (nPct / 100) : 0
  const fertBags = fertBagLb > 0 ? Math.ceil(fertLb / fertBagLb - 1e-9) : 0
  return { areaFt2: a, rateLb1000: rate, seedLb, bags, seedCost: bags * bagPrice, fertLb, fertBags, fertCost: fertBags * fertPrice }
}
