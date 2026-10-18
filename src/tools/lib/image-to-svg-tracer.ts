// Monochrome line-art tracer: thresholding (global / Otsu / adaptive), an outline tracer (marching-squares
// boundaries → turning-angle corner detection → Gaussian smoothing → piecewise Schneider Bézier fitting) and a
// centerline tracer (Zhang–Suen skeleton → stroke graph → Béziers).
import { contours, fitCurve, signedArea, type P } from './vectorizer'

// ---------- bitmap preparation ----------

export function toGray(px: Uint8ClampedArray, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const a = px[i * 4 + 3] / 255
    // composite on white so transparent PNG signatures work
    const l = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]
    g[i] = l * a + 255 * (1 - a)
  }
  return g
}

export function boxBlur(g: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return g
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    let s = 0, n = 0
    for (let x = -r; x < w; x++) {
      if (x + r < w) { s += g[y * w + x + r]; n++ }
      if (x - r - 1 >= 0) { s -= g[y * w + x - r - 1]; n-- }
      if (x >= 0) tmp[y * w + x] = s / n
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0, n = 0
    for (let y = -r; y < h; y++) {
      if (y + r < h) { s += tmp[(y + r) * w + x]; n++ }
      if (y - r - 1 >= 0) { s -= tmp[(y - r - 1) * w + x]; n-- }
      if (y >= 0) out[y * w + x] = s / n
    }
  }
  return out
}

/** Otsu's threshold on a 256-bin histogram. */
export function otsu(g: Float32Array): number {
  const hist = new Float64Array(256)
  for (const v of g) hist[Math.max(0, Math.min(255, Math.round(v)))]++
  const total = g.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, best = 0, th = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB, mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > best) { best = between; th = t }
  }
  return th + 0.5
}

export type ThresholdMode = 'otsu' | 'manual' | 'adaptive'
export interface BinOptions { mode: ThresholdMode; level: number; window: number; sensitivity: number; blur: number; invert: boolean }

/** 1 = ink. Adaptive = Bradley–Roth local mean with an integral image (window in % of the short side). */
export function binarize(g0: Float32Array, w: number, h: number, o: BinOptions): { bm: Uint8Array; level: number } {
  const g = boxBlur(g0, w, h, o.blur)
  const bm = new Uint8Array(w * h)
  if (o.mode !== 'adaptive') {
    const level = o.mode === 'otsu' ? otsu(g) : o.level
    for (let i = 0; i < g.length; i++) bm[i] = (g[i] < level) !== o.invert ? 1 : 0
    return { bm, level }
  }
  const W = w + 1
  const I = new Float64Array(W * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row }
  }
  const s = Math.max(3, Math.round((Math.min(w, h) * o.window) / 100)) >> 1
  const t = o.sensitivity / 100
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - s), y1 = Math.min(h, y + s + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - s), x1 = Math.min(w, x + s + 1)
      const mean = (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / ((x1 - x0) * (y1 - y0))
      const v = g[y * w + x]
      bm[y * w + x] = (o.invert ? v > mean * (1 + t) : v < mean * (1 - t)) ? 1 : 0
    }
  }
  return { bm, level: NaN }
}

/** Removes 8-connected ink components smaller than `minArea` pixels (and fills holes smaller than it). */
export function despeckle(bm: Uint8Array, w: number, h: number, minArea: number, holes = false): Uint8Array {
  if (minArea <= 1) return bm
  const out = bm.slice()
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  const comp: number[] = []
  const target = holes ? 0 : 1
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || out[i] !== target) continue
    comp.length = 0
    stack.push(i)
    seen[i] = 1
    let touchesEdge = false
    while (stack.length) {
      const p = stack.pop()!
      comp.push(p)
      const x = p % w, y = (p - x) / w
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (holes && dx && dy)) continue
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const q = ny * w + nx
        if (!seen[q] && out[q] === target) { seen[q] = 1; stack.push(q) }
      }
    }
    if (comp.length < minArea && !(holes && touchesEdge)) for (const p of comp) out[p] = 1 - target
  }
  return out
}

