// Pure helpers for the batch watermarker: mark sizing, 3×3 grid / tiled placement,
// background luminance for auto-contrast and output file names.

export type Pos = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br' | 'tile'

/** Mark size in pixels: width = pct% of image width, scaled down if it would exceed 90% of the height. */
export function markSize(W: number, H: number, aspect: number, pct: number): [number, number] {
  let w = (W * pct) / 100
  let h = w / (aspect || 1)
  if (h > H * 0.9) {
    h = H * 0.9
    w = h * aspect
  }
  return [w, h]
}

/** Top-left corners for each copy of a w×h mark. Margin is a % of the shorter image side. */
export function positions(W: number, H: number, w: number, h: number, pos: Pos, marginPct: number, gapPct = 40): [number, number][] {
  const m = (Math.min(W, H) * marginPct) / 100
  if (pos === 'tile') {
    const gx = w * (1 + gapPct / 100), gy = h * (1 + gapPct / 100) * 1.6
    const out: [number, number][] = []
    let row = 0
    for (let y = -gy / 2; y < H; y += gy, row++) {
      const off = row % 2 ? gx / 2 : 0
      for (let x = -gx + off; x < W; x += gx) out.push([x, y])
    }
    return out
  }
  const col = pos[1], line = pos[0]
  const x = col === 'l' ? m : col === 'r' ? W - m - w : (W - w) / 2
  const y = line === 't' ? m : line === 'b' ? H - m - h : (H - h) / 2
  return [[x, y]]
}

/** Relative luminance (0–1) of the mean colour of RGBA pixels. */
export function meanLuminance(px: Uint8ClampedArray | number[]): number {
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] === 0) continue
    r += px[i]
    g += px[i + 1]
    b += px[i + 2]
    n++
  }
  if (!n) return 1
  const lin = (c: number) => {
    const v = c / n / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Light mark on dark backgrounds, dark mark on light ones (threshold ≈ mid-grey in luminance). */
export const autoTone = (lum: number): 'light' | 'dark' => (lum > 0.18 ? 'dark' : 'light')

/** "{name}-wm" style pattern → file name with extension. */
export function outName(pattern: string, file: string, n: number, ext: string): string {
  const base = file.replace(/\.[^.]+$/, '')
  const s = (pattern || '{name}').replace(/\{name\}/g, base).replace(/\{n\}/g, String(n).padStart(3, '0')).replace(/[\\/:*?"<>|]/g, '_')
  return `${s}.${ext}`
}
