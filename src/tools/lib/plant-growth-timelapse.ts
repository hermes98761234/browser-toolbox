// Timelapse helpers: grayscale downsampling, translation search for frame alignment, brightness
// matching and the output frame schedule (holds and cross-fades).

/** Luma (Rec. 601) of RGBA pixels → Float32Array. */
export function toGray(rgba: Uint8ClampedArray | number[], w: number, h: number): Float32Array {
  const g = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
  return g
}

export const mean = (a: Float32Array) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i]
  return a.length ? s / a.length : 0
}

/** Mean absolute difference between ref and img shifted by (dx, dy) over the overlapping area (mean-normalised). */
export function diffAt(ref: Float32Array, img: Float32Array, w: number, h: number, dx: number, dy: number, step = 1): number {
  const mr = mean(ref), mi = mean(img)
  let s = 0, n = 0
  const x0 = Math.max(0, dx), x1 = Math.min(w, w + dx), y0 = Math.max(0, dy), y1 = Math.min(h, h + dy)
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step) {
      s += Math.abs(ref[y * w + x] - mr - (img[(y - dy) * w + (x - dx)] - mi))
      n++
    }
  return n > (w * h) / (8 * step * step) ? s / n : Infinity
}

/**
 * Integer shift (dx, dy) that moves `img` onto `ref` (img pixel (x, y) lands on ref (x+dx, y+dy)),
 * searched exhaustively within ±max pixels.
 */
export function bestShift(ref: Float32Array, img: Float32Array, w: number, h: number, max: number, around: [number, number] = [0, 0]): [number, number] {
  let best: [number, number] = around
  let bv = Infinity
  for (let dy = around[1] - max; dy <= around[1] + max; dy++)
    for (let dx = around[0] - max; dx <= around[0] + max; dx++) {
      const v = diffAt(ref, img, w, h, dx, dy, w > 120 ? 2 : 1)
      if (v < bv - 1e-9 || (Math.abs(v - bv) < 1e-9 && Math.abs(dx) + Math.abs(dy) < Math.abs(best[0]) + Math.abs(best[1]))) {
        bv = v
        best = [dx, dy]
      }
    }
  return best
}

/** Box-downsample a grayscale image by an integer factor. */
export function downsample(g: Float32Array, w: number, h: number, f: number): { g: Float32Array; w: number; h: number } {
  const W = Math.floor(w / f), H = Math.floor(h / f)
  const out = new Float32Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0
      for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += g[(y * f + j) * w + x * f + i]
      out[y * W + x] = s / (f * f)
    }
  return { g: out, w: W, h: H }
}

/** Coarse-to-fine translation estimate. Returns the shift in the given image's pixels. */
export function align(ref: Float32Array, img: Float32Array, w: number, h: number, max: number): [number, number] {
  const a = downsample(ref, w, h, 2), b = downsample(img, w, h, 2)
  const [cx, cy] = bestShift(a.g, b.g, a.w, a.h, Math.ceil(max / 2))
  return bestShift(ref, img, w, h, 1, [cx * 2, cy * 2])
}

/** Brightness gain that brings `img` to the reference mean (clamped). */
export const gainFor = (refMean: number, imgMean: number) => (imgMean > 1 ? Math.min(2, Math.max(0.5, refMean / imgMean)) : 1)

export interface Step { a: number; b: number; t: number }

/**
 * Output frames for `n` photos: each photo shows for `hold` output frames and blends into the next
 * over `fade` frames; the last photo is held for `endHold` extra frames.
 */
export function schedule(n: number, hold: number, fade: number, endHold: number): Step[] {
  const out: Step[] = []
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < Math.max(1, hold); k++) out.push({ a: i, b: i, t: 0 })
    if (i < n - 1) for (let k = 1; k <= fade; k++) out.push({ a: i, b: i + 1, t: k / (fade + 1) })
  }
  if (n) for (let k = 0; k < endHold; k++) out.push({ a: n - 1, b: n - 1, t: 0 })
  return out
}