// ---------- outline tracing ----------
// Boundary rings come from marching squares on the bitmap (outer boundaries and holes have opposite winding,
// rendered with the even-odd rule). Each ring is examined for corners by its turning angle over a fixed arc
// length; corners are sharpened by intersecting lines fitted to either side; the stretches between corners are
// smoothed and fitted with cubic Béziers (Schneider), or emitted as straight lines when flat enough.

export interface OutlineOptions {
  /** rings enclosing fewer pixels than this are dropped */
  minArea: number
  /** turning angle (degrees, over ~3 px of outline) above which a point is kept as a sharp corner; ≥180 = none */
  cornerAngle: number
  /** Gaussian smoothing radius (px) applied between corners */
  smoothness: number
  /** maximum Bézier fitting error (px) */
  tolerance: number
}

const f2 = (v: number) => String(Math.round(v * 100) / 100)
const unit = (x: number, y: number): P => { const l = Math.hypot(x, y); return l ? [x / l, y / l] : [0, 0] }

function cumulative(p: P[], closed: boolean): number[] {
  const s = [0]
  for (let i = 1; i < p.length; i++) s.push(s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]))
  if (closed && p.length) s.push(s[p.length - 1] + Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]))
  return s
}

/**
 * Gaussian smoothing along the polyline (σ in px, converted to samples by the mean spacing). Open polylines use a
 * window that shrinks symmetrically towards the ends, so end points stay put and straight runs stay straight.
 */
function gauss(p: P[], sigmaPx: number, closed: boolean): P[] {
  const n = p.length
  if (sigmaPx <= 0 || n < 3) return p
  const s = cumulative(p, closed)
  const spacing = s[s.length - 1] / (closed ? n : n - 1) || 1
  const sig = sigmaPx / spacing
  const R = Math.min(Math.ceil(2.5 * sig), closed ? Math.floor((n - 1) / 2) : n)
  const wt = Array.from({ length: R + 1 }, (_, k) => Math.exp((-k * k) / (2 * sig * sig)))
  const out: P[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const r = closed ? R : Math.min(R, i, n - 1 - i)
    let x = p[i][0], y = p[i][1], ws = 1
    for (let k = 1; k <= r; k++) {
      const a = p[closed ? (i - k + n) % n : i - k], b = p[closed ? (i + k) % n : i + k]
      x += wt[k] * (a[0] + b[0]); y += wt[k] * (a[1] + b[1]); ws += 2 * wt[k]
    }
    out[i] = [x / ws, y / ws]
  }
  return out
}

/** Shrink-compensated smoothing ("twicing", 2G − G∘G): removes pixel steps without pulling curves inwards. */
function smoothKeep(p: P[], sigmaPx: number, closed: boolean): P[] {
  const g = gauss(p, sigmaPx, closed)
  if (g === p) return p
  const gg = gauss(g, sigmaPx, closed)
  return g.map((q, i) => [2 * q[0] - gg[i][0], 2 * q[1] - gg[i][1]] as P)
}

/** Index of the sample `dist` px of arc away from i (dir = ±1) on a closed ring with arc table s. */
function walk(s: number[], i: number, dist: number, dir: 1 | -1): number {
  const n = s.length - 1, T = s[n]
  let j = i, d = 0
  while (d < dist) {
    const k = dir > 0 ? (j + 1) % n : (j - 1 + n) % n
    d += dir > 0 ? (k === 0 ? T - s[j] : s[k] - s[j]) : (j === 0 ? T - s[k] : s[j] - s[k])
    j = k
    if (j === i) break
  }
  return j
}

/** Sharp corners of a closed ring: local maxima of the turning angle measured between chords of length `reach`. */
function sharpPoints(p: P[], deg: number, reach: number): number[] {
  const n = p.length
  if (deg >= 180) return []
  const s = cumulative(p, true)
  if (s[n] < reach * 6) return []
  const turn = new Float64Array(n), back = new Int32Array(n), fwd = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    back[i] = walk(s, i, reach, -1); fwd[i] = walk(s, i, reach, 1)
    const a = unit(p[i][0] - p[back[i]][0], p[i][1] - p[back[i]][1]), b = unit(p[fwd[i]][0] - p[i][0], p[fwd[i]][1] - p[i][1])
    turn[i] = (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) * 180) / Math.PI
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    if (turn[i] <= deg) continue
    let best = true
    // non-maximum suppression within the measuring reach (ties go to the earlier sample)
    for (let j = back[i]; j !== i && best; j = (j + 1) % n) if (turn[j] >= turn[i]) best = false
    for (let j = (i + 1) % n; j !== fwd[i] && best; j = (j + 1) % n) if (turn[j] > turn[i]) best = false
    if (best) out.push(i)
  }
  return out
}

