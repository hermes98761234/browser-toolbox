// 3D container loading: extreme-point first-fit heuristic with rotation, support, stacking and weight limits.
// Axes: x = length (0 = front wall / far end, loading proceeds towards the doors), y = width, z = height. Units: mm, kg.

export interface ContainerType { name: string; L: number; W: number; H: number; payload: number; door?: [number, number] }

export const CONTAINERS: ContainerType[] = [
  { name: "20' Standard", L: 5898, W: 2352, H: 2393, payload: 28200 },
  { name: "40' Standard", L: 12032, W: 2352, H: 2393, payload: 26700 },
  { name: "40' High Cube", L: 12032, W: 2352, H: 2698, payload: 26500 },
  { name: "45' High Cube", L: 13556, W: 2352, H: 2698, payload: 27700 },
  { name: "20' Reefer", L: 5444, W: 2294, H: 2276, payload: 27400 },
  { name: "40' Reefer HC", L: 11583, W: 2294, H: 2554, payload: 29000 },
  { name: 'Euro trailer 13.6 m', L: 13600, W: 2480, H: 2700, payload: 24000 },
  { name: "US 53' trailer", L: 16002, W: 2591, H: 2794, payload: 20400 },
]

export interface Item { id: string; name: string; l: number; w: number; h: number; kg: number; qty: number; rotate: boolean; stackable: boolean; color: string }

export interface Placed { item: number; x: number; y: number; z: number; l: number; w: number; h: number }

export interface LoadResult {
  placed: Placed[]
  unplaced: number[] // count per item index
  volumeUse: number
  weight: number
  cog: [number, number, number]
  usedLength: number
}

const EPS = 1e-6

function orientations(it: Item): [number, number, number][] {
  const o: [number, number, number][] = [[it.l, it.w, it.h], [it.w, it.l, it.h]]
  if (it.rotate) o.push([it.l, it.h, it.w], [it.h, it.l, it.w], [it.w, it.h, it.l], [it.h, it.w, it.l])
  const seen = new Set<string>()
  return o.filter((d) => {
    const k = d.join('x')
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

type Box = { L: number; W: number; H: number; payload: number }

/**
 * minSupport: fraction of the base that must rest on the floor or on stackable boxes directly below.
 * Tries a few box orderings and keeps the plan that loads the most volume.
 */
export function packContainer(c: Box, items: Item[], minSupport = 0.75, maxBoxes = 3000): LoadResult {
  const boxes: number[] = []
  items.forEach((it, i) => { for (let k = 0; k < Math.max(0, Math.floor(it.qty)); k++) if (boxes.length < maxBoxes) boxes.push(i) })
  const vol = (i: number) => items[i].l * items[i].w * items[i].h
  const orders: ((a: number, b: number) => number)[] = [
    (a, b) => vol(b) - vol(a) || items[b].kg - items[a].kg || a - b, // biggest first
    (a, b) => Number(items[b].stackable) - Number(items[a].stackable) || vol(b) - vol(a) || a - b, // fragile last (near the doors)
    (a, b) => items[b].h - items[a].h || vol(b) - vol(a) || a - b, // tallest first (even walls)
  ]
  let best: LoadResult | null = null
  for (const o of orders) {
    const r = packOrdered(c, items, [...boxes].sort(o), minSupport)
    if (!best || r.volumeUse > best.volumeUse + 1e-9 || (Math.abs(r.volumeUse - best.volumeUse) < 1e-9 && r.placed.length > best.placed.length)) best = r
  }
  return best!
}

function packOrdered(c: Box, items: Item[], boxes: number[], minSupport: number): LoadResult {
  const placed: Placed[] = []
  const unplaced = items.map(() => 0)
  let eps: [number, number, number][] = [[0, 0, 0]]
  let weight = 0

  const overlaps = (x: number, y: number, z: number, l: number, w: number, h: number) => {
    for (const p of placed) {
      if (x < p.x + p.l - EPS && x + l > p.x + EPS && y < p.y + p.w - EPS && y + w > p.y + EPS && z < p.z + p.h - EPS && z + h > p.z + EPS) return true
    }
    return false
  }
  const support = (x: number, y: number, z: number, l: number, w: number) => {
    if (z < EPS) return 1
    let area = 0
    for (const p of placed) {
      if (Math.abs(p.z + p.h - z) > 1e-3) continue
      const ox = Math.min(x + l, p.x + p.l) - Math.max(x, p.x)
      const oy = Math.min(y + w, p.y + p.w) - Math.max(y, p.y)
      if (ox > EPS && oy > EPS) {
        if (!items[p.item].stackable) return 0
        area += ox * oy
      }
    }
    return area / (l * w)
  }

  // cache: once an item type fails, identical boxes fail too until something changes — but placements only shrink space, so skip them.
  const failed = new Set<number>()
  for (const bi of boxes) {
    const it = items[bi]
    if (failed.has(bi) || weight + it.kg > c.payload + EPS) { unplaced[bi]++; continue }
    eps.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1])
    let best: Placed | null = null
    let bestScore = Infinity
    for (const [x, y, z] of eps) {
      if (best && x > best.x + EPS) break // EPs are sorted by depth; nothing deeper beats the found one
      for (const [l, w, h] of orientations(it)) {
        if (x + l > c.L + EPS || y + w > c.W + EPS || z + h > c.H + EPS) continue
        if (overlaps(x, y, z, l, w, h)) continue
        if (support(x, y, z, l, w) < minSupport - EPS) continue
        const score = (x + l) * 1e6 + z * 1e3 + y // shallowest wall first, then lowest, then leftmost
        if (score < bestScore) { bestScore = score; best = { item: bi, x, y, z, l, w, h } }
      }
    }
    if (!best) { unplaced[bi]++; failed.add(bi); continue }
    placed.push(best)
    weight += it.kg
    const { x, y, z, l, w, h } = best
    eps.push([x + l, y, z], [x, y + w, z], [x, y, z + h])
    // drop EPs now inside a box or duplicated
    const seen = new Set<string>()
    eps = eps.filter((e) => {
      const k = e.map((v) => Math.round(v)).join(',')
      if (seen.has(k)) return false
      seen.add(k)
      if (e[0] >= c.L - EPS || e[1] >= c.W - EPS || e[2] >= c.H - EPS) return false
      return !placed.some((p) => e[0] >= p.x - EPS && e[0] < p.x + p.l - EPS && e[1] >= p.y - EPS && e[1] < p.y + p.w - EPS && e[2] >= p.z - EPS && e[2] < p.z + p.h - EPS)
    })
  }
  // loading order: back wall first, bottom up
  placed.sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y)
  const vol = placed.reduce((a, p) => a + p.l * p.w * p.h, 0)
  const cog: [number, number, number] = [0, 0, 0]
  for (const p of placed) {
    const m = items[p.item].kg
    cog[0] += m * (p.x + p.l / 2); cog[1] += m * (p.y + p.w / 2); cog[2] += m * (p.z + p.h / 2)
  }
  if (weight > 0) for (let i = 0; i < 3; i++) cog[i] /= weight
  return { placed, unplaced, volumeUse: vol / (c.L * c.W * c.H), weight, cog, usedLength: Math.max(0, ...placed.map((p) => p.x + p.l)) }
}
