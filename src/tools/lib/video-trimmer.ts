// Time helpers for the video trimmer.

/** Formats seconds as m:ss.mmm (or h:mm:ss.mmm). */
export function fmtTime(t: number, digits = 3): string {
  if (!Number.isFinite(t) || t < 0) t = 0
  const ms = Math.round(t * 10 ** digits)
  const whole = Math.floor(ms / 10 ** digits)
  const frac = digits ? '.' + String(ms % 10 ** digits).padStart(digits, '0') : ''
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}${frac}` : `${m}:${ss}${frac}`
}

/** Parses "75", "75.5", "1:15.5", "0:01:15.5" into seconds. Returns NaN when invalid. */
export function parseTime(s: string): number {
  const parts = s.trim().split(':')
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d+(\.\d*)?$|^\.\d+$/.test(p.trim()))) return NaN
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0)
}

/** Keeps a selection valid: 0 ≤ start < end ≤ duration with at least `minLen` seconds. */
export function clampRange(start: number, end: number, duration: number, minLen = 0.1): [number, number] {
  const d = Math.max(0, duration)
  const len = Math.min(minLen, d)
  let s = Math.min(Math.max(0, start), d - len)
  let e = Math.max(Math.min(d, end), s + len)
  if (e > d) {
    e = d
    s = Math.max(0, d - len)
  }
  return [s, e]
}

/** First MediaRecorder container/codec combination the browser supports. */
export function pickMime(isSupported: (m: string) => boolean): string {
  const list = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
  return list.find(isSupported) ?? ''
}
