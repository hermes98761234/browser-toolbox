// Classroom layouts and constrained random seating.

export interface Seat { x: number; y: number; w: number; h: number }
export type Layout = 'rows' | 'pairs' | 'groups' | 'ushape'

export const DESK_W = 90
export const DESK_H = 54

/** Seats in SVG units; the teacher's desk is at the top (front of the room). */
export function makeSeats(layout: Layout, cols: number, rows: number): Seat[] {
  const out: Seat[] = []
  const top = 110
  const gx = 18, gy = 26
  if (layout === 'rows') {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: 20 + c * (DESK_W + gx), y: top + r * (DESK_H + gy), w: DESK_W, h: DESK_H })
  } else if (layout === 'pairs') {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const pair = Math.floor(c / 2)
        out.push({ x: 20 + c * DESK_W + pair * 40, y: top + r * (DESK_H + gy), w: DESK_W, h: DESK_H })
      }
  } else if (layout === 'groups') {
    // cols x rows groups of 4 (2 x 2 desks)
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        for (let k = 0; k < 4; k++) out.push({ x: 20 + c * (2 * DESK_W + 50) + (k % 2) * DESK_W, y: top + r * (2 * DESK_H + 50) + Math.floor(k / 2) * DESK_H, w: DESK_W, h: DESK_H })
  } else {
    // U-shape: cols desks along the back, rows desks down each side; inner U when large
    const span = cols * DESK_W
    for (let r = 0; r < rows; r++) out.push({ x: 20, y: top + r * DESK_H, w: DESK_W, h: DESK_H })
    for (let c = 0; c < cols; c++) out.push({ x: 20 + DESK_W + c * DESK_W, y: top + (rows - 1) * DESK_H, w: DESK_W, h: DESK_H })
    for (let r = rows - 1; r >= 0; r--) out.push({ x: 20 + DESK_W + span, y: top + r * DESK_H, w: DESK_W, h: DESK_H })
  }
  return out
}

export function bounds(seats: Seat[]) {
  let w = 400, h = 300
  for (const s of seats) {
    w = Math.max(w, s.x + s.w + 20)
    h = Math.max(h, s.y + s.h + 20)
  }
  return { w, h }
}

/** Two seats are neighbours when their desks touch or are within one desk gap. */
export function neighbours(a: Seat, b: Seat) {
  const dx = Math.abs(a.x + a.w / 2 - (b.x + b.w / 2))
  const dy = Math.abs(a.y + a.h / 2 - (b.y + b.h / 2))
  return dx <= a.w + 20 && dy <= a.h + 30
}

/** Seeded PRNG so a shuffle can be reproduced. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/**
 * Randomly assigns students (ids) to seats, avoiding neighbouring "keep apart" pairs and
 * honouring "front row" students (placed in the seats nearest the teacher). Returns seat → id.
 */
export function shuffleSeating(ids: string[], seats: Seat[], apart: [string, string][], front: string[], seed: number, tries = 400) {
  const rand = rng(seed)
  const order = seats.map((_, i) => i).sort((a, b) => seats[a].y - seats[b].y || seats[a].x - seats[b].x)
  let best: (string | null)[] = []
  let bestBad = Infinity
  for (let t = 0; t < tries; t++) {
    const pool = ids.slice(0, seats.length)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const fr = pool.filter((p) => front.includes(p))
    const rest = pool.filter((p) => !front.includes(p))
    const assign: (string | null)[] = seats.map(() => null)
    const seq = [...fr, ...rest]
    // front students take the first seats in front-to-back order; others fill remaining seats randomly
    const frontSeats = order.slice(0, fr.length)
    const other = order.slice(fr.length)
    for (let i = other.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[other[i], other[j]] = [other[j], other[i]]
    }
    const seatSeq = [...frontSeats, ...other]
    seq.forEach((id, i) => (assign[seatSeq[i]] = id))
    const bad = conflicts(assign, seats, apart)
    if (bad < bestBad) {
      best = assign
      bestBad = bad
      if (bad === 0) break
    }
  }
  return { assign: best, conflicts: bestBad }
}

export function conflicts(assign: (string | null)[], seats: Seat[], apart: [string, string][]) {
  const where = new Map<string, number>()
  assign.forEach((id, i) => id && where.set(id, i))
  let bad = 0
  for (const [a, b] of apart) {
    const ia = where.get(a), ib = where.get(b)
    if (ia !== undefined && ib !== undefined && neighbours(seats[ia], seats[ib])) bad++
  }
  return bad
}
