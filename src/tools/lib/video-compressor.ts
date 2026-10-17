// Bitrate planning for the Video Compressor (target size ↔ bitrate ↔ resolution).

export const LADDER = [2160, 1440, 1080, 720, 540, 480, 360, 240, 144]

/** Video bitrate (kbit/s) that makes a clip of `secs` fit into `targetBytes`, after audio and container overhead. */
export function kbpsForTarget(targetBytes: number, secs: number, audioKbps: number, overhead = 0.04): number {
  if (!(secs > 0) || !(targetBytes > 0)) return 0
  const totalKbps = (targetBytes * 8 * (1 - overhead)) / secs / 1000
  return Math.max(0, Math.floor(totalKbps - audioKbps))
}

/** Expected file size in bytes for a bitrate (kbit/s) and duration, including container overhead. */
export const sizeFor = (videoKbps: number, audioKbps: number, secs: number, overhead = 0.04) => ((videoKbps + audioKbps) * 1000 * secs) / 8 / (1 - overhead)

/** Even output size for a given output height, keeping the source aspect ratio, never upscaling. */
export function scaleTo(srcW: number, srcH: number, height: number): [number, number] {
  const h = Math.min(height, srcH)
  const w = (srcW * h) / srcH
  const even = (x: number) => Math.max(2, Math.round(x / 2) * 2)
  return [even(w), even(h)]
}

/** Bits per pixel per frame for a bitrate at a resolution. */
export const bpp = (kbps: number, w: number, h: number, fps: number) => (kbps * 1000) / (w * h * fps || 1)

/**
 * Largest ladder height whose bits-per-pixel stays above `minBpp`, so a tight bitrate
 * is spent on fewer, cleaner pixels instead of a blocky full-resolution picture.
 */
export function autoHeight(kbps: number, srcW: number, srcH: number, fps: number, minBpp = 0.05): number {
  for (const h of LADDER) {
    if (h > srcH) continue
    const [w, hh] = scaleTo(srcW, srcH, h)
    if (bpp(kbps, w, hh, fps) >= minBpp) return hh
  }
  return scaleTo(srcW, srcH, Math.min(144, srcH))[1]
}

/**
 * CRF-style quality: 23 ≈ 0.10 bits/pixel/frame, and every +6 halves the bitrate
 * (the same rule of thumb as x264/x265 CRF).
 */
export function kbpsForCrf(crf: number, w: number, h: number, fps: number): number {
  const b = 0.1 * Math.pow(2, -(crf - 23) / 6)
  return Math.max(50, Math.round((b * w * h * fps) / 1000))
}

export function grade(b: number): [string, 'good' | 'accent' | 'bad'] {
  if (b >= 0.09) return ['Excellent', 'good']
  if (b >= 0.05) return ['Good', 'good']
  if (b >= 0.03) return ['Fair — some blocking in motion', 'accent']
  return ['Poor — lower the resolution or raise the target', 'bad']
}
