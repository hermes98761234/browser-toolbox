// Pure helpers for the PDF page numberer: number styles, label templates and placement
// in PDF user space (origin bottom-left, y up).

export type Style = 'arabic' | 'roman' | 'ROMAN' | 'alpha' | 'ALPHA'
export type Spot = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'

export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n)
  const table: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  let rest = n
  for (const [v, s] of table) while (rest >= v) {
    out += s
    rest -= v
  }
  return out
}

/** 1 → A, 26 → Z, 27 → AA (spreadsheet-style bijective base 26). */
export function toAlpha(n: number): string {
  if (!Number.isInteger(n) || n < 1) return String(n)
  let out = ''
  let k = n
  while (k > 0) {
    const r = (k - 1) % 26
    out = String.fromCharCode(65 + r) + out
    k = Math.floor((k - 1) / 26)
  }
  return out
}

export function styled(n: number, style: Style, pad = 0): string {
  switch (style) {
    case 'roman': return toRoman(n).toLowerCase()
    case 'ROMAN': return toRoman(n)
    case 'alpha': return toAlpha(n).toLowerCase()
    case 'ALPHA': return toAlpha(n)
    default: return n < 0 ? String(n) : String(n).padStart(pad, '0')
  }
}

export interface Ctx { n: number; total: number; page: number; pages: number; file: string; date: string }

/** Fills {n} {total} {page} {pages} {file} {date} in a template. */
export function fillTemplate(t: string, c: Ctx, style: Style, pad: number): string {
  return t
    .replace(/\{n\}/g, styled(c.n, style, pad))
    .replace(/\{total\}/g, styled(c.total, style, pad))
    .replace(/\{page\}/g, String(c.page))
    .replace(/\{pages\}/g, String(c.pages))
    .replace(/\{file\}/g, c.file.replace(/\.pdf$/i, ''))
    .replace(/\{date\}/g, c.date)
}

/** For each 1-based page in `selected`, the displayed number; total is the last number shown. */
export function numbering(selected: number[], start: number): { map: Map<number, number>; total: number } {
  const map = new Map<number, number>()
  selected.forEach((p, i) => map.set(p, start + i))
  return { map, total: start + Math.max(0, selected.length - 1) }
}

/** Mirrors left/right on even pages (book layout: numbers on the outside edge). */
export function mirrorSpot(spot: Spot, page: number, mirror: boolean): Spot {
  if (!mirror || page % 2 === 1) return spot
  if (spot.endsWith('left')) return spot.replace('left', 'right') as Spot
  if (spot.endsWith('right')) return spot.replace('right', 'left') as Spot
  return spot
}

/**
 * Baseline origin for text of width `tw` and font size `size` on a page box
 * (x0, y0, w, h) with margins mx (sides) and my (top/bottom edge to text).
 */
export function place(spot: Spot, box: { x: number; y: number; w: number; h: number }, tw: number, size: number, mx: number, my: number): [number, number] {
  const [v, hz] = spot.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right']
  const x = hz === 'left' ? box.x + mx : hz === 'right' ? box.x + box.w - mx - tw : box.x + (box.w - tw) / 2
  // Cap height ≈ 0.72 em: the top line's caps touch the margin, the bottom line's baseline sits on it.
  const y = v === 'top' ? box.y + box.h - my - size * 0.72 : box.y + my
  return [x, y]
}

/** Maps a point in the displayed (rotated) page to PDF user space; returns [x, y, textRotationDeg]. */
export function toUser(vx: number, vy: number, rot: number, box: { x: number; y: number; w: number; h: number }): [number, number, number] {
  const r = ((rot % 360) + 360) % 360
  if (r === 90) return [box.x + box.w - vy, box.y + vx, 90]
  if (r === 180) return [box.x + box.w - vx, box.y + box.h - vy, 180]
  if (r === 270) return [box.x + vy, box.y + box.h - vx, 270]
  return [box.x + vx, box.y + vy, 0]
}

/** Size of the page as displayed (width/height swap for 90° and 270°). */
export const visualSize = (w: number, h: number, rot: number): [number, number] => (((rot % 180) + 180) % 180 === 90 ? [h, w] : [w, h])
