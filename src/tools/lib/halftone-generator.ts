// Halftone screening: rotated dot grids, dot size from tone, RGB→CMYK separation and SVG output.

export interface Img { width: number; height: number; data: Uint8ClampedArray | number[] }
export type Channel = 'k' | 'c' | 'm' | 'y'
export type Shape = 'circle' | 'square' | 'diamond' | 'line'
export interface Dot { x: number; y: number; s: number /* 0..1 coverage */ }

export const SCREEN_ANGLES: Record<Channel, number> = { c: 15, m: 75, y: 0, k: 45 }
export const INK: Record<Channel, string> = { c: '#00aeef', m: '#ec008c', y: '#fff200', k: '#000000' }

/** Naive RGB (0..1) → CMYK (0..1) with full grey-component replacement. */
export function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const k = 1 - Math.max(r, g, b)
  if (k >= 1 - 1e-9) return [0, 0, 0, 1]
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k]
}

/** Ink coverage 0..1 of a channel at a pixel (k = grayscale darkness when mono). */
export function coverage(img: Img, x: number, y: number, ch: Channel, mono: boolean): number {
  const xi = Math.min(img.width - 1, Math.max(0, Math.round(x))), yi = Math.min(img.height - 1, Math.max(0, Math.round(y)))
  const i = (yi * img.width + xi) * 4
  const a = img.data[i + 3] / 255
  const r = 1 - a + a * img.data[i] / 255, g = 1 - a + a * img.data[i + 1] / 255, b = 1 - a + a * img.data[i + 2] / 255
  if (mono) return 1 - (0.2126 * r + 0.7152 * g + 0.0722 * b)
  const c = rgbToCmyk(r, g, b)
  return c[{ c: 0, m: 1, y: 2, k: 3 }[ch]]
}

/** Dot "radius" for a given coverage so the dot covers that fraction of a cell² area. */
export function dotSize(cov: number, cell: number, shape: Shape): number {
  const a = Math.max(0, Math.min(1, cov)) * cell * cell
  switch (shape) {
    case 'circle': return Math.sqrt(a / Math.PI) // radius
    case 'square': return Math.sqrt(a) / 2 // half side
    case 'diamond': return Math.sqrt(a / 2) // half diagonal
    case 'line': return a / cell / 2 // half thickness
  }
}

/** Samples a rotated grid over the image; each dot carries its averaged coverage. */
export function screen(img: Img, cell: number, angleDeg: number, ch: Channel, mono: boolean, adjust: (v: number) => number = (v) => v): Dot[] {
  const a = (angleDeg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a)
  const cx = img.width / 2, cy = img.height / 2
  const R = Math.hypot(img.width, img.height) / 2 + cell
  const n = Math.ceil(R / cell)
  const dots: Dot[] = []
  const o = cell / 4
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const u = i * cell, v = j * cell
    const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca
    if (x < -cell / 2 || y < -cell / 2 || x > img.width + cell / 2 || y > img.height + cell / 2) continue
    // 5-tap average within the cell
    const cov = (coverage(img, x, y, ch, mono) * 2 + coverage(img, x - o, y - o, ch, mono) + coverage(img, x + o, y - o, ch, mono) + coverage(img, x - o, y + o, ch, mono) + coverage(img, x + o, y + o, ch, mono)) / 6
    const s = adjust(cov)
    if (s > 0.004) dots.push({ x, y, s })
  }
  return dots
}

/** Tone curve: contrast around mid-grey, gamma, optional inversion; clamps to 0..1. */
export const toneCurve = (contrast: number, gamma: number, invert: boolean) => (v: number) => {
  let t = (v - 0.5) * contrast + 0.5
  t = Math.max(0, Math.min(1, t))
  t = Math.pow(t, 1 / gamma)
  return invert ? 1 - t : t
}

/** SVG path/primitive for one dot. */
export function dotSvg(d: Dot, cell: number, shape: Shape, angleDeg: number): string {
  const r = dotSize(d.s, cell, shape)
  const f = (v: number) => +v.toFixed(2)
  if (shape === 'circle') return `<circle cx="${f(d.x)}" cy="${f(d.y)}" r="${f(r)}"/>`
  const rot = shape === 'diamond' ? angleDeg + 45 : angleDeg
  if (shape === 'line') return `<rect x="${f(d.x - cell / 2)}" y="${f(d.y - r)}" width="${f(cell + 0.2)}" height="${f(2 * r)}" transform="rotate(${f(rot)} ${f(d.x)} ${f(d.y)})"/>`
  const h = shape === 'diamond' ? r / Math.SQRT2 : r
  return `<rect x="${f(d.x - h)}" y="${f(d.y - h)}" width="${f(2 * h)}" height="${f(2 * h)}" transform="rotate(${f(rot)} ${f(d.x)} ${f(d.y)})"/>`
}
