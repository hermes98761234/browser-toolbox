// Geometry helpers for the floor plan designer (plan units: metres, y grows downward).
export type Pt = [number, number]

/** Polygon area by the shoelace formula (absolute value). */
export function polygonArea(p: Pt[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

export function perimeter(p: Pt[], closed = true): number {
  let s = 0
  const n = closed ? p.length : p.length - 1
  for (let i = 0; i < n; i++) s += Math.hypot(p[(i + 1) % p.length][0] - p[i][0], p[(i + 1) % p.length][1] - p[i][1])
  return s
}

export function centroid(p: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]
    const f = x1 * y2 - x2 * y1
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f
  }
  if (Math.abs(a) < 1e-12) return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]
  return [cx / (3 * a), cy / (3 * a)]
}

/** Distance from point to segment. */
export function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1
  const L2 = dx * dx + dy * dy
  const t = L2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L2)) : 0
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

export const snap = (v: number, step: number) => Math.round(v / step) * step
