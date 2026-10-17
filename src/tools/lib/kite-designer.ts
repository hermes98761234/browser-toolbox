// Parametric kite geometry (mm): sail outlines, spar cut list, bridle/keel leg lengths, sail area,
// hem offsets, wind estimate, and how to tile a full-size pattern onto printer pages.

export type Shape = 'diamond' | 'delta' | 'rokkaku'
export type Pt = [number, number] // x right, y down from the nose (mm)

export interface KiteParams {
  shape: Shape
  spine: number // diamond/rokkaku: spine length; delta: centre spine length
  span: number // diamond: cross spar; delta: wingspan; rokkaku: spar width
  crossAt: number // diamond: spar position from nose (fraction of spine)
  tipDrop: number // delta: vertical distance nose → wing tips
  spreaderAt: number // delta: spreader position along leading edge (fraction from nose)
  endWidth: number // rokkaku: width of top/bottom edge as fraction of span
  towAt: number // tow point / keel tip projected on spine (fraction from nose)
  bridleDepth: number // height of tow point above the sail (mm)
}

export const DEFAULTS: Record<Shape, KiteParams> = {
  diamond: { shape: 'diamond', spine: 900, span: 800, crossAt: 0.22, tipDrop: 0, spreaderAt: 0.5, endWidth: 0.5, towAt: 0.32, bridleDepth: 450 },
  delta: { shape: 'delta', spine: 750, span: 1500, crossAt: 0.2, tipDrop: 900, spreaderAt: 0.55, endWidth: 0.5, towAt: 0.33, bridleDepth: 250 },
  rokkaku: { shape: 'rokkaku', spine: 1000, span: 800, crossAt: 0.2, tipDrop: 0, spreaderAt: 0.5, endWidth: 0.5, towAt: 0.4, bridleDepth: 600 },
}

export function outline(p: KiteParams): Pt[] {
  const h = p.span / 2
  if (p.shape === 'diamond') return [[0, 0], [h, p.crossAt * p.spine], [0, p.spine], [-h, p.crossAt * p.spine]]
  if (p.shape === 'delta') return [[0, 0], [h, p.tipDrop], [0, p.spine], [-h, p.tipDrop]]
  const e = (p.endWidth * p.span) / 2, y1 = 0.2 * p.spine, y2 = 0.8 * p.spine
  return [[-e, 0], [e, 0], [h, y1], [h, y2], [e, p.spine], [-e, p.spine], [-h, y2], [-h, y1]]
}

/** Shoelace area (mm², always positive). */
export function area(poly: Pt[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

export interface Spar { name: string; length: number; qty: number }
export function spars(p: KiteParams): Spar[] {
  if (p.shape === 'diamond') return [{ name: 'Spine', length: p.spine, qty: 1 }, { name: 'Cross spar', length: p.span, qty: 1 }]
  if (p.shape === 'delta') {
    const le = Math.hypot(p.span / 2, p.tipDrop)
    return [{ name: 'Spine', length: p.spine, qty: 1 }, { name: 'Leading edge', length: le, qty: 2 }, { name: 'Spreader', length: p.spreaderAt * p.span, qty: 1 }]
  }
  return [{ name: 'Spine', length: p.spine, qty: 1 }, { name: 'Cross spar', length: p.span, qty: 2 }]
}

/** Attachment points along the spine (mm from nose) for the bridle (or keel base for a delta). */
export function attachments(p: KiteParams): [number, number] {
  if (p.shape === 'diamond') return [p.crossAt * p.spine, 0.8 * p.spine]
  if (p.shape === 'delta') return [0.15 * p.spine, 0.85 * p.spine]
  return [0.2 * p.spine, 0.8 * p.spine]
}

/**
 * Two-leg bridle (or keel): legs from the attachments a1, a2 to a tow point projected at `towAt`
 * along the spine and `depth` above it.
 */
export function bridle(p: KiteParams) {
  const [a1, a2] = attachments(p)
  const t = Math.max(a1, Math.min(a2, p.towAt * p.spine))
  const h = Math.max(1, p.bridleDepth)
  const upper = Math.hypot(t - a1, h), lower = Math.hypot(a2 - t, h)
  return { a1, a2, tow: t, upper, lower, total: upper + lower, angle: (Math.atan2(h, t - a1) * 180) / Math.PI }
}

/** Offsets a simple polygon outward by d (miter joins, capped at 4d for sharp tips). */
export function offset(poly: Pt[], d: number): Pt[] {
  const n = poly.length
  let sgn = 0
  for (let i = 0; i < n; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n]; sgn += x1 * y2 - x2 * y1 }
  const s = sgn > 0 ? -1 : 1 // y-down: positive shoelace = clockwise on screen, outward normal is (dy, −dx)
  return poly.map((p, i) => {
    const a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n]
    const n1 = norm(a, p, s), n2 = norm(p, b, s)
    const bx = n1[0] + n2[0], by = n1[1] + n2[1]
    const bl = Math.hypot(bx, by) || 1
    const cos = (n1[0] * n2[0] + n1[1] * n2[1] + 1) / 2 // cos² of half angle
    const k = Math.min(4, 1 / Math.sqrt(Math.max(1e-6, cos)))
    return [p[0] + (bx / bl) * d * k, p[1] + (by / bl) * d * k] as Pt
  })
}
function norm(a: Pt, b: Pt, s: number): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1
  return [(-dy / l) * s, (dx / l) * s]
}

export function bbox(poly: Pt[]) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1])
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

/** Number of tiles to cover w × h mm with pages whose printable area is pw × ph, overlapping by `ov`. */
export function tiling(w: number, h: number, pw: number, ph: number, ov: number) {
  const sx = pw - ov, sy = ph - ov
  const cols = Math.max(1, Math.ceil((w - ov) / sx)), rows = Math.max(1, Math.ceil((h - ov) / sy))
  return { cols, rows, pages: cols * rows, stepX: sx, stepY: sy }
}

/**
 * Minimum flying wind (km/h) from lift = weight: v = √(2·m·g / (ρ·A·CL)). Uses sail fabric weight
 * (g/m²) and spar weight (g/m), with a lift coefficient typical for flat/bowed hobby kites.
 */
export function minWind(p: KiteParams, sailGsm: number, sparGpm: number, cl = 0.6) {
  const A = area(outline(p)) / 1e6
  const sparLen = spars(p).reduce((a, s) => a + (s.length * s.qty) / 1000, 0)
  const mass = (A * sailGsm * 1.15 + sparLen * sparGpm + 8) / 1000 // + hems/tape/fittings, kg
  const v = Math.sqrt((2 * mass * 9.81) / (1.225 * A * cl))
  return { area: A, mass, loading: (mass * 1000) / A, kmh: v * 3.6 }
}

export const beaufort = (kmh: number) => [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118].findIndex((b) => kmh < b)
