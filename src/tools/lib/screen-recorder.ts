// Helpers for the screen recorder: container/codec choice, sizes and time formatting.

export const MIME_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']

/** First MIME type the browser's MediaRecorder supports ('' = let the browser decide). */
export function pickMime(supported: (m: string) => boolean, candidates = MIME_CANDIDATES): string {
  return candidates.find((m) => supported(m)) ?? ''
}

/** Expected file size in MB per minute for a video bitrate (Mbps) plus an audio bitrate (kbps). */
export const mbPerMinute = (videoMbps: number, audioKbps: number) => ((videoMbps * 1e6 + audioKbps * 1e3) / 8) * 60 / 1e6

/** 75.4 → "1:15", 3725 → "1:02:05". */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`
}

export const bytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(0, n / 1024).toFixed(0)} KB`)

/** Safe, sortable default file name, e.g. "screen-2026-10-17_14-05-09.webm". */
export function fileName(d: Date, ext = 'webm', prefix = 'screen'): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${prefix}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.${ext}`
}

export const extFor = (mime: string) => (mime.includes('mp4') ? 'mp4' : 'webm')

/** RMS level (0..1) of 8-bit time-domain analyser data centred at 128. */
export function rms(data: ArrayLike<number>): number {
  if (!data.length) return 0
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128
    sum += v * v
  }
  return Math.sqrt(sum / data.length)
}