/** Least-squares line (centroid + principal direction) through points. */
function lineFit(pts: P[]): { c: P; d: P } | null {
  if (pts.length < 2) return null
  let cx = 0, cy = 0
  for (const [x, y] of pts) { cx += x; cy += y }
  cx /= pts.length; cy /= pts.length
  let sxx = 0, sxy = 0, syy = 0
  for (const [x, y] of pts) { sxx += (x - cx) ** 2; sxy += (x - cx) * (y - cy); syy += (y - cy) ** 2 }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  return { c: [cx, cy], d: [Math.cos(ang), Math.sin(ang)] }
}

/** Moves a corner to the intersection of lines fitted to the outline just before and just after it. */
function crispCorner(p: P[], s: number[], i: number, room: number): P {
  const n = p.length, T = s[n]
  const side = (dir: 1 | -1): P[] => {
    const pts: P[] = []
    let j = i, d = 0
    while (d < Math.min(5, room)) {
      const k = dir > 0 ? (j + 1) % n : (j - 1 + n) % n
      d += dir > 0 ? (k === 0 ? T - s[j] : s[k] - s[j]) : (j === 0 ? T - s[k] : s[j] - s[k])
      j = k
      if (d > 1.2) pts.push(p[j])
    }
    return pts
  }
  const A = lineFit(side(-1)), B = lineFit(side(1))
  if (!A || !B) return p[i]
  const den = A.d[0] * B.d[1] - A.d[1] * B.d[0]
  if (Math.abs(den) < 0.2) return p[i] // nearly parallel: keep the sample
  const t = ((B.c[0] - A.c[0]) * B.d[1] - (B.c[1] - A.c[1]) * B.d[0]) / den
  const q: P = [A.c[0] + t * A.d[0], A.c[1] + t * A.d[1]]
  return Math.hypot(q[0] - p[i][0], q[1] - p[i][1]) <= 1.5 ? q : p[i]
}

/** Unit direction from point a towards the sample about `len` px of arc further along the list. */
function lead(p: P[], len: number): P {
  let d = 0
  for (let k = 1; k < p.length; k++) {
    d += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1])
    if (d >= len || k === p.length - 1) return unit(p[k][0] - p[0][0], p[k][1] - p[0][1])
  }
  return [0, 0]
}

function chordDeviation(p: P[]): number {
  const a = p[0], b = p[p.length - 1]
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy)
  let m = 0
  for (const q of p) m = Math.max(m, L ? Math.abs(dx * (q[1] - a[1]) - dy * (q[0] - a[0])) / L : Math.hypot(q[0] - a[0], q[1] - a[1]))
  return m
}

interface RingOut { d: string; curves: number; lines: number; corners: number }

