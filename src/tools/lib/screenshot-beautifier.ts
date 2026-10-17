// Layout maths for Screenshot Beautifier: where the framed window sits on the final canvas.

export type Frame = 'none' | 'mac' | 'browser' | 'browser-dark'
export const BAR: Record<Frame, number> = { none: 0, mac: 34, browser: 46, 'browser-dark': 46 }

export interface Layout {
  W: number // canvas width
  H: number
  x: number // window (frame + image) top-left
  y: number
  w: number // window size
  h: number
  bar: number // title-bar height inside the window
}

/**
 * Places an image of iw × ih inside a frame with `pad` px around it. `aspect` (w/h, 0 = auto)
 * grows the canvas in one direction so the result has exactly that ratio, keeping the window centred.
 */
export function layout(iw: number, ih: number, pad: number, frame: Frame, aspect = 0): Layout {
  const bar = BAR[frame]
  const w = iw, h = ih + bar
  let W = w + 2 * pad, H = h + 2 * pad
  if (aspect > 0) {
    if (W / H < aspect) W = Math.round(H * aspect)
    else H = Math.round(W / aspect)
  }
  return { W, H, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, bar }
}

/** Gradient presets: angle in degrees (CSS convention, 0 = to top) and colour stops. */
export const GRADIENTS: { name: string; angle: number; stops: string[] }[] = [
  { name: 'Indigo dusk', angle: 135, stops: ['#6366f1', '#a855f7', '#ec4899'] },
  { name: 'Ocean', angle: 135, stops: ['#0ea5e9', '#2563eb'] },
  { name: 'Mint', angle: 135, stops: ['#34d399', '#06b6d4'] },
  { name: 'Sunset', angle: 120, stops: ['#f97316', '#ef4444', '#db2777'] },
  { name: 'Peach', angle: 135, stops: ['#fde68a', '#fca5a5'] },
  { name: 'Midnight', angle: 160, stops: ['#0f172a', '#334155'] },
  { name: 'Aurora', angle: 45, stops: ['#22d3ee', '#a3e635', '#facc15'] },
  { name: 'Candy', angle: 90, stops: ['#f0abfc', '#93c5fd'] },
]

/** Line endpoints for a CSS-style linear gradient across a W × H box. */
export function gradientLine(angleDeg: number, W: number, H: number): [number, number, number, number] {
  const a = (angleDeg * Math.PI) / 180
  const dx = Math.sin(a), dy = -Math.cos(a)
  const half = (Math.abs(W * dx) + Math.abs(H * dy)) / 2
  const cx = W / 2, cy = H / 2
  return [cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half]
}
