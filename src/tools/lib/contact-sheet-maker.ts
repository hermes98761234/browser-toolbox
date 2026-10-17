// Contact sheet helpers: EXIF capture-date reader (JPEG/TIFF) and print grid layout in millimetres.

/** Reads DateTimeOriginal (or DateTime) from a JPEG's EXIF block. Returns "YYYY-MM-DD HH:MM" or null. */
export function exifDate(buf: ArrayBuffer): string | null {
  const v = new DataView(buf)
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null
  let p = 2
  while (p + 4 <= v.byteLength) {
    if (v.getUint8(p) !== 0xff) return null
    const marker = v.getUint8(p + 1)
    const len = v.getUint16(p + 2)
    if (marker === 0xda || marker === 0xd9) return null // image data starts: no EXIF
    if (marker === 0xe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966 && v.getUint16(p + 8) === 0) {
      return tiffDate(v, p + 10)
    }
    p += 2 + len
  }
  return null
}

function tiffDate(v: DataView, t: number): string | null {
  if (t + 8 > v.byteLength) return null
  const le = v.getUint16(t) === 0x4949
  const u16 = (o: number) => v.getUint16(t + o, le)
  const u32 = (o: number) => v.getUint32(t + o, le)
  const readIfd = (off: number) => {
    const tags = new Map<number, { type: number; count: number; at: number }>()
    if (off + 2 > v.byteLength - t) return tags
    const n = u16(off)
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12
      if (t + e + 12 > v.byteLength) break
      tags.set(u16(e), { type: u16(e + 2), count: u32(e + 4), at: e + 8 })
    }
    return tags
  }
  const ascii = (tag?: { type: number; count: number; at: number }) => {
    if (!tag || tag.type !== 2) return null
    const start = tag.count > 4 ? u32(tag.at) : tag.at
    let s = ''
    for (let i = 0; i < tag.count - 1 && t + start + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(t + start + i))
    return s
  }
  const ifd0 = readIfd(u32(4))
  const exifPtr = ifd0.get(0x8769)
  const sub = exifPtr ? readIfd(u32(exifPtr.at)) : new Map()
  const raw = ascii(sub.get(0x9003)) ?? ascii(sub.get(0x9004)) ?? ascii(ifd0.get(0x0132))
  const m = raw && /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(raw)
  return m && m[1] !== '0000' ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : null
}

export const PAGES: Record<string, [number, number]> = {
  A4: [210, 297],
  Letter: [215.9, 279.4],
  A3: [297, 420],
  Legal: [215.9, 355.6],
  '4×6 in': [101.6, 152.4],
  '8×10 in': [203.2, 254],
}

export interface GridSpec {
  pageW: number
  pageH: number
  margin: number
  gap: number
  cols: number
  rows: number
  header: number // mm reserved at top for the title
  caption: number // mm reserved under each thumbnail
}

export interface Cell {
  x: number
  y: number
  w: number
  h: number // image box height (caption sits below, inside the cell)
}

/** Cell rectangles (mm) for one page, row-major. */
export function grid(g: GridSpec): Cell[] {
  const cols = Math.max(1, Math.floor(g.cols)), rows = Math.max(1, Math.floor(g.rows))
  const innerW = g.pageW - 2 * g.margin
  const innerH = g.pageH - 2 * g.margin - g.header
  const cw = (innerW - (cols - 1) * g.gap) / cols
  const ch = (innerH - (rows - 1) * g.gap) / rows
  const cells: Cell[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      cells.push({ x: g.margin + c * (cw + g.gap), y: g.margin + g.header + r * (ch + g.gap), w: cw, h: Math.max(0, ch - g.caption) })
  return cells
}

/** Draw rectangle for an image of aspect `a` (w/h) inside a box, for "fit" (contain) or "fill" (cover). */
export function fitRect(a: number, box: Cell, mode: 'fit' | 'fill'): { dx: number; dy: number; dw: number; dh: number } {
  const ba = box.w / (box.h || 1)
  const wider = a > ba
  const useW = mode === 'fit' ? wider : !wider
  const dw = useW ? box.w : box.h * a
  const dh = useW ? box.w / a : box.h
  return { dx: box.x + (box.w - dw) / 2, dy: box.y + (box.h - dh) / 2, dw, dh }
}

export const pagesNeeded = (n: number, cols: number, rows: number) => Math.max(1, Math.ceil(n / Math.max(1, cols * rows)))
