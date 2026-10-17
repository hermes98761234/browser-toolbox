// Page geometry for Images To PDF: page presets (PDF points), orientation and image placement.

export const MM = 72 / 25.4

export const PAGES = {
  a4: { label: 'A4', w: 210 * MM, h: 297 * MM },
  letter: { label: 'US Letter', w: 612, h: 792 },
  legal: { label: 'US Legal', w: 612, h: 1008 },
  a5: { label: 'A5', w: 148 * MM, h: 210 * MM },
  a3: { label: 'A3', w: 297 * MM, h: 420 * MM },
  fit: { label: 'Fit to image', w: 0, h: 0 },
} as const
export type PageKey = keyof typeof PAGES
export type Orient = 'auto' | 'portrait' | 'landscape'
export type Fit = 'contain' | 'cover' | 'stretch' | 'actual'

/** Page size in points for an image of the given pixel size (96 dpi for "fit to image" / "actual"). */
export function pageSize(key: PageKey, orient: Orient, imgW: number, imgH: number, marginPt: number): [number, number] {
  if (key === 'fit') {
    const s = 72 / 96
    return [imgW * s + 2 * marginPt, imgH * s + 2 * marginPt]
  }
  const { w, h } = PAGES[key]
  const land = orient === 'landscape' || (orient === 'auto' && imgW > imgH)
  return land ? [h, w] : [w, h]
}

export interface Placement { x: number; y: number; w: number; h: number; clip: boolean }

/** Where to draw the image (PDF coordinates, origin bottom-left), centred inside the margins. */
export function place(imgW: number, imgH: number, pageW: number, pageH: number, marginPt: number, fit: Fit): Placement {
  const bw = Math.max(1, pageW - 2 * marginPt)
  const bh = Math.max(1, pageH - 2 * marginPt)
  let w: number, h: number
  if (fit === 'stretch') [w, h] = [bw, bh]
  else if (fit === 'actual') {
    const s = Math.min(72 / 96, bw / imgW, bh / imgH)
    ;[w, h] = [imgW * s, imgH * s]
  } else {
    const s = fit === 'contain' ? Math.min(bw / imgW, bh / imgH) : Math.max(bw / imgW, bh / imgH)
    ;[w, h] = [imgW * s, imgH * s]
  }
  return { x: marginPt + (bw - w) / 2, y: marginPt + (bh - h) / 2, w, h, clip: fit === 'cover' }
}

/** Effective print resolution of an image drawn w points wide. */
export const effectiveDpi = (imgW: number, drawnPt: number) => (drawnPt > 0 ? (imgW / drawnPt) * 72 : 0)

/** Moves item `from` to index `to`. */
export function move<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= arr.length) return arr
  const out = arr.slice()
  const [x] = out.splice(from, 1)
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x)
  return out
}
