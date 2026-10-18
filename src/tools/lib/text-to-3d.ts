// Text to 3D helpers: turn traced contour rings of rendered text into outer shapes with holes,
// tidy pixel stair-steps while keeping corners, and measure the resulting mesh.
import { contours, corners, rdpClosed, signedArea, smooth, type P } from './vectorizer'

export type { P }

export interface ShapeRings {
  outer: P[]
  holes: P[][]
}

export function pointInPoly(pt: P, poly: P[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Groups rings into outer boundaries with their holes. Orientation decides the role (the largest ring
 * is always an outer boundary); each hole goes to the smallest outer ring that contains it.
 */
export function groupRings(rings: P[][]): ShapeRings[] {
  const items = rings.filter((r) => r.length >= 3).map((r) => ({ r, a: signedArea(r) }))
  if (!items.length) return []
  const big = items.reduce((m, x) => (Math.abs(x.a) > Math.abs(m.a) ? x : m))
  const sOuter = Math.sign(big.a)
  const outers = items.filter((x) => Math.sign(x.a) === sOuter).map((x) => ({ outer: x.r, area: Math.abs(x.a), holes: [] as P[][] }))
  for (const h of items.filter((x) => Math.sign(x.a) !== sOuter)) {
    const probe = h.r[0]
    let best: (typeof outers)[number] | null = null
    for (const o of outers) if (o.area > Math.abs(h.a) && pointInPoly(probe, o.outer) && (!best || o.area < best.area)) best = o
    if (best) best.holes.push(h.r)
  }
  return outers.map(({ outer, holes }) => ({ outer, holes }))
}

/** Smooths pixel stair-steps (keeping sharp corners) then simplifies a ring. */
export function tidyRing(ring: P[], eps: number, cornerDeg = 50): P[] {
  let pre = ring
  for (let k = 0; k < 2; k++) pre = smooth(pre, new Set())
  const fixed = new Set(corners(pre, cornerDeg, 3))
  let p = ring
  for (let k = 0; k < 3; k++) p = smooth(p, fixed)
  return rdpClosed(p, eps)
}

/** Traces a binary mask into grouped, tidied shapes (pixel units, y down). */
export function maskToShapes(mask: Uint8Array, w: number, h: number, eps = 0.6, minArea = 12): ShapeRings[] {
  const rings = contours(mask, w, h)
    .filter((r) => Math.abs(signedArea(r)) >= minArea)
    .map((r) => tidyRing(r, eps))
    .filter((r) => r.length >= 3)
  return groupRings(rings)
}

/** Volume (abs) of a closed triangle soup, 9 floats per triangle. */
export function meshVolume(pos: ArrayLike<number>): number {
  let v = 0
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i], ay = pos[i + 1], az = pos[i + 2]
    const bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5]
    const cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8]
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
  }
  return Math.abs(v / 6)
}
