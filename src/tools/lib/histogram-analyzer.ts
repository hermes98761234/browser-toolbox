// Image histograms: per-channel and luminance counts, summary statistics, clipping and zebra masks.

export interface Hist { r: Uint32Array; g: Uint32Array; b: Uint32Array; l: Uint32Array; n: number }

/** Rec. 709 luma of an 8-bit RGB pixel (0–255). */
export const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

export function histogram(px: Uint8ClampedArray | Uint8Array): Hist {
  const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256), l = new Uint32Array(256)
  let n = 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue // ignore fully transparent pixels
    r[px[i]]++; g[px[i + 1]]++; b[px[i + 2]]++
    l[Math.round(luma(px[i], px[i + 1], px[i + 2]))]++
    n++
  }
  return { r, g, b, l, n }
}

export interface ChanStats { mean: number; median: number; sd: number; min: number; max: number; p1: number; p99: number; low: number; high: number }

/** Value at quantile q (0..1) of a 256-bin histogram. */
export function quantile(h: Uint32Array, q: number): number {
  const total = h.reduce((a, c) => a + c, 0)
  if (!total) return 0
  const target = q * (total - 1)
  let acc = 0
  for (let v = 0; v < 256; v++) {
    acc += h[v]
    if (acc > target) return v
  }
  return 255
}

/** Stats; `low`/`high` are the share of pixels at or below `shadow` / at or above `highlight`. */
export function chanStats(h: Uint32Array, shadow = 0, highlight = 255): ChanStats {
  let n = 0, s = 0, s2 = 0, min = 255, max = 0, lo = 0, hi = 0
  for (let v = 0; v < 256; v++) {
    const c = h[v]
    if (!c) continue
    n += c; s += v * c; s2 += v * v * c
    if (v < min) min = v
    if (v > max) max = v
    if (v <= shadow) lo += c
    if (v >= highlight) hi += c
  }
  if (!n) return { mean: 0, median: 0, sd: 0, min: 0, max: 0, p1: 0, p99: 0, low: 0, high: 0 }
  const mean = s / n
  return { mean, median: quantile(h, 0.5), sd: Math.sqrt(Math.max(0, s2 / n - mean * mean)), min, max, p1: quantile(h, 0.01), p99: quantile(h, 0.99), low: lo / n, high: hi / n }
}

/** Exposure verdict from luminance stats. */
export function verdict(l: ChanStats): { tone: 'ok' | 'warn' | 'err'; text: string } {
  if (l.high > 0.05 && l.low > 0.05) return { tone: 'err', text: 'High-contrast scene: both highlights and shadows are clipped. Consider HDR bracketing or fill light.' }
  if (l.high > 0.02) return { tone: 'warn', text: 'Highlights are clipping. Reduce exposure about ' + Math.max(0.3, Math.min(2, Math.log2(255 / Math.max(1, l.p99 - 1)) + l.high * 8)).toFixed(1) + ' EV, or recover in post if shooting RAW.' }
  if (l.low > 0.05) return { tone: 'warn', text: 'Shadows are crushed to black. Lift exposure or shadows if detail matters there.' }
  if (l.mean < 70) return { tone: 'warn', text: 'Low-key / underexposed: most tones sit in the left third of the histogram.' }
  if (l.mean > 185) return { tone: 'warn', text: 'High-key / overexposed: most tones sit in the right third of the histogram.' }
  if (l.p99 - l.p1 < 120) return { tone: 'warn', text: 'Low contrast: tones use less than half the available range. A levels/curves stretch would help.' }
  return { tone: 'ok', text: 'Well exposed: full tonal range with no significant clipping.' }
}

export type Overlay = 'none' | 'clip' | 'zebra' | 'luma' | 'false'

/** False-colour exposure map (video-style): luma bands → colours. */
export function falseColor(y: number): [number, number, number] {
  const ire = (y / 255) * 100
  if (ire < 3) return [100, 0, 160]
  if (ire < 10) return [30, 60, 220]
  if (ire < 20) return [60, 140, 230]
  if (ire < 40) return [90, 90, 90]
  if (ire < 50) return [80, 190, 80]
  if (ire < 60) return [150, 150, 150]
  if (ire < 70) return [255, 150, 200]
  if (ire < 85) return [200, 200, 200]
  if (ire < 97) return [255, 220, 0]
  return [230, 20, 20]
}

/**
 * Writes the overlay into `out` (RGBA). Clip: any channel ≥ highlight → red, all channels ≤ shadow → blue.
 * Zebra: diagonal stripes on pixels whose luma ≥ zebra level (in % IRE).
 */
export function applyOverlay(src: Uint8ClampedArray, out: Uint8ClampedArray, w: number, mode: Overlay, shadow: number, highlight: number, zebraPct: number, phase = 0) {
  const zebra = (zebraPct / 100) * 255
  for (let i = 0, p = 0; i < src.length; i += 4, p++) {
    const r = src[i], g = src[i + 1], b = src[i + 2]
    let R = r, G = g, B = b
    const y = luma(r, g, b)
    if (mode === 'clip') {
      if (r >= highlight || g >= highlight || b >= highlight) { R = 255; G = 0; B = 0 }
      else if (r <= shadow && g <= shadow && b <= shadow) { R = 0; G = 80; B = 255 }
    } else if (mode === 'zebra') {
      if (y >= zebra) {
        const x = p % w, yy = (p / w) | 0
        if (((x + yy + phase) >> 2) & 1) { R = 0; G = 0; B = 0 } else { R = 255; G = 255; B = 255 }
      }
    } else if (mode === 'luma') {
      R = G = B = Math.round(y)
    } else if (mode === 'false') {
      ;[R, G, B] = falseColor(y)
    }
    out[i] = R; out[i + 1] = G; out[i + 2] = B; out[i + 3] = src[i + 3]
  }
}
