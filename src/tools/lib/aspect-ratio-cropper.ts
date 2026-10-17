// Aspect-ratio presets (social, print, screen), orientation handling, batch crop placement and print-resolution checks.
import type { Rect } from './image-cropper'

export type Group = 'Social' | 'Print' | 'Screen & photo'
/** [key, label, w, h, group, print size in inches (long × short) or null] */
export const RATIOS: [string, string, number, number, Group, [number, number] | null][] = [
  ['sq', 'Square 1:1', 1, 1, 'Social', null],
  ['ig45', 'Instagram portrait 4:5', 4, 5, 'Social', null],
  ['story', 'Story / Reels / TikTok 9:16', 9, 16, 'Social', null],
  ['og', 'Link preview 1.91:1', 1.91, 1, 'Social', null],
  ['pin', 'Pinterest 2:3', 2, 3, 'Social', null],
  ['hdr', 'X / LinkedIn header 3:1', 3, 1, 'Social', null],
  ['p46', 'Print 4×6 in (3:2)', 6, 4, 'Print', [6, 4]],
  ['p57', 'Print 5×7 in', 7, 5, 'Print', [7, 5]],
  ['p810', 'Print 8×10 in (5:4)', 10, 8, 'Print', [10, 8]],
  ['p1114', 'Print 11×14 in', 14, 11, 'Print', [14, 11]],
  ['p1216', 'Print 12×16 in (4:3)', 16, 12, 'Print', [16, 12]],
  ['p1620', 'Print 16×20 in (5:4)', 20, 16, 'Print', [20, 16]],
  ['p2030', 'Print 20×30 in (3:2)', 30, 20, 'Print', [30, 20]],
  ['a4', 'A-series A4/A3 (√2:1)', Math.SQRT2, 1, 'Print', [11.69, 8.27]],
  ['letter', 'US Letter 8.5×11 in', 11, 8.5, 'Print', [11, 8.5]],
  ['r169', 'Widescreen 16:9', 16, 9, 'Screen & photo', null],
  ['r1610', 'Laptop 16:10', 16, 10, 'Screen & photo', null],
  ['r43', 'Classic 4:3', 4, 3, 'Screen & photo', null],
  ['r32', '35 mm photo 3:2', 3, 2, 'Screen & photo', null],
  ['r219', 'Cinema 21:9', 21, 9, 'Screen & photo', null],
  ['custom', 'Custom…', 1, 1, 'Screen & photo', null],
]

/** Parses "16:9", "16x9", "1.85" or "4/5" into w/h. */
export function parseRatio(s: string): number | null {
  const m = /^\s*([\d.]+)\s*(?:[:x×/]\s*([\d.]+))?\s*$/i.exec(s)
  if (!m) return null
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : 1
  return a > 0 && b > 0 && Number.isFinite(a / b) ? a / b : null
}

export type Orient = 'auto' | 'landscape' | 'portrait' | 'as-is'
/** Applies orientation: auto matches the photo (portrait photo → tall crop). */
export function orientRatio(r: number, W: number, H: number, mode: Orient): number {
  if (mode === 'as-is' || r === 1) return r
  const land = r > 1 ? r : 1 / r
  const wantLand = mode === 'landscape' || (mode === 'auto' && W >= H)
  return wantLand ? land : 1 / land
}

/** Largest crop of ratio r (w/h) inside W×H centred on (cx, cy) as fractions, clamped inside the image. */
export function fitCrop(W: number, H: number, r: number, cx = 0.5, cy = 0.5, scale = 1): Rect {
  let w = W, h = W / r
  if (h > H) { h = H; w = H * r }
  w *= scale
  h *= scale
  const x = Math.min(W - w, Math.max(0, cx * W - w / 2))
  const y = Math.min(H - h, Math.max(0, cy * H - h / 2))
  return { x, y, w, h }
}

/** Effective print resolution of a crop printed at `inches` (long × short side). */
export function printDpi(crop: Rect, inches: [number, number]): number {
  const long = Math.max(crop.w, crop.h), short = Math.min(crop.w, crop.h)
  return Math.min(long / inches[0], short / inches[1])
}

export const dpiVerdict = (dpi: number) => (dpi >= 300 ? 'Excellent' : dpi >= 200 ? 'Good' : dpi >= 150 ? 'Acceptable' : 'Too low')

/** Golden-section guide positions (fractions). */
export const PHI = [1 - 1 / ((1 + Math.sqrt(5)) / 2), 1 / ((1 + Math.sqrt(5)) / 2)]
