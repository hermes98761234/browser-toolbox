// Thumbnail helpers: background cut-out by border flood fill, marked-up headline words, text wrapping, contrast.

export const colorDist = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) => {
  // "redmean" weighted RGB distance, 0…~765
  const rm = (r1 + r2) / 2
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 3
}

/** Background colour estimate: per-channel median of the border pixels. */
export function borderColor(d: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const rs: number[] = [], gs: number[] = [], bs: number[] = []
  const take = (x: number, y: number) => {
    const i = (y * w + x) * 4
    rs.push(d[i])
    gs.push(d[i + 1])
    bs.push(d[i + 2])
  }
  const step = Math.max(1, Math.floor((w + h) / 400))
  for (let x = 0; x < w; x += step) {
    take(x, 0)
    take(x, h - 1)
  }
  for (let y = 0; y < h; y += step) {
    take(0, y)
    take(w - 1, y)
  }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1]
  return [med(rs), med(gs), med(bs)]
}

/**
 * Removes the background connected to the image border (flood fill) whose colour is within `tol` of
 * the border colour. Pixels within `tol…tol+feather` get partial alpha. Returns removed fraction.
 */
export function removeBackground(d: Uint8ClampedArray, w: number, h: number, tol: number, feather = 12, global = false): number {
  const [br, bg, bb] = borderColor(d, w, h)
  const dist = new Float32Array(w * h)
  for (let p = 0; p < w * h; p++) dist[p] = colorDist(d[p * 4], d[p * 4 + 1], d[p * 4 + 2], br, bg, bb)
  const lim = tol + feather
  const seen = new Uint8Array(w * h)
  if (global) for (let p = 0; p < w * h; p++) seen[p] = dist[p] <= lim ? 1 : 0
  else {
    const stack: number[] = []
    const push = (p: number) => {
      if (!seen[p] && dist[p] <= lim) {
        seen[p] = 1
        stack.push(p)
      }
    }
    for (let x = 0; x < w; x++) {
      push(x)
      push((h - 1) * w + x)
    }
    for (let y = 0; y < h; y++) {
      push(y * w)
      push(y * w + w - 1)
    }
    while (stack.length) {
      const p = stack.pop()!
      if (dist[p] > tol) continue // feather band: don't spread further
      const x = p % w
      if (x > 0) push(p - 1)
      if (x < w - 1) push(p + 1)
      if (p >= w) push(p - w)
      if (p < w * (h - 1)) push(p + w)
    }
  }
  let removed = 0
  for (let p = 0; p < w * h; p++) {
    if (!seen[p]) continue
    const a = dist[p] <= tol ? 0 : feather > 0 ? (dist[p] - tol) / feather : 1
    d[p * 4 + 3] = Math.round(d[p * 4 + 3] * a)
    removed += 1 - a
  }
  return removed / (w * h)
}

/** "Stop *doing* this" → segments with `hot` for words wrapped in asterisks. */
export function segments(text: string): { t: string; hot: boolean }[] {
  const out: { t: string; hot: boolean }[] = []
  text.split(/(\*[^*]+\*)/).forEach((p) => {
    if (!p) return
    const hot = p.length > 2 && p.startsWith('*') && p.endsWith('*')
    out.push({ t: hot ? p.slice(1, -1) : p, hot })
  })
  return out
}

/** Greedy word wrap using a width measure function; respects explicit newlines. */
export function wrap(text: string, maxW: number, measure: (s: string) => number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let cur = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word
      if (cur && measure(next.replace(/\*/g, '')) > maxW) {
        lines.push(cur)
        cur = word
      } else cur = next
    }
    lines.push(cur)
  }
  return lines
}

const lin = (c: number) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
export const luminance = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
export function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0')
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]
}
export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(...a), lb = luminance(...b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
