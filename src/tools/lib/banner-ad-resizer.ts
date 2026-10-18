// Banner layout engine: each element has anchor rules per layout class (box / strip / tall);
// rules resolve to pixel rectangles for any ad size, images are contain-fitted, text is auto-sized.

export type HAnchor = 'left' | 'center' | 'right'
export type VAnchor = 'top' | 'middle' | 'bottom'
export type LayoutClass = 'box' | 'strip' | 'tall'
export type ElementId = 'logo' | 'image' | 'headline' | 'sub' | 'cta'

/** Offsets and sizes are percentages of the artboard width (x, w) and height (y, h). */
export interface Rule { show: boolean; h: HAnchor; v: VAnchor; x: number; y: number; w: number; hh: number; align: 'left' | 'center' | 'right'; lines: number }
export type Rules = Record<LayoutClass, Record<ElementId, Rule>>
export interface Rect { x: number; y: number; w: number; h: number }

export const ELEMENTS: { id: ElementId; label: string }[] = [
  { id: 'logo', label: 'Logo' },
  { id: 'image', label: 'Product image' },
  { id: 'headline', label: 'Headline' },
  { id: 'sub', label: 'Subtext' },
  { id: 'cta', label: 'Call to action' },
]

/** Aspect ratio ≥ 2.5 → strip (leaderboards, mobile banners); ≤ 0.6 → tall (skyscrapers); else box. */
export function classify(w: number, h: number): LayoutClass {
  const r = w / h
  return r >= 2.5 ? 'strip' : r <= 0.6 ? 'tall' : 'box'
}

const R = (h: HAnchor, v: VAnchor, x: number, y: number, w: number, hh: number, extra: Partial<Rule> = {}): Rule => ({ show: true, h, v, x, y, w, hh, align: h === 'center' ? 'center' : h, lines: 2, ...extra })

export const DEFAULT_RULES: Rules = {
  box: {
    logo: R('left', 'top', 5, 6, 30, 12),
    image: R('right', 'middle', 2, -4, 48, 62),
    headline: R('left', 'top', 5, 24, 50, 30, { lines: 3 }),
    sub: R('left', 'top', 5, 56, 46, 14, { lines: 2 }),
    cta: R('left', 'bottom', 5, 7, 36, 14),
  },
  strip: {
    logo: R('left', 'middle', 2, 0, 14, 56),
    image: R('left', 'middle', 17, 0, 12, 90),
    headline: R('left', 'middle', 31, 0, 44, 72, { lines: 2 }),
    sub: R('left', 'bottom', 31, 6, 40, 22, { show: false, lines: 1 }),
    cta: R('right', 'middle', 2.5, 0, 18, 52),
  },
  tall: {
    logo: R('center', 'top', 0, 3, 70, 7),
    image: R('center', 'top', 0, 40, 90, 26),
    headline: R('center', 'top', 0, 12, 88, 18, { lines: 4 }),
    sub: R('center', 'top', 0, 30, 86, 9, { lines: 3 }),
    cta: R('center', 'bottom', 0, 5, 80, 8),
  },
}

/** Resolves a rule to a rectangle in an artboard of W×H pixels. */
export function resolve(r: Rule, W: number, H: number): Rect {
  const w = (r.w / 100) * W, h = (r.hh / 100) * H
  const ox = (r.x / 100) * W, oy = (r.y / 100) * H
  const x = r.h === 'left' ? ox : r.h === 'right' ? W - w - ox : (W - w) / 2 + ox
  const y = r.v === 'top' ? oy : r.v === 'bottom' ? H - h - oy : (H - h) / 2 + oy
  return { x, y, w, h }
}

/** Largest rectangle with the image's aspect inside `box`, placed according to the anchors. */
export function contain(box: Rect, iw: number, ih: number, h: HAnchor, v: VAnchor): Rect {
  const k = Math.min(box.w / iw, box.h / ih)
  const w = iw * k, hh = ih * k
  const x = h === 'left' ? box.x : h === 'right' ? box.x + box.w - w : box.x + (box.w - w) / 2
  const y = v === 'top' ? box.y : v === 'bottom' ? box.y + box.h - hh : box.y + (box.h - hh) / 2
  return { x, y, w, h: hh }
}

/** Greedy word wrap for a given font size; `measure(text, size)` returns the width in px. */
export function wrap(text: string, size: number, maxW: number, measure: (t: string, size: number) => number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let cur = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = cur ? cur + ' ' + word : word
      if (measure(t, size) <= maxW || !cur) cur = t
      else { lines.push(cur); cur = word }
    }
    lines.push(cur)
  }
  return lines
}

/**
 * Biggest font size (binary search) whose wrapped text fits the box in at most `maxLines` lines
 * with no word wider than the box. Line height = 1.15 × size.
 */
export function fitText(text: string, box: { w: number; h: number }, maxLines: number, measure: (t: string, size: number) => number, minSize = 6, maxSize = 200): { size: number; lines: string[] } {
  const fits = (s: number) => {
    const lines = wrap(text, s, box.w, measure)
    return lines.length <= maxLines && lines.length * s * 1.15 <= box.h && lines.every((l) => measure(l, s) <= box.w + 0.5) ? lines : null
  }
  let lo = minSize, hi = Math.max(minSize, Math.min(maxSize, box.h))
  if (!fits(lo)) return { size: lo, lines: wrap(text, lo, box.w, measure).slice(0, maxLines) }
  for (let i = 0; i < 24 && hi - lo > 0.25; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return { size: Math.floor(lo * 4) / 4, lines: fits(lo) ?? [] }
}

export interface AdSize { w: number; h: number; name: string }
export const SIZES: AdSize[] = [
  { w: 300, h: 250, name: 'Medium rectangle' },
  { w: 336, h: 280, name: 'Large rectangle' },
  { w: 728, h: 90, name: 'Leaderboard' },
  { w: 970, h: 90, name: 'Large leaderboard' },
  { w: 970, h: 250, name: 'Billboard' },
  { w: 300, h: 600, name: 'Half page' },
  { w: 160, h: 600, name: 'Wide skyscraper' },
  { w: 120, h: 600, name: 'Skyscraper' },
  { w: 320, h: 50, name: 'Mobile banner' },
  { w: 320, h: 100, name: 'Large mobile banner' },
  { w: 300, h: 50, name: 'Mobile leaderboard' },
  { w: 468, h: 60, name: 'Full banner' },
  { w: 250, h: 250, name: 'Square' },
  { w: 200, h: 200, name: 'Small square' },
  { w: 1200, h: 628, name: 'Social / OG image' },
  { w: 1080, h: 1080, name: 'Instagram square' },
]

/** IAB guideline: initial load ≤ 150 KB per creative. */
export const IAB_MAX_BYTES = 150 * 1024
