// Pure helpers for the in-browser video converter (canvas + MediaRecorder).

export type Aspect = 'orig' | '16:9' | '9:16' | '1:1' | '4:5'
export type Fit = 'contain' | 'cover'

/** Output frame size. `height` 0 keeps the source height. Dimensions are rounded to even numbers (codec friendly). */
export function outSize(srcW: number, srcH: number, height: number, aspect: Aspect): [number, number] {
  const ratio = aspect === 'orig' ? srcW / srcH : (([a, b]) => a / b)(aspect.split(':').map(Number))
  let h = height > 0 ? height : srcH
  // For portrait/square presets "height" means the short side, so 720 → 720×1280 for 9:16.
  let w = ratio >= 1 ? h * ratio : h
  if (ratio < 1) h = w / ratio
  const even = (x: number) => Math.max(2, Math.round(x / 2) * 2)
  w = even(w)
  h = even(h)
  return [w, h]
}

/** Destination rectangle to draw a srcW×srcH frame into a W×H canvas. */
export function placeRect(srcW: number, srcH: number, W: number, H: number, fit: Fit): [number, number, number, number] {
  const k = fit === 'contain' ? Math.min(W / srcW, H / srcH) : Math.max(W / srcW, H / srcH)
  const w = srcW * k, h = srcH * k
  return [(W - w) / 2, (H - h) / 2, w, h]
}

/** Estimated file size in bytes for a bitrate (kbps) and duration (s). */
export const estimateBytes = (videoKbps: number, audioKbps: number, seconds: number) => ((videoKbps + audioKbps) * 1000 * seconds) / 8

/** Suggested bitrate (kbps) for a frame size and fps (≈0.1 bits per pixel per frame for VP9/H.264 web quality). */
export function suggestKbps(w: number, h: number, fps: number, bpp = 0.1): number {
  return Math.round((w * h * fps * bpp) / 1000 / 50) * 50
}

export function clock(t: number): string {
  if (!Number.isFinite(t)) return '—'
  const m = Math.floor(t / 60), s = t - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}
