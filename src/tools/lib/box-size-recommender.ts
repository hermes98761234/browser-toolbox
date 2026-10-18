// Rotation-aware 3D packing of several items into one box (extreme-point heuristic),
// box ranking and void-fill estimates. Units: cm and kg.

export interface Item { id: string; name: string; l: number; w: number; h: number; kg: number; qty: number; upright: boolean }
export interface Box { id: string; name: string; l: number; w: number; h: number; kg: number; cost: number; maxKg: number }
export interface Placed { item: number; name: string; x: number; y: number; z: number; l: number; w: number; h: number }

/** Distinct orientations (l along x, w along y, h up). Upright items may only spin about the vertical axis. */
export function orientations(l: number, w: number, h: number, upright: boolean): [number, number, number][] {
  const all: [number, number, number][] = upright
    ? [[l, w, h], [w, l, h]]
    : [[l, w, h], [w, l, h], [l, h, w], [h, l, w], [w, h, l], [h, w, l]]
  const seen = new Set<string>()
  return all.filter((o) => { const k = o.join('x'); if (seen.has(k)) return false; seen.add(k); return true })
}

const EPS = 1e-9
const boxOverlap = (a: Placed, b: Omit<Placed, 'item' | 'name'>) =>
  a.x < b.x + b.l - EPS && b.x < a.x + a.l - EPS && a.y < b.y + b.w - EPS && b.y < a.y + a.w - EPS && a.z < b.z + b.h - EPS && b.z < a.z + a.h - EPS

/** Is the footprint supported (≥ 60% of its base area resting on the floor or other items)? */
function supported(p: Omit<Placed, 'item' | 'name'>, placed: Placed[]): boolean {
  if (p.z < EPS) return true
  let area = 0
  for (const q of placed) {
    if (Math.abs(q.z + q.h - p.z) > 1e-6) continue
    const ox = Math.min(p.x + p.l, q.x + q.l) - Math.max(p.x, q.x)
    const oy = Math.min(p.y + p.w, q.y + q.w) - Math.max(p.y, q.y)
    if (ox > 0 && oy > 0) area += ox * oy
  }
  return area >= 0.6 * p.l * p.w - 1e-9
}

export function expand(items: Item[]): { idx: number; it: Item }[] {
  return items.flatMap((it, idx) => Array.from({ length: Math.max(0, Math.floor(it.qty)) }, () => ({ idx, it })))
}

/** Try to pack all units into an L×W×H space. Returns placements and any units that did not fit. */
export function pack(L: number, W: number, H: number, items: Item[], order: 'volume' | 'height' | 'area' = 'volume'): { placed: Placed[]; unplaced: number } {
  const units = expand(items)
  const key = (it: Item) => (order === 'volume' ? it.l * it.w * it.h : order === 'height' ? Math.max(it.l, it.w, it.h) : Math.max(it.l * it.w, it.l * it.h, it.w * it.h))
  units.sort((a, b) => key(b.it) - key(a.it))
  const placed: Placed[] = []
  let eps: [number, number, number][] = [[0, 0, 0]]
  let unplaced = 0
  for (const { idx, it } of units) {
    let best: Placed | null = null
    let bestScore = Infinity
    for (const [x, y, z] of eps) {
      for (const [l, w, h] of orientations(it.l, it.w, it.h, it.upright)) {
        if (x + l > L + EPS || y + w > W + EPS || z + h > H + EPS) continue
        const cand = { x, y, z, l, w, h }
        if (placed.some((q) => boxOverlap(q, cand))) continue
        if (!supported(cand, placed)) continue
        // prefer low, then back, then left; lightly prefer flat orientations
        const score = z * 1e6 + (y + w) * 1e3 + (x + l) + h * 1e-3
        if (score < bestScore) { bestScore = score; best = { item: idx, name: it.name, ...cand } }
      }
    }
    if (!best) { unplaced++; continue }
    placed.push(best)
    const b = best
    eps.push([b.x + b.l, b.y, b.z], [b.x, b.y + b.w, b.z], [b.x, b.y, b.z + b.h])
    const seen = new Set<string>()
    eps = eps.filter((p) => {
      const k = p.map((v) => v.toFixed(4)).join(',')
      if (seen.has(k)) return false
      seen.add(k)
      return !placed.some((q) => p[0] >= q.x - EPS && p[0] < q.x + q.l - EPS && p[1] >= q.y - EPS && p[1] < q.y + q.w - EPS && p[2] >= q.z - EPS && p[2] < q.z + q.h - EPS)
    })
    eps.sort((a, b2) => a[2] - b2[2] || a[1] - b2[1] || a[0] - b2[0])
  }
  return { placed, unplaced }
}

/** Best packing over a few item sort orders (items themselves are rotated inside pack). */
export function bestPack(L: number, W: number, H: number, items: Item[]) {
  let best = pack(L, W, H, items, 'volume')
  for (const o of ['height', 'area'] as const) {
    if (best.unplaced === 0) break
    const p = pack(L, W, H, items, o)
    if (p.unplaced < best.unplaced) best = p
  }
  return best
}

export interface Fit {
  box: Box
  fits: boolean
  placed: Placed[]
  unplaced: number
  inner: [number, number, number]
  itemVol: number
  boxVol: number
  voidVol: number
  voidPct: number
  totalKg: number
  overweight: boolean
}

/** Evaluate every box; padding (cm) is cushioning on each side, so usable space = inner − 2·padding. */
export function evaluate(boxes: Box[], items: Item[], padding: number): Fit[] {
  const units = expand(items)
  const itemVol = units.reduce((a, u) => a + u.it.l * u.it.w * u.it.h, 0)
  const itemKg = units.reduce((a, u) => a + u.it.kg, 0)
  return boxes.map((box) => {
    const inner: [number, number, number] = [box.l - 2 * padding, box.w - 2 * padding, box.h - 2 * padding]
    const ok = inner.every((v) => v > 0)
    const res = ok ? bestPack(inner[0], inner[1], inner[2], items) : { placed: [], unplaced: units.length }
    const boxVol = box.l * box.w * box.h
    const totalKg = itemKg + box.kg
    const overweight = box.maxKg > 0 && totalKg > box.maxKg
    return { box, fits: res.unplaced === 0 && units.length > 0 && !overweight, placed: res.placed, unplaced: res.unplaced, inner, itemVol, boxVol, voidVol: boxVol - itemVol, voidPct: boxVol > 0 ? (boxVol - itemVol) / boxVol : 0, totalKg, overweight }
  })
}

/** Air pillows of roughly 20 × 10 × 5 cm fill about 1 L each but only pack to ~70% efficiency. */
export const pillows = (voidCm3: number) => Math.ceil(voidCm3 / 1000 / 0.7)
