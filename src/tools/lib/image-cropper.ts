// Crop-rectangle math in image pixel space: aspect-locked fitting, moving and handle resizing.

export interface Rect { x: number; y: number; w: number; h: number }
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Largest centred rect with the given ratio (w/h); free crop gets a 10% inset. */
export function centerCrop(W: number, H: number, ratio: number | null): Rect {
  if (!ratio) return { x: W * 0.1, y: H * 0.1, w: W * 0.8, h: H * 0.8 }
  let w = W, h = W / ratio
  if (h > H) { h = H; w = H * ratio }
  return { x: (W - w) / 2, y: (H - h) / 2, w, h }
}

/** Re-shapes a rect to a ratio around its centre, keeping roughly the same area, inside the image. */
export function applyRatio(r: Rect, ratio: number | null, W: number, H: number): Rect {
  if (!ratio) return r
  const area = r.w * r.h
  let w = Math.sqrt(area * ratio), h = w / ratio
  const k = Math.min(1, W / w, H / h)
  w *= k
  h *= k
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2
  return { x: clamp(cx - w / 2, 0, W - w), y: clamp(cy - h / 2, 0, H - h), w, h }
}

export function moveRect(r: Rect, dx: number, dy: number, W: number, H: number): Rect {
  return { ...r, x: clamp(r.x + dx, 0, W - r.w), y: clamp(r.y + dy, 0, H - r.h) }
}

/** Drags a handle by (dx, dy). The opposite edge/corner stays fixed; with a ratio, edge handles grow symmetrically. */
export function resizeRect(r: Rect, hd: Handle, dx: number, dy: number, ratio: number | null, W: number, H: number, min = 8): Rect {
  let l = r.x, t = r.y, R = r.x + r.w, b = r.y + r.h
  const hasW = hd.includes('w'), hasE = hd.includes('e'), hasN = hd.includes('n'), hasS = hd.includes('s')
  if (hasW) l += dx
  if (hasE) R += dx
  if (hasN) t += dy
  if (hasS) b += dy
  if (!ratio) {
    if (hasW) l = clamp(l, 0, R - min)
    if (hasE) R = clamp(R, l + min, W)
    if (hasN) t = clamp(t, 0, b - min)
    if (hasS) b = clamp(b, t + min, H)
    return { x: l, y: t, w: R - l, h: b - t }
  }
  const w0 = R - l, h0 = b - t
  const corner = hd.length === 2
  let w = corner ? Math.max(w0, h0 * ratio) : hasE || hasW ? w0 : h0 * ratio
  // Horizontal anchor: fixed edge or the old centre.
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2
  const maxWx = hasE ? W - r.x : hasW ? r.x + r.w : 2 * Math.min(cx, W - cx)
  const maxHy = hasS ? H - r.y : hasN ? r.y + r.h : 2 * Math.min(cy, H - cy)
  const minW = Math.max(min, min * ratio)
  w = clamp(w, Math.min(minW, maxWx), Math.min(maxWx, maxHy * ratio))
  const h = w / ratio
  const x = hasE ? r.x : hasW ? r.x + r.w - w : cx - w / 2
  const y = hasS ? r.y : hasN ? r.y + r.h - h : cy - h / 2
  return { x, y, w, h }
}

/** Output size: preset target dimensions, or the crop's own pixel size (optionally capped on the long side). */
export function outputSize(r: Rect, target: [number, number] | null, maxSide: number): [number, number] {
  if (target) return target
  const w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h))
  const k = maxSide > 0 ? Math.min(1, maxSide / Math.max(w, h)) : 1
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]
}

export const roundRect = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) })