function emitRing(ring: P[], o: OutlineOptions): RingOut {
  const n = ring.length
  const tol = Math.max(0.05, o.tolerance)
  if (n < 8) return { d: 'M' + ring.map(([x, y]) => `${f2(x)} ${f2(y)}`).join('L') + 'Z', curves: 0, lines: n, corners: 0 }
  const guide = gauss(ring, 1, true) // de-stepped copy used only to find and place corners
  const cs = sharpPoints(guide, o.cornerAngle, 3)
  const head = (pt: P) => `M${f2(pt[0])} ${f2(pt[1])}`
  const cub = (b: [P, P, P, P]) => `C${f2(b[1][0])} ${f2(b[1][1])} ${f2(b[2][0])} ${f2(b[2][1])} ${f2(b[3][0])} ${f2(b[3][1])}`

  if (!cs.length) {
    // smooth closed curve: fit the whole loop with a shared tangent at the seam so it closes without a kink
    const sm = smoothKeep(ring, o.smoothness, true)
    const t = unit(sm[1][0] - sm[n - 1][0], sm[1][1] - sm[n - 1][1])
    const half = n >> 1
    const bz = [...fitCurve(sm.slice(0, half + 1), tol, t, unit(sm[half - 1][0] - sm[half + 1][0], sm[half - 1][1] - sm[half + 1][1])),
      ...fitCurve([...sm.slice(half), sm[0]], tol, unit(sm[half + 1][0] - sm[half - 1][0], sm[half + 1][1] - sm[half - 1][1]), [-t[0], -t[1]])]
    return { d: head(sm[0]) + bz.map(cub).join('') + 'Z', curves: bz.length, lines: 0, corners: 0 }
  }

  const s = cumulative(guide, true)
  const T = s[n]
  const gap = (a: number, b: number) => (b > a ? s[b] - s[a] : T - s[a] + s[b])
  const m = cs.length
  const pin = cs.map((c, j) => crispCorner(guide, s, c, Math.min(gap(cs[(j - 1 + m) % m], c), gap(c, cs[(j + 1) % m])) / 2))
  let d = head(pin[0]), curves = 0, lines = 0
  for (let j = 0; j < m; j++) {
    const a = cs[j], b = cs[(j + 1) % m]
    const run: P[] = [pin[j]]
    for (let i = (a + 1) % n; i !== b; i = (i + 1) % n) run.push(ring[i])
    run.push(pin[(j + 1) % m])
    const sm = smoothKeep(run, o.smoothness, false)
    if (sm.length <= 3 || chordDeviation(sm) <= Math.min(0.5, tol * 0.5)) {
      d += `L${f2(sm[sm.length - 1][0])} ${f2(sm[sm.length - 1][1])}`
      lines++
      continue
    }
    const len = Math.min(2.5, gap(a, b) / 4)
    const bz = fitCurve(sm, tol, lead(sm, len), lead([...sm].reverse(), len))
    d += bz.map(cub).join('')
    curves += bz.length
  }
  return { d: d + 'Z', curves, lines, corners: m }
}

export interface OutlineResult { d: string; paths: number; curves: number; lines: number; corners: number }

export function traceOutline(bm: Uint8Array, w: number, h: number, o: OutlineOptions): OutlineResult {
  let d = '', paths = 0, curves = 0, lines = 0, corners = 0
  for (const ring of contours(bm, w, h)) {
    if (Math.abs(signedArea(ring)) < Math.max(1, o.minArea)) continue
    const r = emitRing(ring, o)
    d += r.d; paths++; curves += r.curves; lines += r.lines; corners += r.corners
  }
  return { d, paths, curves, lines, corners }
}

// ---------- centerline tracing ----------

/** Zhang–Suen thinning; returns a 1-pixel-wide 8-connected skeleton. */
export function thin(bm0: Uint8Array, w: number, h: number): Uint8Array {
  const bm = bm0.slice()
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? bm[y * w + x] : 0)
  const del: number[] = []
  let changed = true
  while (changed) {
    changed = false
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!bm[y * w + x]) continue
        const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1), p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1)
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
        if (B < 2 || B > 6) continue
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
        let A = 0
        for (let i = 0; i < 8; i++) if (!seq[i] && seq[i + 1]) A++
        if (A !== 1) continue
        if (pass === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue
        del.push(y * w + x)
      }
      if (del.length) changed = true
      for (const i of del) bm[i] = 0
    }
  }
  // remove staircase corners so every skeleton pixel has a clean 8-neighbour chain
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!bm[y * w + x]) continue
    const n = at(x, y - 1), e = at(x + 1, y), s = at(x, y + 1), wv = at(x - 1, y)
    if ((n && e && !at(x - 1, y + 1) && !s && !wv) || (e && s && !at(x - 1, y - 1) && !n && !wv) || (s && wv && !at(x + 1, y - 1) && !n && !e) || (wv && n && !at(x + 1, y + 1) && !s && !e)) bm[y * w + x] = 0
  }
  return bm
}

