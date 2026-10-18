// Scene-change detection for the video frame extractor: frame signatures (colour histogram +
// grey thumbnail), two difference metrics, cut detection with a minimum scene length, keyframe
// choice and near-duplicate removal.

export interface Sig { hist: Float32Array; gray: Float32Array; w: number; h: number }
export type Metric = 'hist' | 'ssim' | 'both'

/** Normalised RGB histogram with `bins` levels per channel (concatenated R, G, B; each part sums to 1). */
export function histogram(rgba: ArrayLike<number>, bins = 16): Float32Array {
  const h = new Float32Array(bins * 3)
  const n = Math.floor(rgba.length / 4)
  if (!n) return h
  for (let i = 0; i < n; i++) {
    h[Math.min(bins - 1, Math.floor((rgba[i * 4] * bins) / 256))]++
    h[bins + Math.min(bins - 1, Math.floor((rgba[i * 4 + 1] * bins) / 256))]++
    h[2 * bins + Math.min(bins - 1, Math.floor((rgba[i * 4 + 2] * bins) / 256))]++
  }
  for (let i = 0; i < h.length; i++) h[i] /= n
  return h
}

/** Luma (Rec. 601) per pixel, 0–255. */
export function grayOf(rgba: ArrayLike<number>): Float32Array {
  const n = Math.floor(rgba.length / 4)
  const g = new Float32Array(n)
  for (let i = 0; i < n; i++) g[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
  return g
}

export const signature = (rgba: ArrayLike<number>, w: number, h: number, bins = 16): Sig => ({ hist: histogram(rgba, bins), gray: grayOf(rgba), w, h })

/** Histogram distance in 0–1: 1 − Bhattacharyya coefficient, averaged over the three channels. */
export function histDiff(a: Float32Array, b: Float32Array): number {
  let bc = 0
  for (let i = 0; i < a.length; i++) bc += Math.sqrt(a[i] * b[i])
  return Math.min(1, Math.max(0, 1 - bc / 3))
}

/** Mean SSIM over non-overlapping win×win windows of two grey images (same size), standard constants. */
export function ssim(a: Float32Array, b: Float32Array, w: number, h: number, win = 8): number {
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2
  let total = 0, count = 0
  for (let y0 = 0; y0 + win <= h; y0 += win) {
    for (let x0 = 0; x0 + win <= w; x0 += win) {
      let ma = 0, mb = 0
      for (let y = y0; y < y0 + win; y++) for (let x = x0; x < x0 + win; x++) {
        ma += a[y * w + x]
        mb += b[y * w + x]
      }
      const N = win * win
      ma /= N
      mb /= N
      let va = 0, vb = 0, cov = 0
      for (let y = y0; y < y0 + win; y++) for (let x = x0; x < x0 + win; x++) {
        const da = a[y * w + x] - ma, db = b[y * w + x] - mb
        va += da * da
        vb += db * db
        cov += da * db
      }
      va /= N - 1
      vb /= N - 1
      cov /= N - 1
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2))
      count++
    }
  }
  return count ? total / count : 1
}

/** Difference score 0–1 between two signatures. "both" takes the larger of the two cues. */
export function difference(a: Sig, b: Sig, metric: Metric): number {
  const hd = histDiff(a.hist, b.hist)
  if (metric === 'hist') return hd
  const sd = Math.min(1, Math.max(0, (1 - ssim(a.gray, b.gray, a.w, a.h)) / 2))
  return metric === 'ssim' ? sd : Math.max(hd, sd)
}

/**
 * Indices (into the sample list) where a new scene starts. Index 0 always starts a scene.
 * scores[i] is the difference between sample i−1 and i (scores[0] ignored).
 * A cut needs score ≥ threshold and at least minGap seconds since the previous cut.
 */
export function detectCuts(times: number[], scores: number[], threshold: number, minGap: number): number[] {
  if (!times.length) return []
  const cuts = [0]
  for (let i = 1; i < times.length; i++) {
    if (scores[i] < threshold) continue
    const last = cuts[cuts.length - 1]
    if (times[i] - times[last] >= minGap) cuts.push(i)
    else if (last !== 0 && scores[i] > scores[last]) cuts[cuts.length - 1] = i // keep the stronger cut in a burst
  }
  return cuts
}

export interface Scene { start: number; end: number; startIdx: number; endIdx: number; key: number; score: number }

/** Builds scenes from cut indices; keyframe = first, middle or sharpest-change-free middle sample. */
export function scenes(times: number[], scores: number[], cuts: number[], duration: number, pick: 'first' | 'middle'): Scene[] {
  return cuts.map((c, k) => {
    const endIdx = (cuts[k + 1] ?? times.length) - 1
    const end = k + 1 < cuts.length ? times[cuts[k + 1]] : duration
    const key = pick === 'first' ? Math.min(endIdx, c + (c === 0 ? 0 : 1)) : Math.round((c + endIdx) / 2)
    return { start: times[c], end, startIdx: c, endIdx, key, score: k === 0 ? 0 : scores[c] }
  })
}

/** For each keyframe, the index of an earlier kept keyframe it nearly duplicates (or -1). */
export function duplicates(sigs: Sig[], metric: Metric, maxDiff: number): number[] {
  const out: number[] = []
  const kept: number[] = []
  sigs.forEach((s, i) => {
    let hit = -1
    for (const k of kept) if (difference(sigs[k], s, metric) <= maxDiff) { hit = k; break }
    out.push(hit)
    if (hit < 0) kept.push(i)
  })
  return out
}

/** Suggested threshold: mean + k·σ of the scores, clamped to a sensible range. */
export function suggestThreshold(scores: number[], k = 3): number {
  const v = scores.slice(1)
  if (!v.length) return 0.3
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length)
  return Math.round(Math.min(0.8, Math.max(0.05, mean + k * sd)) * 100) / 100
}

/** Analysis step (s) that keeps the number of samples ≤ maxSamples. */
export const sampleStep = (duration: number, perSecond: number, maxSamples = 1500) => Math.max(1 / perSecond, duration / maxSamples)
