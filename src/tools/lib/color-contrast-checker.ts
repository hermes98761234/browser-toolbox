// Palette-wide contrast analysis: WCAG 2.x ratios, APCA Lc (0.0.98G-4g constants), OKLCH fixes, CVD-simulated views.
import { inGamut, labToLch, lchToLab, linearToOklab, oklabToLinear, parseHex, srgbToLinear, toHex, type V3 } from './color-space-explorer'
import { simulate, type Cvd } from './colorblind-simulator'

export const hexOk = (s: string) => parseHex(s) !== null
export const norm = (s: string) => toHex(parseHex(s) ?? [0, 0, 0])

// ---------- WCAG 2.x ----------

export function relLum(hex: string): number {
  const [r, g, b] = srgbToLinear(parseHex(hex) ?? [0, 0, 0])
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function wcag(a: string, b: string): number {
  const la = relLum(a), lb = relLum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
export type Wcag = 'AAA' | 'AA' | 'AA Large' | 'Fail'
export const wcagGrade = (r: number): Wcag => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA Large' : 'Fail')

// ---------- APCA (Accessible Perceptual Contrast Algorithm), version 0.0.98G-4g ----------
// Implemented from the published constants: simple 2.4 power curve, soft black clamp, separate exponents for
// dark-on-light (normal polarity) and light-on-dark (reverse polarity), 1.14 scale and 0.027 offset.

const A = { tr: 2.4, rCo: 0.2126729, gCo: 0.7151522, bCo: 0.072175, blkThrs: 0.022, blkClmp: 1.414, deltaYmin: 0.0005, normBG: 0.56, normTXT: 0.57, revTXT: 0.62, revBG: 0.65, scale: 1.14, offset: 0.027, loClip: 0.1 }

export function apcaY(hex: string): number {
  const [r, g, b] = parseHex(hex) ?? [0, 0, 0]
  return A.rCo * r ** A.tr + A.gCo * g ** A.tr + A.bCo * b ** A.tr
}

/** APCA lightness contrast Lc for `text` on `bg`. Positive = dark text on light background; negative = light on dark. */
export function apca(text: string, bg: string): number {
  let yt = apcaY(text), yb = apcaY(bg)
  if (yt < A.blkThrs) yt += (A.blkThrs - yt) ** A.blkClmp
  if (yb < A.blkThrs) yb += (A.blkThrs - yb) ** A.blkClmp
  if (Math.abs(yb - yt) < A.deltaYmin) return 0
  if (yb > yt) {
    const s = (yb ** A.normBG - yt ** A.normTXT) * A.scale
    return s < A.loClip ? 0 : (s - A.offset) * 100
  }
  const s = (yb ** A.revBG - yt ** A.revTXT) * A.scale
  return s > -A.loClip ? 0 : (s + A.offset) * 100
}

/** Simplified APCA use-case levels (absolute Lc). */
export const APCA_LEVELS: [number, string][] = [
  [90, 'Preferred for body text'],
  [75, 'Body text (min. 18px/400)'],
  [60, 'Content text (24px/400, 16px/700)'],
  [45, 'Large text / headlines (36px/400, 24px/700)'],
  [30, 'Spot text, placeholders, disabled'],
  [15, 'Non-text only (dividers, focus hints)'],
  [0, 'Invisible / unusable'],
]
export const apcaUse = (lc: number) => APCA_LEVELS.find(([t]) => Math.abs(lc) >= t)![1]

// ---------- OKLCH suggestions ----------

export function toOklch(hex: string): V3 {
  return labToLch(linearToOklab(srgbToLinear(parseHex(hex) ?? [0, 0, 0])))
}
/** OKLCH → hex, reducing chroma until the colour fits in sRGB (keeps lightness and hue). */
export function fromOklch([L, C, h]: V3): string {
  let lo = 0, hi = C
  const lin = (c: number) => oklabToLinear(lchToLab([L, c, h]))
  if (inGamut(lin(C))) return toHexLin(lin(C))
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (inGamut(lin(m))) lo = m; else hi = m }
  return toHexLin(lin(lo))
}
const toHexLin = (l: V3) => toHex(l.map((v) => { const c = Math.min(1, Math.max(0, v)); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055 }) as V3)

export type Metric = 'wcag' | 'apca'
export const passes = (fg: string, bg: string, metric: Metric, target: number) => (metric === 'wcag' ? wcag(fg, bg) >= target : Math.abs(apca(fg, bg)) >= target)

/**
 * Nearest colour to `fg` (same OKLCH hue, chroma kept where the gamut allows) whose contrast against `bg`
 * meets the target. Searches lightness in both directions and returns the smaller change.
 */
export function suggest(fg: string, bg: string, metric: Metric, target: number): { hex: string; dL: number } | null {
  if (passes(fg, bg, metric, target)) return { hex: norm(fg), dL: 0 }
  const [L, C, h] = toOklch(fg)
  const best: { hex: string; dL: number }[] = []
  for (const dir of [-1, 1]) {
    let lo = L, hi = dir < 0 ? 0 : 1
    if (!passes(fromOklch([hi, C, h]), bg, metric, target)) continue
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2
      if (passes(fromOklch([m, C, h]), bg, metric, target)) hi = m
      else lo = m
    }
    const hex = fromOklch([hi, C, h])
    if (passes(hex, bg, metric, target)) best.push({ hex, dL: Math.abs(hi - L) })
    else {
      // rounding to 8-bit can land just below the target: nudge one more step
      const hex2 = fromOklch([Math.min(1, Math.max(0, hi + dir * 0.004)), C, h])
      if (passes(hex2, bg, metric, target)) best.push({ hex: hex2, dL: Math.abs(hi - L) + 0.004 })
    }
  }
  best.sort((a, b) => a.dL - b.dL)
  return best[0] ?? null
}

// ---------- colour-vision simulation ----------

export function simulateHex(hex: string, cvd: Cvd | 'none'): string {
  if (cvd === 'none') return norm(hex)
  const rgb = (parseHex(hex) ?? [0, 0, 0]).map((v) => Math.round(v * 255)) as [number, number, number]
  return toHex(simulate(rgb, cvd, 'machado', 1).map((v) => v / 255) as V3)
}
/** Perceptual distance in OKLab (×100, ≈ ΔE-OK); below ~2 colours are hard to tell apart. */
export function deltaOk(a: string, b: string): number {
  const x = linearToOklab(srgbToLinear(parseHex(a) ?? [0, 0, 0])), y = linearToOklab(srgbToLinear(parseHex(b) ?? [0, 0, 0]))
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100
}

export interface Pair { fg: string; bg: string; ratio: number; lc: number }
export function matrix(colors: string[], cvd: Cvd | 'none' = 'none'): Pair[][] {
  const sim = colors.map((c) => simulateHex(c, cvd))
  return sim.map((fg) => sim.map((bg) => ({ fg, bg, ratio: wcag(fg, bg), lc: apca(fg, bg) })))
}

/** Parses a pasted palette: hex codes in any text (CSS variables, JSON, comma lists). */
export function parsePalette(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi)) { const h = norm(m[0]); if (!out.includes(h)) out.push(h) }
  return out
}
