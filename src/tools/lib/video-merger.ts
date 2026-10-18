// Video merger maths: output size, fit/fill/stretch placement, crossfade timeline and gains.

export type Fit = 'fit' | 'fill' | 'stretch'
export interface Place { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }

/** Where to draw a srcW×srcH frame on a W×H canvas. fit = letterbox/pillarbox, fill = crop to cover, stretch = distort. */
export function place(srcW: number, srcH: number, W: number, H: number, fit: Fit): Place {
  const full = { sx: 0, sy: 0, sw: srcW, sh: srcH }
  if (fit === 'stretch' || !srcW || !srcH) return { ...full, dx: 0, dy: 0, dw: W, dh: H }
  const k = fit === 'fit' ? Math.min(W / srcW, H / srcH) : Math.max(W / srcW, H / srcH)
  if (fit === 'fit') {
    const dw = srcW * k, dh = srcH * k
    return { ...full, dx: (W - dw) / 2, dy: (H - dh) / 2, dw, dh }
  }
  const sw = W / k, sh = H / k
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh, dx: 0, dy: 0, dw: W, dh: H }
}

const even = (x: number) => Math.max(2, Math.round(x / 2) * 2)

/** Output frame size. 'first'/'largest' follow the clips; presets keep the chosen height with the given aspect. */
export function outSize(preset: string, clips: { w: number; h: number }[], aspect: string): [number, number] {
  if (!clips.length) return [1280, 720]
  if (preset === 'first') return [even(clips[0].w), even(clips[0].h)]
  if (preset === 'largest') {
    const c = clips.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a))
    return [even(c.w), even(c.h)]
  }
  const h = Number(preset) || 720
  const [aw, ah] = (aspect === 'first' ? [clips[0].w, clips[0].h] : aspect.split(':').map(Number)) as [number, number]
  if (ah > aw) return [even(h), even((h * ah) / aw)] // portrait: preset is the short side
  return [even((h * aw) / ah), even(h)]
}

export interface ClipSpan { dur: number; trimIn: number; trimOut: number }
export interface Seg { i: number; start: number; end: number; srcIn: number; srcOut: number; fadeIn: number; fadeOut: number }

/** Effective length after trimming (trimOut 0 = to the end). */
export const usable = (c: ClipSpan) => Math.max(0, (c.trimOut > 0 ? Math.min(c.trimOut, c.dur) : c.dur) - Math.min(c.trimIn, c.dur))

/**
 * Lays clips on one timeline. With crossfade x, each clip starts x seconds before the previous one ends,
 * clamped so a fade never exceeds half of either neighbour.
 */
export function timeline(clips: ClipSpan[], xfade: number): { segs: Seg[]; total: number } {
  const segs: Seg[] = []
  let t = 0
  clips.forEach((c, i) => {
    const len = usable(c)
    if (len <= 0) return
    const prev = segs[segs.length - 1]
    let x = 0
    if (prev) {
      x = Math.max(0, Math.min(xfade, (prev.end - prev.start) / 2, len / 2))
      prev.fadeOut = x
    }
    const start = prev ? prev.end - x : 0
    const srcIn = Math.min(c.trimIn, c.dur)
    segs.push({ i, start, end: start + len, srcIn, srcOut: srcIn + len, fadeIn: x, fadeOut: 0 })
    t = start + len
  })
  return { segs, total: t }
}

/** Opacity of a segment at time t when drawn over the previous one (1 outside its fade-in). */
export function alphaAt(s: Seg, t: number): number {
  if (t < s.start || t >= s.end) return 0
  return s.fadeIn > 0 && t < s.start + s.fadeIn ? (t - s.start) / s.fadeIn : 1
}

/** Equal-power audio gain: sin over the fade-in, cos over the fade-out, so loudness stays constant. */
export function gainAt(s: Seg, t: number): number {
  if (t < s.start || t >= s.end) return 0
  let g = 1
  if (s.fadeIn > 0 && t < s.start + s.fadeIn) g *= Math.sin(((t - s.start) / s.fadeIn) * (Math.PI / 2))
  if (s.fadeOut > 0 && t > s.end - s.fadeOut) g *= Math.cos(((t - (s.end - s.fadeOut)) / s.fadeOut) * (Math.PI / 2))
  return g
}

/** Segments that must be playing at time t (at most two during a crossfade). */
export const activeAt = (segs: Seg[], t: number) => segs.filter((s) => t >= s.start && t < s.end)

export const clock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`
