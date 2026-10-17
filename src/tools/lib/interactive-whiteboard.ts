// Whiteboard model: items, hit testing for the eraser/selection, stroke simplification, pressure → width.

export type Tool = 'pen' | 'marker' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text' | 'note' | 'eraser' | 'move' | 'laser'
export type Bg = 'plain' | 'grid' | 'dots' | 'lines' | 'iso' | 'dark'
export interface Stroke { id: string; kind: 'pen' | 'marker'; color: string; size: number; pts: number[] } // x,y,p triples
export interface ShapeItem { id: string; kind: 'line' | 'arrow' | 'rect' | 'ellipse'; color: string; size: number; fill: boolean; x1: number; y1: number; x2: number; y2: number }
export interface TextItem { id: string; kind: 'text' | 'note'; color: string; size: number; x: number; y: number; text: string }
export type Item = Stroke | ShapeItem | TextItem
export interface Page { id: string; bg: Bg; items: Item[] }

export const BOARD_W = 1600
export const BOARD_H = 1000

/** Line width for a pressure sample (0…1). Mouse/touch report 0.5 while pressed. */
export const widthAt = (size: number, p: number) => size * (0.35 + 1.3 * Math.min(1, Math.max(0, p)))

export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

/** Drops points closer than `minDist` to the previous kept point (keeps first and last). */
export function simplify(pts: number[], minDist = 1.5): number[] {
  if (pts.length <= 6) return pts
  const out = [pts[0], pts[1], pts[2]]
  for (let i = 3; i < pts.length - 3; i += 3) {
    const n = out.length
    if (Math.hypot(pts[i] - out[n - 3], pts[i + 1] - out[n - 2]) >= minDist) out.push(pts[i], pts[i + 1], pts[i + 2])
  }
  out.push(pts[pts.length - 3], pts[pts.length - 2], pts[pts.length - 1])
  return out.map((v) => Math.round(v * 100) / 100)
}

export const textBox = (t: TextItem) => {
  const lines = t.text.split('\n')
  const fs = t.kind === 'note' ? 22 : t.size * 6
  const w = t.kind === 'note' ? 220 : Math.max(...lines.map((l) => l.length)) * fs * 0.55 + 8
  const h = t.kind === 'note' ? Math.max(160, lines.length * fs * 1.3 + 40) : lines.length * fs * 1.25
  return { x: t.x, y: t.y, w, h, fs }
}

export function bounds(it: Item): { x: number; y: number; w: number; h: number } {
  if (it.kind === 'pen' || it.kind === 'marker') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (let i = 0; i < it.pts.length; i += 3) {
      x0 = Math.min(x0, it.pts[i]); x1 = Math.max(x1, it.pts[i])
      y0 = Math.min(y0, it.pts[i + 1]); y1 = Math.max(y1, it.pts[i + 1])
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }
  if (it.kind === 'text' || it.kind === 'note') return textBox(it)
  const sh = it as ShapeItem
  return { x: Math.min(sh.x1, sh.x2), y: Math.min(sh.y1, sh.y2), w: Math.abs(sh.x2 - sh.x1), h: Math.abs(sh.y2 - sh.y1) }
}

/** Is (x, y) on the item (within `tol` board px)? */
export function hit(it: Item, x: number, y: number, tol: number): boolean {
  if (it.kind === 'pen' || it.kind === 'marker') {
    const r = tol + it.size * (it.kind === 'marker' ? 1.5 : 0.8)
    if (it.pts.length === 3) return Math.hypot(x - it.pts[0], y - it.pts[1]) <= r
    for (let i = 3; i < it.pts.length; i += 3) if (segDist(x, y, it.pts[i - 3], it.pts[i - 2], it.pts[i], it.pts[i + 1]) <= r) return true
    return false
  }
  if (it.kind === 'text' || it.kind === 'note') {
    const b = textBox(it)
    return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol
  }
  const r = tol + it.size
  const sh = it as ShapeItem
  if (it.kind === 'line' || it.kind === 'arrow') return segDist(x, y, sh.x1, sh.y1, sh.x2, sh.y2) <= r
  const b = bounds(it)
  if (it.kind === 'rect') {
    const inside = x >= b.x - r && x <= b.x + b.w + r && y >= b.y - r && y <= b.y + b.h + r
    if (!inside) return false
    if (sh.fill) return true
    return x <= b.x + r || x >= b.x + b.w - r || y <= b.y + r || y >= b.y + b.h - r
  }
  // ellipse: normalised radial distance
  const rx = b.w / 2 || 1, ry = b.h / 2 || 1
  const d = Math.hypot((x - b.x - rx) / rx, (y - b.y - ry) / ry)
  return sh.fill ? d <= 1 + r / Math.min(rx, ry) : Math.abs(d - 1) * Math.min(rx, ry) <= r
}

export function moveItem(it: Item, dx: number, dy: number): Item {
  if (it.kind === 'pen' || it.kind === 'marker') return { ...it, pts: it.pts.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v)) }
  if (it.kind === 'text' || it.kind === 'note') return { ...it, x: it.x + dx, y: it.y + dy }
  const sh = it as ShapeItem
  return { ...sh, x1: sh.x1 + dx, y1: sh.y1 + dy, x2: sh.x2 + dx, y2: sh.y2 + dy }
}

/** Arrow head polygon at (x2, y2). */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): [number, number][] {
  const a = Math.atan2(y2 - y1, x2 - x1)
  const L = 10 + size * 3
  return [[x2, y2], [x2 - L * Math.cos(a - 0.45), y2 - L * Math.sin(a - 0.45)], [x2 - L * Math.cos(a + 0.45), y2 - L * Math.sin(a + 0.45)]]
}

/** Snaps a line end to 15° steps (Shift). */
export function snapAngle(x1: number, y1: number, x2: number, y2: number): [number, number] {
  const a = Math.round(Math.atan2(y2 - y1, x2 - x1) / (Math.PI / 12)) * (Math.PI / 12)
  const L = Math.hypot(x2 - x1, y2 - y1)
  return [x1 + L * Math.cos(a), y1 + L * Math.sin(a)]
}
