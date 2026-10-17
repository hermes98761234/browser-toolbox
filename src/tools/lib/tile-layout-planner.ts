// Tile layout geometry: lays tiles in a pattern over a (rectangular or L-shaped) room, clips them
// to the room and counts full and cut tiles. All lengths in metres.

export type Pattern = 'straight' | 'brick2' | 'brick3' | 'diagonal' | 'herring' | 'herring45'
export type Pt = [number, number]
export interface Rect { x0: number; z0: number; x1: number; z1: number }

export interface Layout {
  W: number; L: number // room size
  notchW: number; notchL: number // L-shape notch at the far-right corner (0 = rectangle)
  tw: number; th: number // tile size (tw along x before rotation)
  grout: number
  pattern: Pattern
  start: 'center' | 'corner'
}

export interface TilePiece { parts: Pt[][]; cut: boolean; frac: number }
export interface LayoutResult { pieces: TilePiece[]; full: number; cut: number; slivers: number; area: number; outline: Pt[] }

export const polyArea = (p: Pt[]) => {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i]
    const [x2, z2] = p[(i + 1) % p.length]
    a += x1 * z2 - x2 * z1
  }
  return Math.abs(a) / 2
}

/** Sutherland–Hodgman clip of a convex polygon against an axis-aligned rectangle. */
export function clipRect(poly: Pt[], r: Rect): Pt[] {
  let out = poly
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p[0] >= r.x0, (a, b) => lerpX(a, b, r.x0)],
    [(p) => p[0] <= r.x1, (a, b) => lerpX(a, b, r.x1)],
    [(p) => p[1] >= r.z0, (a, b) => lerpZ(a, b, r.z0)],
    [(p) => p[1] <= r.z1, (a, b) => lerpZ(a, b, r.z1)],
  ]
  for (const [inside, cross] of edges) {
    const inp = out
    out = []
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i]
      const b = inp[(i + 1) % inp.length]
      const ia = inside(a), ib = inside(b)
      if (ia) out.push(a)
      if (ia !== ib) out.push(cross(a, b))
    }
    if (!out.length) return out
  }
  return out
}
const lerpX = (a: Pt, b: Pt, x: number): Pt => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])]
const lerpZ = (a: Pt, b: Pt, z: number): Pt => [a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]), z]

/** Room as disjoint rectangles plus its outline. */
export function roomShape(W: number, L: number, nw: number, nl: number): { rects: Rect[]; outline: Pt[] } {
  if (!(nw > 0 && nl > 0) || nw >= W || nl >= L) return { rects: [{ x0: 0, z0: 0, x1: W, z1: L }], outline: [[0, 0], [W, 0], [W, L], [0, L]] }
  return {
    rects: [{ x0: 0, z0: 0, x1: W - nw, z1: L }, { x0: W - nw, z0: 0, x1: W, z1: L - nl }],
    outline: [[0, 0], [W, 0], [W, L - nl], [W - nw, L - nl], [W - nw, L], [0, L]],
  }
}

/** Tile rectangles in pattern space (u, v), covering a disc of radius R around the origin. */
export function patternCells(p: Pattern, a: number, b: number, g: number, R: number): Rect[] {
  const out: Rect[] = []
  const A = a + g, B = b + g // pitch
  const near = (r: Rect) => Math.max(Math.abs(r.x0), Math.abs(r.x1)) <= R + A && Math.max(Math.abs(r.z0), Math.abs(r.z1)) <= R + A
  const push = (x: number, z: number, w: number, h: number) => {
    const r = { x0: x, z0: z, x1: x + w, z1: z + h }
    if (near(r)) out.push(r)
  }
  if (p === 'herring' || p === 'herring45') {
    const Lg = Math.max(a, b) + g, Sg = Math.min(a, b) + g
    const lo = Math.max(a, b), sh = Math.min(a, b)
    const N = Math.ceil((2 * R) / Sg) + 4, M = Math.ceil((2 * R) / Lg) + 4
    for (let i = -N; i <= N; i++)
      for (let j = -M; j <= M; j++) {
        // lattice: (Sg, Sg) along a staircase and (Lg+Sg, Sg-Lg) to the next staircase;
        // each cell holds one horizontal and one vertical tile
        const x = i * Sg + j * (Lg + Sg), z = i * Sg + j * (Sg - Lg)
        if (Math.hypot(x, z) > R + 2 * Lg) continue
        push(x, z, lo, sh)
        push(x + Lg, z + Sg - Lg, sh, lo)
      }
    return out
  }
  const nx = Math.ceil(R / A) + 2, nz = Math.ceil(R / B) + 2
  for (let j = -nz; j <= nz; j++) {
    const off = p === 'brick2' ? ((((j % 2) + 2) % 2) * A) / 2 : p === 'brick3' ? ((((j % 3) + 3) % 3) * A) / 3 : 0
    for (let i = -nx - 1; i <= nx; i++) push(i * A + off, j * B, a, b)
  }
  return out
}

export function layout(o: Layout): LayoutResult {
  const { rects, outline } = roomShape(o.W, o.L, o.notchW, o.notchL)
  const area = rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0)
  const rot = o.pattern === 'diagonal' || o.pattern === 'herring45' ? Math.PI / 4 : 0
  const cx = o.start === 'center' ? o.W / 2 : 0
  const cz = o.start === 'center' ? o.L / 2 : 0
  // Pattern origin: centred on the room (a grout joint crosses the centre) or at the near-left corner.
  const R = Math.hypot(o.W, o.L) + Math.max(o.tw, o.th)
  const cells = patternCells(o.pattern, o.tw, o.th, o.grout, R)
  const c = Math.cos(rot), s = Math.sin(rot)
  const tileA = o.tw * o.th
  const pieces: TilePiece[] = []
  let full = 0, cut = 0, slivers = 0
  for (const r of cells) {
    const poly: Pt[] = ([[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]] as Pt[]).map(([u, v]) => [cx + u * c - v * s, cz + u * s + v * c])
    const parts = rects.map((rc) => clipRect(poly, rc)).filter((p) => p.length >= 3 && polyArea(p) > 1e-9)
    if (!parts.length) continue
    const frac = parts.reduce((a, p) => a + polyArea(p), 0) / tileA
    if (frac < 1e-4) continue
    const isCut = frac < 0.999
    if (isCut) {
      cut++
      if (frac < 0.2) slivers++
    } else full++
    pieces.push({ parts, cut: isCut, frac })
  }
  return { pieces, full, cut, slivers, area, outline }
}

/** Grout needed in kg: ((A+B)/(A·B)) · joint width · depth · area · density (all mm, 1.6 kg/dm³ typical). */
export function groutKg(tileMmA: number, tileMmB: number, jointMm: number, depthMm: number, areaM2: number, density = 1.6) {
  if (!(tileMmA > 0 && tileMmB > 0)) return 0
  return ((tileMmA + tileMmB) / (tileMmA * tileMmB)) * jointMm * depthMm * density * areaM2
}

export const WASTE: Record<Pattern, number> = { straight: 10, brick2: 10, brick3: 10, diagonal: 15, herring: 15, herring45: 20 }