/** Chamfer (3-4) distance to the nearest background pixel, in pixels. */
export function distance(bm: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9
  const d = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) d[i] = bm[i] ? INF : 0
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x])
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (!d[i]) continue
    d[i] = Math.min(d[i], get(x - 1, y) + 3, get(x, y - 1) + 3, get(x - 1, y - 1) + 4, get(x + 1, y - 1) + 4)
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x
    if (!d[i]) continue
    d[i] = Math.min(d[i], get(x + 1, y) + 3, get(x, y + 1) + 3, get(x + 1, y + 1) + 4, get(x - 1, y + 1) + 4)
  }
  for (let i = 0; i < w * h; i++) d[i] /= 3
  return d
}

const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const

/** Splits a skeleton into polylines between end points and junctions; prunes short spurs. */
export function skeletonPaths(sk: Uint8Array, w: number, h: number, minSpur: number): P[][] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && sk[y * w + x] === 1
  const deg = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (sk[y * w + x]) deg[y * w + x] = N8.filter(([dx, dy]) => at(x + dx, y + dy)).length
  const isNode = (i: number) => deg[i] !== 2
  // merge touching junction pixels into one junction (label + centroid)
  const lab = new Int32Array(w * h).fill(-1)
  const cent: P[] = []
  for (let i = 0; i < w * h; i++) {
    if (!sk[i] || deg[i] < 3 || lab[i] >= 0) continue
    const id = cent.length, st = [i]
    let sx = 0, sy = 0, n = 0
    lab[i] = id
    while (st.length) {
      const c = st.pop()!, cx = c % w, cy = (c - cx) / w
      sx += cx; sy += cy; n++
      for (const [dx, dy] of N8) {
        const nx = cx + dx, ny = cy + dy, q = ny * w + nx
        if (at(nx, ny) && deg[q] >= 3 && lab[q] < 0) { lab[q] = id; st.push(q) }
      }
    }
    cent.push([sx / n, sy / n])
  }
  const used = new Set<number>()
  const ek = (a: number, b: number) => (a < b ? a * w * h + b : b * w * h + a)
  const out: { pts: P[]; spur: boolean }[] = []
  const pos = (i: number): P => (lab[i] >= 0 ? cent[lab[i]] : [i % w, Math.floor(i / w)])
  const walk = (start: number, next: number) => {
    const pts: P[] = [pos(start)]
    let prev = start, cur = next
    used.add(ek(prev, cur))
    for (;;) {
      pts.push(pos(cur))
      if (isNode(cur) || cur === start) break
      const cx = cur % w, cy = (cur - cx) / w
      let nxt = -1
      for (const [dx, dy] of N8) {
        if (!at(cx + dx, cy + dy)) continue
        const q = (cy + dy) * w + cx + dx
        if (q === prev || used.has(ek(cur, q))) continue
        nxt = q
        break
      }
      if (nxt < 0) break
      used.add(ek(cur, nxt))
      prev = cur
      cur = nxt
    }
    const endA = deg[start] === 1, endB = deg[cur] === 1
    out.push({ pts, spur: endA !== endB && pts.length < minSpur })
  }
  for (let i = 0; i < w * h; i++) {
    if (!sk[i] || !isNode(i)) continue
    const x = i % w, y = (i - x) / w
    for (const [dx, dy] of N8) {
      if (!at(x + dx, y + dy)) continue
      const q = (y + dy) * w + x + dx
      if (lab[i] >= 0 && lab[q] === lab[i]) continue
      if (!used.has(ek(i, q))) walk(i, q)
    }
  }
  // closed loops without nodes
  for (let i = 0; i < w * h; i++) {
    if (!sk[i] || deg[i] !== 2) continue
    const x = i % w, y = (i - x) / w
    for (const [dx, dy] of N8) {
      if (!at(x + dx, y + dy)) continue
      const q = (y + dy) * w + x + dx
      if (!used.has(ek(i, q))) walk(i, q)
      break
    }
  }
  return out.filter((p) => !p.spur && p.pts.length >= 2).map((p) => p.pts)
}

export interface CenterOptions { minSpur: number; error: number; smoothing: number; widthMode: 'auto' | 'fixed'; width: number }
export interface Stroke { d: string; width: number; segs: number }

function smoothOpen(p: P[], passes: number): P[] {
  let q = p
  for (let k = 0; k < passes; k++) q = q.map((pt, i) => (i === 0 || i === q.length - 1 ? pt : [(q[i - 1][0] + 2 * pt[0] + q[i + 1][0]) / 4, (q[i - 1][1] + 2 * pt[1] + q[i + 1][1]) / 4] as P))
  return q
}

