// Elliptical face masks in image-relative coordinates, composited irreversibly with feathered edges.
import { destructiveBlur, fillSolid, hexToRgb, normRect, pixelate, type Pixels, type Rect } from './image-redaction-tool'

/** Centre and radii as fractions of image width/height, so masks transfer between photos of any size. */
export interface Mask { id: string; cx: number; cy: number; rx: number; ry: number; auto?: boolean }
export type Style = 'blur' | 'pixelate' | 'solid' | 'emoji'

export interface RenderOpts {
  style: Style
  /** Blur radius or pixel block size as a fraction of the mask's width. */
  strength: number
  /** Feather width as a fraction of the mask's smaller radius (alpha falls from 1 at the ellipse edge to 0 outside). */
  feather: number
  color: string
}

/** Bounding box (pixels) of a mask including its feather ring, clipped to the image. */
export function maskBox(m: Mask, W: number, H: number, feather = 0): Rect {
  const f = feather * Math.min(m.rx * W, m.ry * H)
  return normRect((m.cx - m.rx) * W - f, (m.cy - m.ry) * H - f, (m.cx + m.rx) * W + f, (m.cy + m.ry) * H + f, W, H)
}

/**
 * Coverage of pixel centre (x, y): 1 inside the ellipse, smoothstep to 0 across the feather ring outside it.
 * Uses the normalised radius d = √((dx/rx)² + (dy/ry)²); the ring spans d ∈ [1, 1 + f/r].
 */
export function coverage(x: number, y: number, m: Mask, W: number, H: number, feather: number): number {
  const rx = m.rx * W, ry = m.ry * H
  if (rx <= 0 || ry <= 0) return 0
  const d = Math.hypot((x - m.cx * W) / rx, (y - m.cy * H) / ry)
  if (d <= 1) return 1
  const ring = feather // fraction of the radius, i.e. normalised units
  if (ring <= 0) return 0
  const t = (d - 1) / ring
  if (t >= 1) return 0
  const u = 1 - t
  return u * u * (3 - 2 * u)
}

/** Detector box → padded face mask (faces need room for hair, ears and chin). */
export function faceToMask(b: { x: number; y: number; width: number; height: number }, W: number, H: number, pad = 0.25, id = 'f'): Mask {
  const cx = (b.x + b.width / 2) / W
  const cy = (b.y + b.height / 2 - b.height * 0.06) / H
  return { id, cx, cy, rx: ((b.width / 2) * (1 + pad)) / W, ry: ((b.height / 2) * (1 + pad * 1.3)) / H, auto: true }
}

/** Applies every mask to the pixels in place. Inside each ellipse the original is fully destroyed. */
export function redact(p: Pixels, masks: Mask[], o: RenderOpts) {
  const W = p.width, H = p.height
  for (const m of masks) {
    const box = maskBox(m, W, H, o.feather)
    if (!box.w || !box.h) continue
    // Work on a copy of the box so the feather can blend original and redacted pixels.
    const sub: Pixels = { data: new Uint8ClampedArray(box.w * box.h * 4), width: box.w, height: box.h }
    for (let y = 0; y < box.h; y++) sub.data.set(p.data.subarray(((box.y + y) * W + box.x) * 4, ((box.y + y) * W + box.x + box.w) * 4), y * box.w * 4)
    const whole = { x: 0, y: 0, w: box.w, h: box.h }
    const size = Math.max(2, Math.round(o.strength * m.rx * 2 * W))
    if (o.style === 'solid') fillSolid(sub, whole, hexToRgb(o.color))
    else if (o.style === 'blur') destructiveBlur(sub, whole, size, box.x * 7 + box.y)
    else pixelate(sub, whole, o.style === 'emoji' ? Math.max(size, Math.round(m.rx * W * 0.5)) : size)
    for (let y = 0; y < box.h; y++)
      for (let x = 0; x < box.w; x++) {
        const a = coverage(box.x + x + 0.5, box.y + y + 0.5, m, W, H, o.feather)
        if (a <= 0) continue
        const s = (y * box.w + x) * 4, d = ((box.y + y) * W + box.x + x) * 4
        for (let c = 0; c < 3; c++) p.data[d + c] = Math.round(p.data[d + c] * (1 - a) + sub.data[s + c] * a)
        p.data[d + 3] = 255
      }
  }
}

export type Hit = { id: string; part: 'body' | 'handle' } | null

/** Topmost mask under (x, y) in pixels; the handle is the bottom-right corner of the box. */
export function hitTest(masks: Mask[], x: number, y: number, W: number, H: number, handlePx: number): Hit {
  for (let i = masks.length - 1; i >= 0; i--) {
    const m = masks[i]
    const hx = (m.cx + m.rx * Math.SQRT1_2) * W, hy = (m.cy + m.ry * Math.SQRT1_2) * H
    if (Math.hypot(x - hx, y - hy) <= handlePx) return { id: m.id, part: 'handle' }
    if (coverage(x, y, m, W, H, 0) > 0) return { id: m.id, part: 'body' }
  }
  return null
}

/** Resizes a mask so its handle follows the pointer (keeps the centre fixed). */
export function resizeTo(m: Mask, x: number, y: number, W: number, H: number): Mask {
  const rx = Math.max(6 / W, Math.abs(x / W - m.cx) / Math.SQRT1_2)
  const ry = Math.max(6 / H, Math.abs(y / H - m.cy) / Math.SQRT1_2)
  return { ...m, rx, ry }
}

/** Default mask for a click: a face-shaped ellipse (taller than wide) sized to the photo. */
export function dropMask(x: number, y: number, W: number, H: number, sizeFrac: number, id: string): Mask {
  const rPx = sizeFrac * Math.min(W, H)
  return { id, cx: x / W, cy: y / H, rx: (rPx * 0.8) / W, ry: rPx / H }
}
