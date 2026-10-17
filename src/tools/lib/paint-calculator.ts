// Paint estimation: paintable area, litres/gallons needed and cheapest can combination.

export interface Room { id: string; name: string; length: number; width: number; height: number; doors: number; windows: number; ceiling: boolean; walls: boolean }
export interface Opening { w: number; h: number }

export interface RoomArea { gross: number; openings: number; walls: number; ceiling: number }

export function roomArea(r: Room, door: Opening, win: Opening): RoomArea {
  const L = Math.max(0, r.length), W = Math.max(0, r.width), H = Math.max(0, r.height)
  const gross = r.walls ? 2 * (L + W) * H : 0
  const openings = r.walls ? Math.max(0, r.doors) * door.w * door.h + Math.max(0, r.windows) * win.w * win.h : 0
  return { gross, openings: Math.min(openings, gross), walls: Math.max(0, gross - openings), ceiling: r.ceiling ? L * W : 0 }
}

/** Paint volume for an area: area × coats / coverage, plus waste. */
export function paintNeeded(area: number, coats: number, coverage: number, wastePct = 0): number {
  if (!(coverage > 0) || !(area > 0) || !(coats > 0)) return 0
  return ((area * coats) / coverage) * (1 + Math.max(0, wastePct) / 100)
}

export interface Can { size: number; price: number }
export interface CanPlan { counts: number[]; volume: number; cost: number }

/**
 * Cheapest set of cans holding at least `need` (ties → least leftover, then fewest cans).
 * Exhaustive over plausible counts; fine for up to ~5 sizes.
 */
export function bestCans(need: number, cans: Can[]): CanPlan | null {
  const cs = cans.filter((c) => c.size > 0 && c.price >= 0)
  if (!cs.length) return null
  if (need <= 0) return { counts: cans.map(() => 0), volume: 0, cost: 0 }
  let best: CanPlan | null = null
  const max = cs.map((c) => Math.ceil(need / c.size))
  const counts = new Array(cs.length).fill(0)
  const rec = (i: number, vol: number, cost: number) => {
    if (best && cost > best.cost + 1e-9) return
    if (vol >= need - 1e-9) {
      const nCans = counts.reduce((a, b) => a + b, 0)
      const bn = best ? best.counts.reduce((a, b) => a + b, 0) : Infinity
      if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && (vol < best.volume - 1e-9 || (Math.abs(vol - best.volume) < 1e-9 && nCans < bn))))
        best = { counts: [...counts], volume: vol, cost }
      return
    }
    if (i >= cs.length) return
    for (let k = 0; k <= max[i]; k++) {
      counts[i] = k
      rec(i + 1, vol + k * cs[i].size, cost + k * cs[i].price)
    }
    counts[i] = 0
  }
  rec(0, 0, 0)
  if (!best) return null
  // Map back to the original can order (skipping invalid entries).
  const b = best as CanPlan
  let j = 0
  return { ...b, counts: cans.map((c) => (c.size > 0 && c.price >= 0 ? b.counts[j++] : 0)) }
}
