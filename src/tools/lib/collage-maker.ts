// Collage Maker layout logic: CSS-grid-areas style templates ("aab/aac"), cell rectangles with
// gaps and margins, and cover-fit cropping with zoom and pan.

export interface Area { name: string; r0: number; c0: number; r1: number; c1: number }
export interface Layout { rows: number; cols: number; cells: Area[] }
export interface Rect { x: number; y: number; w: number; h: number }

/** Parses rows separated by "/" (each letter = one grid unit). Every letter must form a rectangle. */
export function parseAreas(t: string): Layout | null {
  const rows = t.split('/').map((r) => r.trim().replace(/\s+/g, ''))
  if (!rows.length || !rows[0]) return null
  const cols = rows[0].length
  if (rows.some((r) => r.length !== cols)) return null
  const seen = new Map<string, Area>()
  rows.forEach((r, i) =>
    [...r].forEach((ch, j) => {
      if (ch === '.') return
      const a = seen.get(ch)
      if (!a) seen.set(ch, { name: ch, r0: i, c0: j, r1: i, c1: j })
      else {
        a.r0 = Math.min(a.r0, i)
        a.c0 = Math.min(a.c0, j)
        a.r1 = Math.max(a.r1, i)
        a.c1 = Math.max(a.c1, j)
      }
    }),
  )
  for (const a of seen.values()) for (let i = a.r0; i <= a.r1; i++) for (let j = a.c0; j <= a.c1; j++) if (rows[i][j] !== a.name) return null
  const cells = [...seen.values()].sort((p, q) => p.r0 - q.r0 || p.c0 - q.c0)
  return { rows: rows.length, cols, cells }
}

/** A plain rows × cols grid as an areas string. */
export function gridAreas(rows: number, cols: number): string {
  const L = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => L[(i * cols + j) % L.length]).join('')).join('/')
}

/** Pixel rectangles for each cell on a W×H canvas with `gap` between cells and `margin` around. */
export function cellRects(l: Layout, W: number, H: number, gap: number, margin: number): Rect[] {
  const iw = W - 2 * margin - gap * (l.cols - 1), ih = H - 2 * margin - gap * (l.rows - 1)
  const cw = iw / l.cols, ch = ih / l.rows
  return l.cells.map((a) => ({
    x: margin + a.c0 * (cw + gap),
    y: margin + a.r0 * (ch + gap),
    w: (a.c1 - a.c0 + 1) * cw + (a.c1 - a.c0) * gap,
    h: (a.r1 - a.r0 + 1) * ch + (a.r1 - a.r0) * gap,
  }))
}

/**
 * Source rectangle of an image so it covers a cell (like object-fit: cover), magnified by `zoom` ≥ 1.
 * `px`/`py` in [-1, 1] pan from the left/top edge (-1) to the right/bottom edge (+1).
 */
export function coverCrop(iw: number, ih: number, cw: number, ch: number, zoom = 1, px = 0, py = 0): { sx: number; sy: number; sw: number; sh: number } {
  const s = Math.max(cw / iw, ch / ih) * Math.max(1, zoom)
  const sw = Math.min(iw, cw / s), sh = Math.min(ih, ch / s)
  const cl = (v: number) => Math.max(-1, Math.min(1, v))
  return { sx: ((iw - sw) / 2) * (1 + cl(px)), sy: ((ih - sh) / 2) * (1 + cl(py)), sw, sh }
}

/** Index of the cell containing point (x, y), or -1. */
export function hitCell(rects: Rect[], x: number, y: number): number {
  return rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
}

export const TEMPLATES: [string, string][] = [
  ['Single', 'a'], ['Side by side', 'ab'], ['Stacked', 'a/b'], ['Big + small', 'aab'],
  ['Three columns', 'abc'], ['Hero left', 'aab/aac'], ['Hero top', 'ab/cc'], ['Tall + two', 'abb/acc'],
  ['2 × 2', 'ab/cd'], ['Banner + three', 'aaa/bcd'], ['Hero + strip', 'aab/aac/aad'], ['Five mosaic', 'aab/aac/dde'],
  ['Five rows', 'aaabbb/ccddee'], ['3 × 2', 'abc/def'], ['Hero + five', 'aab/aac/def'], ['Seven mosaic', 'aabc/aade/fgde'],
  ['Eight mosaic', 'aabc/aade/fghe'], ['4 × 2', 'abcd/efgh'], ['3 × 3', 'abc/def/ghi'], ['Polaroid wall', 'abbc/addc/effg'],
]
