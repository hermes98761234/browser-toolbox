// Carousel Post Maker geometry: tiles on a wide canvas, seam checks, snapping, rotated hit tests
// and numbered file names. Rendering is done by the component.

export interface Box { x: number; y: number; w: number; h: number; rot: number }

export const TILE = { '1:1': [1080, 1080], '4:5': [1080, 1350], '3:4': [1080, 1440] } as const
export type Ratio = keyof typeof TILE

/** x positions of the seams between n tiles of width tw. */
export const seams = (n: number, tw: number) => Array.from({ length: Math.max(0, n - 1) }, (_, i) => (i + 1) * tw)

/** Axis-aligned bounds of a (possibly rotated about its centre) box. */
export function bounds(b: Box): { x0: number; y0: number; x1: number; y1: number } {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2
  const a = (b.rot * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a))
  const hw = (b.w * c + b.h * s) / 2, hh = (b.w * s + b.h * c) / 2
  return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh }
}

/** Seam x positions crossed by the box (it is cut in two when exported). */
export function crossings(b: Box, n: number, tw: number): number[] {
  const { x0, x1 } = bounds(b)
  return seams(n, tw).filter((sx) => x0 < sx - 0.5 && x1 > sx + 0.5)
}

/** Which tiles (0-based) a box appears on. */
export function tilesOf(b: Box, n: number, tw: number): number[] {
  const { x0, x1 } = bounds(b)
  const out: number[] = []
  for (let i = 0; i < n; i++) if (x1 > i * tw && x0 < (i + 1) * tw) out.push(i)
  return out
}

/** True when (px, py) is inside the box rotated about its centre. */
export function hit(b: Box, px: number, py: number): boolean {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2
  const a = (-b.rot * Math.PI) / 180
  const dx = px - cx, dy = py - cy
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a)
  return Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2
}

/**
 * Snaps a moving box: its left, centre or right edge snaps to any target x within `tol`
 * (same for y). Returns the adjusted position and the guide lines that fired.
 */
export function snap(x: number, y: number, w: number, h: number, tx: number[], ty: number[], tol: number): { x: number; y: number; gx: number | null; gy: number | null } {
  const best = (pos: number, size: number, targets: number[]) => {
    let d = Infinity, out = pos, g: number | null = null
    for (const t of targets) for (const off of [0, size / 2, size]) {
      const dd = Math.abs(pos + off - t)
      if (dd < tol && dd < d) {
        d = dd
        out = t - off
        g = t
      }
    }
    return [out, g] as const
  }
  const [nx, gx] = best(x, w, tx)
  const [ny, gy] = best(y, h, ty)
  return { x: nx, y: ny, gx, gy }
}

/** Snap targets: canvas edges, tile seams, tile centres and safe margins. */
export function targets(n: number, tw: number, th: number, margin: number): { tx: number[]; ty: number[] } {
  const tx: number[] = []
  for (let i = 0; i <= n; i++) tx.push(i * tw)
  for (let i = 0; i < n; i++) tx.push(i * tw + tw / 2, i * tw + margin, (i + 1) * tw - margin)
  return { tx, ty: [0, th / 2, th, margin, th - margin] }
}

/** "carousel-03-of-07.png" style names. */
export function tileName(prefix: string, i: number, n: number, ext = 'png'): string {
  const d = String(n).length < 2 ? 2 : String(n).length
  const p = (prefix.trim() || 'slide').replace(/[^\w.-]+/g, '-')
  return `${p}-${String(i + 1).padStart(d, '0')}-of-${String(n).padStart(d, '0')}.${ext}`
}

/** Greedy word wrap with a measure function. */
export function wrapText(text: string, maxW: number, measure: (s: string) => number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    if (!words.length) {
      out.push('')
      continue
    }
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (line && measure(next) > maxW) {
        out.push(line)
        line = w
      } else line = next
    }
    out.push(line)
  }
  return out
}
