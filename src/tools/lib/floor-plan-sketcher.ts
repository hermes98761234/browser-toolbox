// Floor-plan geometry in centimetres.

export type P = [number, number]

/** Signed shoelace area (cm², positive = counter-clockwise in y-up, clockwise on screen). */
export function signedArea(pts: P[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]
    a += x0 * y1 - x1 * y0
  }
  return a / 2
}
export const area = (pts: P[]) => Math.abs(signedArea(pts))

export function perimeter(pts: P[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length])
  return s
}

export const dist = (a: P, b: P) => Math.hypot(b[0] - a[0], b[1] - a[1])

/** Area centroid (falls back to the vertex mean for degenerate polygons). */
export function centroid(pts: P[]): P {
  const A = signedArea(pts)
  if (Math.abs(A) < 1e-9) return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
  let cx = 0, cy = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]
    const f = x0 * y1 - x1 * y0
    cx += (x0 + x1) * f
    cy += (y0 + y1) * f
  }
  return [cx / (6 * A), cy / (6 * A)]
}

export const snapGrid = (p: P, step: number): P => [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step]

/** Locks `p` to the nearest 45° direction from `from`, keeping its projected length. */
export function ortho(from: P, p: P): P {
  const dx = p[0] - from[0], dy = p[1] - from[1]
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  const len = dx * Math.cos(ang) + dy * Math.sin(ang)
  return [from[0] + Math.round(len * Math.cos(ang)), from[1] + Math.round(len * Math.sin(ang))]
}

/** Closest point on segment ab to p, with the parameter t in [0,1]. */
export function project(p: P, a: P, b: P): { q: P; t: number; d: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const L2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
  const q: P = [a[0] + t * dx, a[1] + t * dy]
  return { q, t, d: dist(p, q) }
}

export function fmtLen(cm: number, units: 'm' | 'ft'): string {
  if (units === 'm') return `${(cm / 100).toFixed(2)} m`
  const totalIn = Math.round(cm / 2.54)
  return `${Math.floor(totalIn / 12)}′ ${totalIn % 12}″`
}

export function fmtArea(cm2: number, units: 'm' | 'ft'): string {
  return units === 'm' ? `${(cm2 / 1e4).toFixed(2)} m²` : `${(cm2 / 929.0304).toFixed(1)} ft²`
}
