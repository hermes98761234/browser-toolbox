// Signature smoothing: quadratic curves through stroke midpoints with velocity-based (or pressure-based)
// width, converted to filled outlines so canvas and SVG output look identical.

export interface Pt { x: number; y: number; t: number; p?: number }
export interface Sample { x: number; y: number; w: number }
export interface PenOpts { minW: number; maxW: number; velFilter: number; pressure: boolean }

/** Drops points closer than `minDist` to the previous kept point (jitter), keeping the last one. */
export function thin(pts: Pt[], minDist = 1.5): Pt[] {
  if (pts.length < 3) return pts
  const out = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]
    if (Math.hypot(pts[i].x - a.x, pts[i].y - a.y) >= minDist) out.push(pts[i])
  }
  out.push(pts[pts.length - 1])
  return out
}

/** Width at each raw point: fast strokes get thinner, like ink. Velocity is low-pass filtered. */
export function widths(pts: Pt[], o: PenOpts): number[] {
  let v = 0
  return pts.map((p, i) => {
    if (o.pressure && p.p !== undefined && p.p > 0 && p.p !== 0.5) return o.minW + (o.maxW - o.minW) * p.p
    if (i === 0) return (o.minW + o.maxW) / 2
    const q = pts[i - 1]
    const dt = Math.max(1, p.t - q.t)
    const nv = Math.hypot(p.x - q.x, p.y - q.y) / dt // px per ms
    v = o.velFilter * nv + (1 - o.velFilter) * v
    return Math.max(o.minW, o.maxW / (1 + v * 1.6))
  })
}

/** Samples the smoothed centre line (quadratic Béziers between midpoints) every ~`step` px. */
export function smooth(pts: Pt[], o: PenOpts, step = 1): Sample[] {
  const P = thin(pts)
  if (!P.length) return []
  const W = widths(P, o)
  if (P.length === 1) return [{ x: P[0].x, y: P[0].y, w: W[0] }]
  const out: Sample[] = [{ x: P[0].x, y: P[0].y, w: W[0] }]
  const mid = (i: number) => ({ x: (P[i].x + P[i + 1].x) / 2, y: (P[i].y + P[i + 1].y) / 2, w: (W[i] + W[i + 1]) / 2 })
  // first straight piece to the first midpoint
  const seg = (a: Sample, c: Sample | null, b: Sample) => {
    const len = c ? Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y) : Math.hypot(b.x - a.x, b.y - a.y)
    const n = Math.max(1, Math.ceil(len / step))
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t
      const x = c ? u * u * a.x + 2 * u * t * c.x + t * t * b.x : a.x + (b.x - a.x) * t
      const y = c ? u * u * a.y + 2 * u * t * c.y + t * t * b.y : a.y + (b.y - a.y) * t
      out.push({ x, y, w: a.w + (b.w - a.w) * t })
    }
  }
  let prev: Sample = out[0]
  const m0 = mid(0)
  seg(prev, null, m0)
  prev = m0
  for (let i = 1; i < P.length - 1; i++) {
    const m = mid(i)
    seg(prev, { x: P[i].x, y: P[i].y, w: W[i] }, m)
    prev = m
  }
  const last = P.length - 1
  seg(prev, null, { x: P[last].x, y: P[last].y, w: W[last] })
  return out
}

/** Filled outline polygon around a sampled stroke, with round caps. */
export function outline(s: Sample[]): [number, number][] {
  if (!s.length) return []
  if (s.length === 1) return circle(s[0].x, s[0].y, s[0].w / 2)
  const L: [number, number][] = [], R: [number, number][] = []
  for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)]
    let dx = b.x - a.x, dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    dx /= len
    dy /= len
    const h = s[i].w / 2
    L.push([s[i].x - dy * h, s[i].y + dx * h])
    R.push([s[i].x + dy * h, s[i].y - dx * h])
  }
  const cap = (p: Sample, q: Sample, from: [number, number]) => {
    const ang0 = Math.atan2(from[1] - p.y, from[0] - p.x)
    const dir = Math.atan2(p.y - q.y, p.x - q.x)
    const out: [number, number][] = []
    // sweep 180° through the outward direction
    const sweep = Math.sign(Math.sin(dir - ang0)) || 1
    for (let k = 1; k < 8; k++) {
      const a = ang0 + (sweep * Math.PI * k) / 8
      out.push([p.x + Math.cos(a) * (p.w / 2), p.y + Math.sin(a) * (p.w / 2)])
    }
    return out
  }
  const end = s[s.length - 1], start = s[0]
  return [...L, ...cap(end, s[s.length - 2], L[L.length - 1]), ...R.reverse(), ...cap(start, s[1], R[R.length - 1])]
}

export function circle(x: number, y: number, r: number, n = 12): [number, number][] {
  return Array.from({ length: n }, (_, k) => [x + Math.cos((2 * Math.PI * k) / n) * r, y + Math.sin((2 * Math.PI * k) / n) * r] as [number, number])
}

/** Bounding box of all outlines. */
export function bounds(polys: [number, number][][]): { x: number; y: number; w: number; h: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of polys) for (const [x, y] of p) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

export const polyPath = (p: [number, number][], ox = 0, oy = 0) => (p.length ? 'M' + p.map(([x, y]) => `${(x - ox).toFixed(1)} ${(y - oy).toFixed(1)}`).join('L') + 'Z' : '')

/** Trimmed, transparent SVG of the signature with `pad` px around it. */
export function toSvg(polys: [number, number][][], color: string, pad = 8): string {
  const b = bounds(polys)
  if (!b) return ''
  const ox = b.x - pad, oy = b.y - pad
  const w = Math.ceil(b.w + 2 * pad), h = Math.ceil(b.h + 2 * pad)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path fill="${color}" d="${polys.map((p) => polyPath(p, ox, oy)).join('')}"/></svg>`
}

/** A synthetic handwritten-looking demo signature (loops + flourish) with realistic timing. */
export function demoStrokes(w: number, h: number): Pt[][] {
  const strokes: Pt[][] = []
  let t = 0
  const add = (f: (u: number) => [number, number], n: number, speed: (u: number) => number) => {
    const s: Pt[] = []
    for (let i = 0; i <= n; i++) {
      const u = i / n
      const [x, y] = f(u)
      t += 11 / speed(u)
      s.push({ x: x * w, y: y * h, t })
    }
    strokes.push(s)
    t += 200
  }
  // capital letter: tall loop
  add((u) => [0.16 + 0.06 * Math.sin(u * Math.PI * 2.2) + u * 0.04, 0.72 - 0.5 * Math.sin(u * Math.PI)], 60, (u) => 0.6 + Math.sin(u * Math.PI))
  // running lowercase loops
  add((u) => [0.24 + u * 0.5 + 0.025 * Math.cos(u * Math.PI * 14), 0.6 - 0.12 * Math.abs(Math.sin(u * Math.PI * 7)) - 0.08 * Math.sin(u * Math.PI)], 220, (u) => 0.8 + 0.6 * Math.abs(Math.cos(u * Math.PI * 7)))
  // underline flourish
  add((u) => [0.14 + u * 0.72, 0.8 + 0.06 * Math.sin(u * Math.PI * 1.3) - u * 0.05], 70, (u) => 1.2 + 2 * u)
  // dot
  add(() => [0.62, 0.36], 1, () => 1)
  return strokes
}
