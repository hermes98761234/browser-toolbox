// Image annotation geometry: shapes, hit testing, arrowheads and pixelation.

export type Kind = 'arrow' | 'rect' | 'ellipse' | 'line' | 'pen' | 'text' | 'highlight' | 'pixelate' | 'blur' | 'redact' | 'step'

export interface Shape {
  id: string
  kind: Kind
  x1: number
  y1: number
  x2: number
  y2: number
  pts?: [number, number][]
  color: string
  width: number
  text?: string
  n?: number
}

export const AREA_KINDS: Kind[] = ['rect', 'ellipse', 'highlight', 'pixelate', 'blur', 'redact']

export function bounds(s: Shape): { x: number; y: number; w: number; h: number } {
  if (s.kind === 'pen' && s.pts?.length) {
    const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1])
    const x = Math.min(...xs), y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }
  if (s.kind === 'step') {
    const r = stepRadius(s.width)
    return { x: s.x1 - r, y: s.y1 - r, w: 2 * r, h: 2 * r }
  }
  if (s.kind === 'text') {
    const fs = textSize(s.width)
    const ls = (s.text ?? '').split('\n')
    const w = Math.max(...ls.map((l) => l.length)) * fs * 0.56
    return { x: s.x1, y: s.y1, w: Math.max(fs, w + fs * 0.6), h: ls.length * fs * 1.25 + fs * 0.4 }
  }
  return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) }
}

export const stepRadius = (w: number) => 10 + w * 3
export const textSize = (w: number) => 14 + w * 4

/** Distance from point p to segment ab. */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Does point (x,y) hit the shape? `tol` in image pixels. */
export function hit(s: Shape, x: number, y: number, tol: number): boolean {
  const t = tol + s.width / 2
  if (s.kind === 'arrow' || s.kind === 'line') return segDist(x, y, s.x1, s.y1, s.x2, s.y2) <= t
  if (s.kind === 'pen') return (s.pts ?? []).some((p, i, a) => i > 0 && segDist(x, y, a[i - 1][0], a[i - 1][1], p[0], p[1]) <= t)
  if (s.kind === 'step') return Math.hypot(x - s.x1, y - s.y1) <= stepRadius(s.width) + tol
  const b = bounds(s)
  if (s.kind === 'rect') {
    const inside = x >= b.x - t && x <= b.x + b.w + t && y >= b.y - t && y <= b.y + b.h + t
    const core = x > b.x + t && x < b.x + b.w - t && y > b.y + t && y < b.y + b.h - t
    return inside && !core
  }
  if (s.kind === 'ellipse') {
    const rx = b.w / 2, ry = b.h / 2
    if (rx < 1 || ry < 1) return false
    const v = ((x - b.x - rx) / rx) ** 2 + ((y - b.y - ry) / ry) ** 2
    return Math.abs(Math.sqrt(v) - 1) * Math.min(rx, ry) <= t
  }
  return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol
}

/** Arrowhead polygon (tip + two barbs) for a shaft from (x1,y1) to (x2,y2). */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, width: number): [number, number][] {
  const a = Math.atan2(y2 - y1, x2 - x1)
  const len = Math.min(Math.hypot(x2 - x1, y2 - y1) * 0.5, 10 + width * 3.5)
  const spread = Math.PI / 7
  return [
    [x2, y2],
    [x2 - len * Math.cos(a - spread), y2 - len * Math.sin(a - spread)],
    [x2 - len * Math.cos(a + spread), y2 - len * Math.sin(a + spread)],
  ]
}

/** Pixelates RGBA data in place with square blocks of `block` px (block average). */
export function pixelate(data: Uint8ClampedArray, w: number, h: number, block: number): void {
  const b = Math.max(1, Math.round(block))
  for (let by = 0; by < h; by += b)
    for (let bx = 0; bx < w; bx += b) {
      const ex = Math.min(w, bx + b), ey = Math.min(h, by + b)
      const sum = [0, 0, 0, 0]
      let n = 0
      for (let y = by; y < ey; y++)
        for (let x = bx; x < ex; x++) {
          const i = (y * w + x) * 4
          for (let c = 0; c < 4; c++) sum[c] += data[i + c]
          n++
        }
      for (let y = by; y < ey; y++)
        for (let x = bx; x < ex; x++) {
          const i = (y * w + x) * 4
          for (let c = 0; c < 4; c++) data[i + c] = Math.round(sum[c] / n)
        }
    }
}

export function move(s: Shape, dx: number, dy: number): Shape {
  return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy, pts: s.pts?.map(([x, y]) => [x + dx, y + dy]) }
}

/** Next free number for step badges. */
export const nextStep = (shapes: Shape[]) => shapes.reduce((m, s) => (s.kind === 'step' ? Math.max(m, s.n ?? 0) : m), 0) + 1
