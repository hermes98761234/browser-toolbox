// Building massing: block footprints (rectangle, L, U, courtyard, custom polygon), areas, GFA, FAR and site coverage.

export type P = [number, number]
export type Shape = 'rect' | 'L' | 'U' | 'court' | 'poly'
export type Use = 'residential' | 'office' | 'retail' | 'hotel' | 'parking'

export interface Block {
  id: string
  name: string
  shape: Shape
  w: number // overall width (x), m
  d: number // overall depth (y), m
  arm: number // wing / ring thickness for L, U and courtyard shapes, m
  pts: P[] // custom polygon (local coordinates) when shape = 'poly'
  x: number // centre position on site, m
  y: number
  rot: number // degrees
  floors: number
  fh: number // floor-to-floor height, m
  base: number // podium height this block starts at (stacking), m
  use: Use
}

export const USES: Record<Use, { label: string; color: string; counts: boolean }> = {
  residential: { label: 'Residential', color: '#f59e0b', counts: true },
  office: { label: 'Office', color: '#0ea5e9', counts: true },
  retail: { label: 'Retail', color: '#ec4899', counts: true },
  hotel: { label: 'Hotel', color: '#a855f7', counts: true },
  parking: { label: 'Parking', color: '#64748b', counts: false },
}

export function signedArea(p: P[]): number {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}
export const area = (p: P[]) => (p.length < 3 ? 0 : Math.abs(signedArea(p)))

/** Outline rings of a block in local coordinates (centred at 0,0). Courtyard returns [outer, hole]. */
export function localRings(b: Block): P[][] {
  const W = Math.max(0.1, b.w), D = Math.max(0.1, b.d), hw = W / 2, hd = D / 2
  const a = Math.max(0.1, Math.min(b.arm, W, D))
  switch (b.shape) {
    case 'rect':
      return [[[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]]
    case 'L':
      return [[[-hw, -hd], [hw, -hd], [hw, -hd + a], [-hw + a, -hd + a], [-hw + a, hd], [-hw, hd]]]
    case 'U': {
      const am = Math.min(a, W / 2.01)
      return [[[-hw, -hd], [hw, -hd], [hw, hd], [hw - am, hd], [hw - am, -hd + Math.min(a, D)], [-hw + am, -hd + Math.min(a, D)], [-hw + am, hd], [-hw, hd]]]
    }
    case 'court': {
      const am = Math.min(a, W / 2.01, D / 2.01)
      return [[[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], [[-hw + am, -hd + am], [-hw + am, hd - am], [hw - am, hd - am], [hw - am, -hd + am]]]
    }
    case 'poly':
      return [b.pts.length >= 3 ? b.pts : [[-5, -5], [5, -5], [0, 5]]]
  }
}

/** Rings in site coordinates (rotated about the centre then translated). */
export function siteRings(b: Block): P[][] {
  const r = (b.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  return localRings(b).map((ring) => ring.map(([x, y]) => [b.x + x * c - y * s, b.y + x * s + y * c] as P))
}

/** Footprint area of one block (outer minus holes). */
export function footprint(b: Block): number {
  const [outer, ...holes] = localRings(b)
  return area(outer) - holes.reduce((t, h) => t + area(h), 0)
}

export function inPoly(p: P, poly: P[]): boolean {
  let ins = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) ins = !ins
  }
  return ins
}
export const inBlock = (p: P, rings: P[][]) => inPoly(p, rings[0]) && !rings.slice(1).some((h) => inPoly(p, h))

/** Union of all footprints (ground coverage) by sampling a grid of `step` m inside the bounds. */
export function coverage(blocks: Block[], step = 0.5): { union: number; overlap: number } {
  const all = blocks.map(siteRings)
  const xs = all.flatMap((r) => r[0].map((p) => p[0])), ys = all.flatMap((r) => r[0].map((p) => p[1]))
  if (!xs.length) return { union: 0, overlap: 0 }
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  let union = 0, overlap = 0
  for (let x = x0 + step / 2; x < x1; x += step)
    for (let y = y0 + step / 2; y < y1; y += step) {
      let n = 0
      for (const r of all) if (inBlock([x, y], r)) n++
      if (n) union++
      if (n > 1) overlap++
    }
  return { union: union * step * step, overlap: overlap * step * step }
}

export interface Totals { gfa: number; countedGfa: number; byUse: Record<Use, number>; maxHeight: number; floorsTotal: number }

export function totals(blocks: Block[]): Totals {
  const byUse = { residential: 0, office: 0, retail: 0, hotel: 0, parking: 0 }
  let gfa = 0, countedGfa = 0, maxHeight = 0, floorsTotal = 0
  for (const b of blocks) {
    const g = footprint(b) * b.floors
    gfa += g
    byUse[b.use] += g
    if (USES[b.use].counts) countedGfa += g
    maxHeight = Math.max(maxHeight, b.base + b.floors * b.fh)
    floorsTotal += b.floors
  }
  return { gfa, countedGfa, byUse, maxHeight, floorsTotal }
}

/** Parses "x,y x,y …" or "x y; x y" into points. */
export function parsePts(t: string): P[] {
  const nums = (t.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  const pts: P[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]])
  return pts
}
