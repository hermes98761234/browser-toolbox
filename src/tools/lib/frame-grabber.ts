// Frame maths for the frame grabber: frame indices, timecodes, batch schedules, file names.

/** Frame index containing time t (seconds). */
export const frameAt = (t: number, fps: number) => Math.max(0, Math.floor(t * fps + 1e-6))

/** Seek target for frame n: a quarter frame in, so rounding never lands on the previous frame. */
export const seekTime = (n: number, fps: number) => (Math.max(0, n) + 0.25) / fps

/** SMPTE-style non-drop timecode HH:MM:SS:FF. */
export function timecode(t: number, fps: number): string {
  const f = frameAt(t, fps)
  const r = Math.round(fps)
  const ff = f % r, secs = Math.floor(f / r)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(secs / 3600))}:${p(Math.floor(secs / 60) % 60)}:${p(secs % 60)}:${p(ff)}`
}

/** Compact clock for labels: m:ss.mmm (or h:mm:ss.mmm). */
export function clock(t: number): string {
  const ms = Math.round(Math.max(0, t) * 1000)
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, z = ms % 1000
  const core = `${String(s).padStart(2, '0')}.${String(z).padStart(3, '0')}`
  return h ? `${h}:${String(m).padStart(2, '0')}:${core}` : `${m}:${core}`
}

export type BatchMode = 'seconds' | 'frames' | 'count'

/**
 * Capture times for a batch between start and end (inclusive of start).
 * seconds: every `value` s · frames: every `value` frames · count: `value` evenly spaced frames.
 */
export function batchTimes(start: number, end: number, mode: BatchMode, value: number, fps: number, limit = 500): number[] {
  const a = Math.max(0, Math.min(start, end)), b = Math.max(start, end)
  if (!(value > 0) || !(fps > 0)) return []
  const out: number[] = []
  if (mode === 'count') {
    const n = Math.min(limit, Math.floor(value))
    if (n === 1) return [seekTime(frameAt(a, fps), fps)]
    for (let i = 0; i < n; i++) out.push(seekTime(frameAt(a + ((b - a) * i) / (n - 1), fps), fps))
  } else {
    const step = mode === 'seconds' ? value : value / fps
    for (let t = a; t <= b + 1e-9 && out.length < limit; t += step) out.push(seekTime(frameAt(t + 1e-9, fps), fps))
  }
  // a seek target past the last frame would freeze on the final frame — clamp and dedupe
  return [...new Set(out.map((t) => +Math.min(t, Math.max(0, b)).toFixed(6)))]
}

/** File name like clip_f000123_00m04s100.png */
export function frameName(base: string, t: number, fps: number, ext: string): string {
  const safe = (base.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_') || 'frame').slice(0, 40)
  const ms = Math.round(t * 1000)
  const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, z = ms % 1000
  return `${safe}_f${String(frameAt(t, fps)).padStart(6, '0')}_${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s${String(z).padStart(3, '0')}.${ext}`
}

/** Output size for a scale mode: keep aspect; `maxW` 0 = original. */
export function outSize(w: number, h: number, maxW: number): [number, number] {
  if (!maxW || w <= maxW) return [w, h]
  return [maxW, Math.max(1, Math.round((h * maxW) / w))]
}
