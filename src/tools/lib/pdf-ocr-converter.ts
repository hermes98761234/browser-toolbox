// Searchable-PDF helpers: page geometry, line grouping of detected text, invisible-text placement.

/** Fractional box on a page: top-left origin, 0..1 of page width/height. */
export interface FBox { x: number; y: number; w: number; h: number }
export interface Det { text: string; x: number; y: number; w: number; h: number } // pixels, top-left origin

export const PAPER: Record<string, [number, number] | null> = { image: null, a4: [595.28, 841.89], letter: [612, 792] }

/** PDF page size (pt) and image placement for an image of w×h px at `dpi`, optionally fitted onto paper. */
export function pageFor(w: number, h: number, dpi: number, paper: 'image' | 'a4' | 'letter') {
  const natW = (w * 72) / dpi, natH = (h * 72) / dpi
  const p = PAPER[paper]
  if (!p) return { pw: natW, ph: natH, ix: 0, iy: 0, iw: natW, ih: natH }
  // rotate paper to match image orientation
  const [pw, ph] = w > h ? [Math.max(...p), Math.min(...p)] : [Math.min(...p), Math.max(...p)]
  const k = Math.min(pw / natW, ph / natH)
  const iw = natW * k, ih = natH * k
  return { pw, ph, ix: (pw - iw) / 2, iy: (ph - ih) / 2, iw, ih }
}

/** Groups word/line detections into reading-order lines (same row when vertical centres overlap). */
export function groupLines(dets: Det[]): Det[] {
  const sorted = [...dets].filter((d) => d.text.trim()).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2))
  const rows: Det[][] = []
  for (const d of sorted) {
    const cy = d.y + d.h / 2
    const row = rows.find((r) => {
      const top = Math.min(...r.map((q) => q.y)), bot = Math.max(...r.map((q) => q.y + q.h))
      return cy > top && cy < bot && Math.abs(d.h - r[0].h) < Math.max(d.h, r[0].h) * 0.6
    })
    if (row) row.push(d)
    else rows.push([d])
  }
  return rows
    .map((r) => {
      r.sort((a, b) => a.x - b.x)
      const x = Math.min(...r.map((q) => q.x)), y = Math.min(...r.map((q) => q.y))
      const x2 = Math.max(...r.map((q) => q.x + q.w)), y2 = Math.max(...r.map((q) => q.y + q.h))
      return { text: r.map((q) => q.text.trim()).join(' '), x, y, w: x2 - x, h: y2 - y }
    })
    .sort((a, b) => a.y - b.y || a.x - b.x)
}

/** Even top-to-bottom flow of `n` lines when no positions are known. */
export function flowBoxes(n: number, margin = 0.08, minLines = 40): FBox[] {
  const slots = Math.max(n, minLines)
  const lh = (1 - 2 * margin) / slots
  return Array.from({ length: n }, (_, i) => ({ x: margin, y: margin + i * lh, w: 1 - 2 * margin, h: lh * 0.8 }))
}

/**
 * Placement of an invisible line in PDF space (bottom-left origin).
 * `width1` = text width at 1 pt. Returns font size, baseline origin and horizontal scaling (Tz %).
 */
export function placeLine(box: FBox, area: { x: number; y: number; w: number; h: number }, width1: number, fitWidth = true) {
  const hPt = box.h * area.h
  const size = Math.max(1, hPt * 0.92)
  const x = area.x + box.x * area.w
  const bottom = area.y + area.h - (box.y + box.h) * area.h
  const y = bottom + size * 0.2 // Helvetica descent ≈ 0.207 em
  const natural = width1 * size
  const wanted = box.w * area.w
  const squeeze = fitWidth && natural > 0 ? Math.min(500, Math.max(5, (wanted / natural) * 100)) : 100
  return { x, y, size, squeeze }
}

/** Splits a bulk paste into pages on form feeds or separator lines like "--- page 2 ---" / "=====". */
export function splitPages(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\f|^[ \t]*(?:-{3,}|={3,})[ \t]*(?:page[ \t]*\d*)?[ \t]*(?:-{3,}|={3,})?[ \t]*$/gim)
    .map((p) => p.replace(/^\n+|\n+$/g, ''))
    .filter((p, i, a) => p.trim() || (i > 0 && i < a.length - 1))
}

export const lines = (t: string) => t.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim())

export const kb = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`)
