// Pure helpers for the PDF compressor: presets, target sizes, PNG-predictor undo, pixel expansion.

export interface Preset {
  id: string
  name: string
  maxPx: number // longest side of a recompressed image, in pixels
  dpi: number // target effective resolution on the page
  quality: number // JPEG quality 0..1
  note: string
}

export const PRESETS: Preset[] = [
  { id: 'screen', name: 'Screen', maxPx: 1000, dpi: 96, quality: 0.5, note: 'Smallest file, for on-screen reading and email' },
  { id: 'ebook', name: 'eBook', maxPx: 1600, dpi: 150, quality: 0.65, note: 'Good balance for sharing and tablets' },
  { id: 'print', name: 'Print', maxPx: 2600, dpi: 220, quality: 0.8, note: 'Keeps detail for office printing' },
]

/**
 * New pixel size for an image: never upscale; shrink so the long side ≤ maxPx and,
 * when the image is drawn at `drawnPt` points (long side), its resolution ≤ dpi.
 */
export function targetSize(w: number, h: number, maxPx: number, dpi?: number, drawnPt?: number): [number, number] {
  const long = Math.max(w, h)
  let limit = maxPx
  if (dpi && drawnPt && drawnPt > 0) limit = Math.min(limit, Math.ceil((drawnPt / 72) * dpi))
  const s = Math.min(1, limit / long)
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]
}

/** Undo PNG predictors (Predictor ≥ 10) row by row. `bpp` = bytes per pixel. */
export function unpredictPng(data: Uint8Array, rowBytes: number, bpp: number): Uint8Array {
  const rows = Math.floor(data.length / (rowBytes + 1))
  const out = new Uint8Array(rows * rowBytes)
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowBytes + 1)]
    const src = r * (rowBytes + 1) + 1
    const dst = r * rowBytes
    for (let i = 0; i < rowBytes; i++) {
      const x = data[src + i]
      const a = i >= bpp ? out[dst + i - bpp] : 0
      const b = r ? out[dst - rowBytes + i] : 0
      const c = r && i >= bpp ? out[dst - rowBytes + i - bpp] : 0
      let v: number
      if (type === 1) v = x + a
      else if (type === 2) v = x + b
      else if (type === 3) v = x + ((a + b) >> 1)
      else if (type === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
      } else v = x
      out[dst + i] = v & 255
    }
  }
  return out
}

/** Expand 8-bit Gray or RGB samples into RGBA (alpha 255). */
export function toRgba(raw: Uint8Array, w: number, h: number, comps: 1 | 3): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let i = 0, n = w * h; i < n; i++) {
    if (comps === 1) out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = raw[i] ?? 0
    else {
      out[i * 4] = raw[i * 3] ?? 0
      out[i * 4 + 1] = raw[i * 3 + 1] ?? 0
      out[i * 4 + 2] = raw[i * 3 + 2] ?? 0
    }
    out[i * 4 + 3] = 255
  }
  return out
}

export const fmtBytes = (n: number) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`

/** Fractional saving (positive = smaller). */
export const saving = (before: number, after: number) => (before > 0 ? 1 - after / before : 0)
