// Lower-third renderer: pure timeline maths + canvas drawing of six animated templates.

export type Template = 'bar' | 'line' | 'news' | 'pill' | 'underline' | 'split'
export type Align = 'left' | 'center' | 'right'
export type Ease = 'cubic' | 'back' | 'expo' | 'linear'

export interface LT {
  name: string
  title: string
  template: Template
  align: Align
  primary: string
  accent: string
  text: string
  sub: string
  font: string
  size: number // name size in px at 1080p
  margin: number // % of height from bottom
  side: number // % of width from the side
  tIn: number
  hold: number
  tOut: number
  ease: Ease
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const EASE: Record<Ease, (x: number) => number> = {
  linear: (x) => x,
  cubic: (x) => 1 - (1 - x) ** 3,
  expo: (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  back: (x) => {
    const c1 = 1.70158, c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
  },
}

export const total = (c: Pick<LT, 'tIn' | 'hold' | 'tOut'>) => c.tIn + c.hold + c.tOut

/** Visibility 0..1 at time t: animates in, holds at 1, animates out (mirror of the in animation). */
export function progress(t: number, c: Pick<LT, 'tIn' | 'hold' | 'tOut'>): { p: number; phase: 'in' | 'hold' | 'out' | 'done' } {
  if (t < c.tIn) return { p: c.tIn > 0 ? clamp01(t / c.tIn) : 1, phase: 'in' }
  if (t < c.tIn + c.hold) return { p: 1, phase: 'hold' }
  if (t < total(c)) return { p: c.tOut > 0 ? 1 - clamp01((t - c.tIn - c.hold) / c.tOut) : 0, phase: 'out' }
  return { p: 0, phase: 'done' }
}

/** Staggered sub-progress: element k starts after `delay` of the master progress. */
export const stagger = (p: number, delay: number, span = 1 - delay) => clamp01((p - delay) / (span || 1))

export function frameCount(c: Pick<LT, 'tIn' | 'hold' | 'tOut'>, fps: number) {
  return Math.max(1, Math.round(total(c) * fps))
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, Math.max(0, w), h, Math.min(r, h / 2, Math.max(0, w) / 2))
}

/** Draws the lower third onto a W×H canvas at time t (seconds). Clears to transparent first. */
export function draw(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, c: LT) {
  ctx.clearRect(0, 0, W, H)
  const { p } = progress(t, c)
  if (p <= 0) return
  const e = EASE[c.ease]
  const k = H / 1080
  const ns = c.size * k, ts = ns * 0.55
  const font = (px: number, w: number) => `${w} ${px}px ${c.font}`
  ctx.font = font(ns, 800)
  const nw = ctx.measureText(c.name).width
  ctx.font = font(ts, 500)
  const tw = ctx.measureText(c.title).width
  const pad = ns * 0.5
  const measure = (str: string, px: number, w: number) => {
    ctx.font = font(px, w)
    return ctx.measureText(str).width
  }
  const bw = Math.max(nw, tw) + pad * 2
  const bottom = H - (c.margin / 100) * H
  const side = (c.side / 100) * W
  const x0 = c.align === 'left' ? side : c.align === 'right' ? W - side - bw : (W - bw) / 2
  const dir = c.align === 'right' ? -1 : 1
  const text = (s: string, x: number, y: number, px: number, weight: number, col: string, alpha = 1) => {
    ctx.save()
    ctx.globalAlpha = clamp01(alpha)
    ctx.font = font(px, weight)
    ctx.fillStyle = col
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(s, x, y)
    ctx.restore()
  }
  const clipX = (x: number, y: number, w: number, h: number) => {
    ctx.beginPath()
    ctx.rect(dir > 0 ? x : x + (bw - w), y, w, h)
    ctx.clip()
  }
  ctx.save()
  switch (c.template) {
    case 'bar': {
      const h1 = ns * 1.45, h2 = ts * 1.7
      const y1 = bottom - h1 - h2
      const a = e(stagger(p, 0, 0.45)), b = e(stagger(p, 0.2, 0.55)), d = e(stagger(p, 0.35, 0.6))
      ctx.fillStyle = c.accent
      const ax = dir > 0 ? x0 - ns * 0.22 : x0 + bw + ns * 0.04
      ctx.fillRect(ax, y1 + (1 - a) * (h1 + h2) / 2, ns * 0.18, (h1 + h2) * a)
      ctx.fillStyle = c.primary
      ctx.fillRect(dir > 0 ? x0 : x0 + bw * (1 - b), y1, bw * b, h1)
      ctx.fillStyle = c.sub
      const w2 = (tw + pad * 2) * d
      ctx.fillRect(dir > 0 ? x0 : x0 + bw - w2, y1 + h1, w2, h2)
      ctx.save()
      clipX(x0, y1, bw * b, h1)
      text(c.name, dir > 0 ? x0 + pad : x0 + bw - pad - nw, y1 + h1 * 0.72, ns, 800, c.text)
      ctx.restore()
      clipX(x0, y1 + h1, bw * d, h2)
      text(c.title, dir > 0 ? x0 + pad : x0 + bw - pad - tw, y1 + h1 + h2 * 0.68, ts, 500, c.primary)
      break
    }
    case 'line': {
      const h = ns * 1.1 + ts * 1.5
      const y1 = bottom - h
      const a = e(stagger(p, 0, 0.5)), b = e(stagger(p, 0.25, 0.6)), d = e(stagger(p, 0.4, 0.6))
      ctx.fillStyle = c.accent
      const lx = dir > 0 ? x0 : x0 + bw - ns * 0.1
      ctx.fillRect(lx, y1 + h * (1 - a), ns * 0.1, h * a)
      const off = (1 - b) * ns * 1.5 * -dir
      text(c.name, (dir > 0 ? x0 + pad : x0 + bw - pad - nw) + off, y1 + ns * 0.95, ns, 800, c.text, b)
      text(c.title, (dir > 0 ? x0 + pad : x0 + bw - pad - tw) + (1 - d) * ns * -dir, y1 + ns * 1.1 + ts * 1.15, ts, 500, c.accent, d)
      break
    }
    case 'news': {
      const h1 = ns * 1.6, tagH = ts * 1.6
      const y1 = bottom - h1
      const a = e(stagger(p, 0, 0.55)), b = e(stagger(p, 0.3, 0.6)), d = e(stagger(p, 0.45, 0.55))
      ctx.fillStyle = c.primary
      const w = bw * a
      ctx.fillRect(dir > 0 ? x0 : x0 + bw - w, y1, w, h1)
      ctx.fillStyle = c.accent
      ctx.fillRect(dir > 0 ? x0 : x0 + bw - w, y1 + h1 - ns * 0.08, w, ns * 0.08)
      const tagW = measure(c.title.toUpperCase(), ts * 0.9, 700) + pad * 1.4
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, y1 - tagH, W, tagH)
      ctx.clip()
      ctx.fillStyle = c.accent
      const ty = y1 - tagH * b
      ctx.fillRect(dir > 0 ? x0 : x0 + bw - tagW, ty, tagW, tagH)
      text(c.title.toUpperCase(), dir > 0 ? x0 + pad * 0.7 : x0 + bw - tagW + pad * 0.7, ty + tagH * 0.7, ts * 0.9, 700, c.sub)
      ctx.restore()
      clipX(x0, y1, bw, h1)
      text(c.name, dir > 0 ? x0 + pad : x0 + bw - pad - nw, y1 + h1 * 0.68 + (1 - d) * h1 * 0.6, ns, 800, c.text, d)
      break
    }
    case 'pill': {
      const h = ns * 1.2 + ts * 1.5 + pad * 0.6
      const y1 = bottom - h
      const a = e(stagger(p, 0, 0.6)), d = e(stagger(p, 0.35, 0.65))
      const w = Math.max(h, bw + h * 0.4) * a
      const px = c.align === 'left' ? x0 : c.align === 'right' ? x0 + bw - w : x0 + (bw - w) / 2
      const g = ctx.createLinearGradient(px, 0, px + w, 0)
      g.addColorStop(0, c.primary)
      g.addColorStop(1, c.accent)
      ctx.fillStyle = g
      ctx.globalAlpha = Math.min(1, a * 1.5)
      rr(ctx, px, y1, w, h, h / 2)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.rect(px, y1, w, h)
      ctx.clip()
      const cx = px + w / 2
      ctx.textAlign = 'center'
      text(c.name, cx, y1 + pad * 0.3 + ns * 1.0, ns, 800, c.text, d)
      text(c.title, cx, y1 + pad * 0.3 + ns * 1.2 + ts * 1.05, ts, 500, c.sub, d)
      break
    }
    case 'underline': {
      const y1 = bottom - ts * 1.6 - ns * 0.35
      const a = e(stagger(p, 0, 0.55)), b = e(stagger(p, 0.15, 0.6)), d = e(stagger(p, 0.4, 0.6))
      const nx = dir > 0 ? x0 + pad : x0 + bw - pad - nw
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, y1 - ns * 1.2, W, ns * 1.25)
      ctx.clip()
      ctx.shadowColor = 'rgba(0,0,0,0.45)'
      ctx.shadowBlur = 12 * k
      text(c.name, nx, y1 + (1 - a) * ns * 1.1, ns, 800, c.text)
      ctx.restore()
      ctx.fillStyle = c.accent
      const uw = (nw + pad * 0.4) * b
      ctx.fillRect(dir > 0 ? nx : nx + nw - uw, y1 + ns * 0.2, uw, ns * 0.09)
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.45)'
      ctx.shadowBlur = 10 * k
      text(c.title, dir > 0 ? x0 + pad : x0 + bw - pad - tw, y1 + ns * 0.3 + ts * 1.2, ts, 500, c.sub, d)
      ctx.restore()
      break
    }
    case 'split': {
      const h1 = ns * 1.4, h2 = ts * 1.6
      const y1 = bottom - h1 - h2
      const a = e(stagger(p, 0, 0.6)), b = e(stagger(p, 0.15, 0.65)), d = e(stagger(p, 0.4, 0.6))
      const w2 = measure(c.title, ts, 600) + pad * 2
      ctx.fillStyle = c.primary
      ctx.fillRect(x0 - (1 - a) * W * 0.3 * dir, y1, bw, h1)
      ctx.globalAlpha = a
      ctx.fillStyle = c.accent
      const tx2 = dir > 0 ? x0 + pad * 0.5 : x0 + bw - w2 - pad * 0.5
      ctx.fillRect(tx2 + (1 - b) * W * 0.3 * dir, y1 + h1, w2, h2)
      ctx.globalAlpha = 1
      text(c.name, (dir > 0 ? x0 + pad : x0 + bw - pad - nw) - (1 - a) * W * 0.3 * dir, y1 + h1 * 0.72, ns, 800, c.text, d)
      text(c.title, tx2 + pad + (1 - b) * W * 0.3 * dir, y1 + h1 + h2 * 0.7, ts, 600, c.sub, d)
      break
    }
  }
  ctx.restore()
}