export function traceCenterline(bm: Uint8Array, w: number, h: number, o: CenterOptions): { strokes: Stroke[]; skeleton: Uint8Array; avgWidth: number } {
  const sk = thin(bm, w, h)
  const dt = distance(bm, w, h)
  const lines = skeletonPaths(sk, w, h, o.minSpur)
  const strokes: Stroke[] = []
  let wsum = 0
  for (const line of lines) {
    const ds = line.map(([x, y]) => dt[y * w + x]).sort((a, b) => a - b)
    const width = o.widthMode === 'fixed' ? o.width : Math.max(1, 2 * ds[ds.length >> 1] - 0.5)
    wsum += width
    const closed = line.length > 3 && line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1]
    const centred: P[] = line.map(([x, y]) => [x + 0.5, y + 0.5])
    const sm = smoothOpen(centred, o.smoothing)
    const bz = sm.length > 2 ? fitCurve(sm, o.error) : []
    let d: string
    if (bz.length) {
      d = `M${f2(bz[0][0][0])} ${f2(bz[0][0][1])}` + bz.map((c) => `C${f2(c[1][0])} ${f2(c[1][1])} ${f2(c[2][0])} ${f2(c[2][1])} ${f2(c[3][0])} ${f2(c[3][1])}`).join('')
    } else d = `M${f2(sm[0][0])} ${f2(sm[0][1])}L${f2(sm[sm.length - 1][0])} ${f2(sm[sm.length - 1][1])}`
    if (closed) d += 'Z'
    strokes.push({ d, width: Math.round(width * 10) / 10, segs: Math.max(1, bz.length) })
  }
  return { strokes, skeleton: sk, avgWidth: strokes.length ? wsum / strokes.length : 0 }
}

// ---------- SVG ----------

export interface SvgStyle { color: string; background: string | null }

export function outlineSvg(w: number, h: number, d: string, st: SvgStyle): string {
  const bg = st.background ? `<rect width="${w}" height="${h}" fill="${st.background}"/>\n` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n${bg}<path fill="${st.color}" fill-rule="evenodd" d="${d}"/>\n</svg>\n`
}

export function strokeSvg(w: number, h: number, strokes: Stroke[], st: SvgStyle): string {
  const bg = st.background ? `<rect width="${w}" height="${h}" fill="${st.background}"/>\n` : ''
  // group strokes by width to keep the file small
  const by = new Map<number, string[]>()
  for (const s of strokes) by.set(s.width, [...(by.get(s.width) ?? []), s.d])
  const g = [...by].map(([wd, ds]) => `<path stroke-width="${wd}" d="${ds.join('')}"/>`).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n${bg}<g fill="none" stroke="${st.color}" stroke-linecap="round" stroke-linejoin="round">\n${g}\n</g>\n</svg>\n`
}

// ---------- full pipeline (used by the worker) ----------

export interface Options extends BinOptions, OutlineOptions, CenterOptions { mode2: 'outline' | 'centerline'; speckle: number }
export interface Output { w: number; h: number; level: number; bm: Uint8Array; svg: string; paths: number; curves: number; lines: number; corners: number; avgWidth: number }

export function run(px: Uint8ClampedArray, w: number, h: number, o: Options, st: SvgStyle): Output {
  const g = toGray(px, w, h)
  const { bm: raw, level } = binarize(g, w, h, o)
  let bm = despeckle(raw, w, h, o.speckle)
  bm = despeckle(bm, w, h, Math.round(o.speckle / 2), true)
  if (o.mode2 === 'outline') {
    const r = traceOutline(bm, w, h, o)
    return { w, h, level, bm, svg: outlineSvg(w, h, r.d, st), paths: r.paths, curves: r.curves, lines: r.lines, corners: r.corners, avgWidth: 0 }
  }
  const r = traceCenterline(bm, w, h, o)
  return { w, h, level, bm, svg: strokeSvg(w, h, r.strokes, st), paths: r.strokes.length, curves: r.strokes.reduce((a, s) => a + s.segs, 0), lines: 0, corners: 0, avgWidth: r.avgWidth }
}
