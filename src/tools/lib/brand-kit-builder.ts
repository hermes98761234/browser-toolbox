// Brand kit helpers: colour conversions for print, WCAG contrast pairs and design tokens.
import { contrast, hexToRgb, type RGB } from './palette-generator'

export interface BrandColor { id: string; name: string; hex: string; role: 'primary' | 'secondary' | 'accent' | 'neutral' }

/** Naive (uncalibrated) RGB → CMYK percentages, as commonly quoted in brand guides. */
export function cmyk([r, g, b]: RGB): [number, number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255
  const k = 1 - Math.max(R, G, B)
  if (k >= 1) return [0, 0, 0, 100]
  const f = (c: number) => Math.round(((1 - c - k) / (1 - k)) * 100)
  return [f(R), f(G), f(B), Math.round(k * 100)]
}

export type Grade = 'AAA' | 'AA' | 'AA large' | 'Fail'
export const grade = (ratio: number): Grade => (ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA large' : 'Fail')

const WHITE: RGB = [255, 255, 255], BLACK: RGB = [0, 0, 0]

/** White or black text, whichever contrasts more, with its ratio. */
export function textOn(hex: string): { text: '#ffffff' | '#000000'; ratio: number } {
  const c = hexToRgb(hex) ?? WHITE
  const w = contrast(c, WHITE), b = contrast(c, BLACK)
  return w >= b ? { text: '#ffffff', ratio: w } : { text: '#000000', ratio: b }
}

export interface Pair { fg: BrandColor; bg: BrandColor; ratio: number; grade: Grade }

/** All ordered fg/bg pairs (fg ≠ bg), best contrast first. */
export function pairs(colors: BrandColor[]): Pair[] {
  const out: Pair[] = []
  for (const fg of colors) for (const bg of colors) {
    if (fg.id === bg.id) continue
    const a = hexToRgb(fg.hex), b = hexToRgb(bg.hex)
    if (!a || !b) continue
    const ratio = contrast(a, b)
    out.push({ fg, bg, ratio, grade: grade(ratio) })
  }
  return out.sort((x, y) => y.ratio - x.ratio)
}

export const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'color'

/** CSS custom properties for the kit. */
export function cssTokens(brand: string, colors: BrandColor[], heading: string, body: string): string {
  const lines = colors.map((c) => `  --${slug(brand)}-${slug(c.name)}: ${c.hex};`)
  return `:root {\n${lines.join('\n')}\n  --${slug(brand)}-font-heading: ${heading};\n  --${slug(brand)}-font-body: ${body};\n}\n`
}

/** Design-tokens JSON (W3C community-group draft shape). */
export function jsonTokens(colors: BrandColor[], heading: string, body: string): string {
  const color: Record<string, { $type: 'color'; $value: string }> = {}
  for (const c of colors) color[slug(c.name)] = { $type: 'color', $value: c.hex }
  return JSON.stringify({ color, font: { heading: { $type: 'fontFamily', $value: heading }, body: { $type: 'fontFamily', $value: body } } }, null, 2)
}
