// Monochrome line-art tracer: thresholding (global / Otsu / adaptive), a potrace-style outline tracer
// (path decomposition, optimal polygon, vertex adjustment, corner detection, Bézier smoothing and curve
// optimisation, after Selinger 2003) and a centerline tracer (Zhang–Suen skeleton → stroke graph → Béziers).
import { fitCurve, type P } from './vectorizer'

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

// ---------- potrace-style outline tracing ----------

interface Pt { x: number; y: number }
interface Sum { x: number; y: number; xy: number; x2: number; y2: number }
interface Curve { n: number; tag: ('CURVE' | 'CORNER')[]; c: Pt[]; vertex: Pt[]; alpha: number[]; alpha0: number[]; beta: number[] }
interface Path { pt: Pt[]; len: number; area: number; sign: 1 | -1; maxX: number; x0: number; y0: number; sums: Sum[]; lon: number[]; po: number[]; m: number; curve: Curve }

export type TurnPolicy = 'minority' | 'majority' | 'black' | 'white' | 'left' | 'right'
export interface TraceOptions { turdSize: number; turnPolicy: TurnPolicy; alphaMax: number; optCurve: boolean; optTolerance: number }

const mod = (a: number, n: number) => (a >= n ? a % n : a >= 0 ? a : n - 1 - ((-1 - a) % n))
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0)
const xprod = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x
const cyclic = (a: number, b: number, c: number) => (a <= c ? a <= b && b < c : a <= b || b < c)
const interval = (l: number, a: Pt, b: Pt): Pt => ({ x: a.x + l * (b.x - a.x), y: a.y + l * (b.y - a.y) })
const dpara = (p0: Pt, p1: Pt, p2: Pt) => (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y)
const ddenom = (p0: Pt, p2: Pt) => sign(p2.x - p0.x) * (p2.x - p0.x) - -sign(p2.y - p0.y) * (p2.y - p0.y)
const cprod = (p0: Pt, p1: Pt, p2: Pt, p3: Pt) => (p1.x - p0.x) * (p3.y - p2.y) - (p3.x - p2.x) * (p1.y - p0.y)
const iprod = (p0: Pt, p1: Pt, p2: Pt) => (p1.x - p0.x) * (p2.x - p0.x) + (p1.y - p0.y) * (p2.y - p0.y)
const iprod1 = (p0: Pt, p1: Pt, p2: Pt, p3: Pt) => (p1.x - p0.x) * (p3.x - p2.x) + (p1.y - p0.y) * (p3.y - p2.y)
const ddist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y)

function bezierPt(t: number, p0: Pt, p1: Pt, p2: Pt, p3: Pt): Pt {
  const s = 1 - t
  return {
    x: s * s * s * p0.x + 3 * (s * s * t) * p1.x + 3 * (t * t * s) * p2.x + t * t * t * p3.x,
    y: s * s * s * p0.y + 3 * (s * s * t) * p1.y + 3 * (t * t * s) * p2.y + t * t * t * p3.y,
  }
}
function tangent(p0: Pt, p1: Pt, p2: Pt, p3: Pt, q0: Pt, q1: Pt): number {
  const A = cprod(p0, p1, q0, q1), B = cprod(p1, p2, q0, q1), C = cprod(p2, p3, q0, q1)
  const a = A - 2 * B + C, b = -2 * A + 2 * B, c = A
  const d = b * b - 4 * a * c
  if (a === 0 || d < 0) return -1
  const s = Math.sqrt(d)
  const r1 = (-b + s) / (2 * a), r2 = (-b - s) / (2 * a)
  return r1 >= 0 && r1 <= 1 ? r1 : r2 >= 0 && r2 <= 1 ? r2 : -1
}

/** Decompose the bitmap into closed boundary paths (potrace §2.1), xor-ing each interior away. */
function decompose(bm0: Uint8Array, w: number, h: number, o: TraceOptions): Path[] {
  const bm = bm0.slice()
  const at = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h && bm[y * w + x] === 1
  const at0 = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h && bm0[y * w + x] === 1
  const majority = (x: number, y: number) => {
    for (let i = 2; i < 5; i++) {
      let ct = 0
      for (let a = -i + 1; a <= i - 1; a++) {
        ct += at(x + a, y + i - 1) ? 1 : -1
        ct += at(x + i - 1, y + a - 1) ? 1 : -1
        ct += at(x + a - 1, y - i) ? 1 : -1
        ct += at(x - i, y + a) ? 1 : -1
      }
      if (ct > 0) return true
      if (ct < 0) return false
    }
    return false
  }
  const paths: Path[] = []
  let idx = 0
  for (;;) {
    while (idx < w * h && bm[idx] !== 1) idx++
    if (idx >= w * h) break
    const sx = idx % w, sy = (idx - sx) / w
    const pt: Pt[] = []
    let x = sx, y = sy, dirx = 0, diry = 1, area = 0, maxX = 0
    const sgn: 1 | -1 = at0(sx, sy) ? 1 : -1
    for (;;) {
      pt.push({ x, y })
      if (x > maxX) maxX = x
      x += dirx; y += diry
      area -= x * diry
      if (x === sx && y === sy) break
      const l = at(x + (dirx + diry - 1) / 2, y + (diry - dirx - 1) / 2)
      const r = at(x + (dirx - diry - 1) / 2, y + (diry + dirx - 1) / 2)
      let tmp: number
      if (r && !l) {
        const p = o.turnPolicy
        if (p === 'right' || (p === 'black' && sgn === 1) || (p === 'white' && sgn === -1) || (p === 'majority' && majority(x, y)) || (p === 'minority' && !majority(x, y))) { tmp = dirx; dirx = -diry; diry = tmp }
        else { tmp = dirx; dirx = diry; diry = -tmp }
      } else if (r) { tmp = dirx; dirx = -diry; diry = tmp }
      else if (!l) { tmp = dirx; dirx = diry; diry = -tmp }
    }
    // xor the interior so the next scan finds holes / remaining shapes
    let y1 = pt[0].y
    for (let i = 1; i < pt.length; i++) {
      const px = pt[i].x, py = pt[i].y
      if (py !== y1) {
        const minY = Math.min(y1, py)
        for (let j = px; j < maxX; j++) bm[minY * w + j] ^= 1
        y1 = py
      }
    }
    if (Math.abs(area) > o.turdSize) paths.push({ pt, len: pt.length, area, sign: sgn, maxX, x0: 0, y0: 0, sums: [], lon: [], po: [], m: 0, curve: null as unknown as Curve })
  }
  return paths
}

function calcSums(p: Path) {
  p.x0 = p.pt[0].x; p.y0 = p.pt[0].y
  const s: Sum[] = [{ x: 0, y: 0, xy: 0, x2: 0, y2: 0 }]
  for (let i = 0; i < p.len; i++) {
    const x = p.pt[i].x - p.x0, y = p.pt[i].y - p.y0, q = s[i]
    s.push({ x: q.x + x, y: q.y + y, xy: q.xy + x * y, x2: q.x2 + x * x, y2: q.y2 + y * y })
  }
  p.sums = s
}

/** For each point, the furthest point reachable by a straight subpath (potrace §2.2). */
function calcLon(p: Path) {
  const n = p.len, pt = p.pt
  const pivk = new Array<number>(n), nc = new Array<number>(n), ct = [0, 0, 0, 0]
  p.lon = new Array<number>(n)
  const constraint: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }]
  const cur: Pt = { x: 0, y: 0 }, off: Pt = { x: 0, y: 0 }, dk: Pt = { x: 0, y: 0 }
  let k = 0
  for (let i = n - 1; i >= 0; i--) {
    if (pt[i].x !== pt[k].x && pt[i].y !== pt[k].y) k = i + 1
    nc[i] = k
  }
  for (let i = n - 1; i >= 0; i--) {
    ct[0] = ct[1] = ct[2] = ct[3] = 0
    let dir = (3 + 3 * (pt[mod(i + 1, n)].x - pt[i].x) + (pt[mod(i + 1, n)].y - pt[i].y)) / 2
    ct[dir]++
    constraint[0].x = constraint[0].y = constraint[1].x = constraint[1].y = 0
    k = nc[i]
    let k1 = i, found = false
    for (;;) {
      dir = (3 + 3 * sign(pt[k].x - pt[k1].x) + sign(pt[k].y - pt[k1].y)) / 2
      ct[dir]++
      if (ct[0] && ct[1] && ct[2] && ct[3]) { pivk[i] = k1; found = true; break }
      cur.x = pt[k].x - pt[i].x; cur.y = pt[k].y - pt[i].y
      if (xprod(constraint[0], cur) < 0 || xprod(constraint[1], cur) > 0) break
      if (Math.abs(cur.x) > 1 || Math.abs(cur.y) > 1) {
        off.x = cur.x + (cur.y >= 0 && (cur.y > 0 || cur.x < 0) ? 1 : -1)
        off.y = cur.y + (cur.x <= 0 && (cur.x < 0 || cur.y < 0) ? 1 : -1)
        if (xprod(constraint[0], off) >= 0) { constraint[0].x = off.x; constraint[0].y = off.y }
        off.x = cur.x + (cur.y <= 0 && (cur.y < 0 || cur.x < 0) ? 1 : -1)
        off.y = cur.y + (cur.x >= 0 && (cur.x > 0 || cur.y < 0) ? 1 : -1)
        if (xprod(constraint[1], off) <= 0) { constraint[1].x = off.x; constraint[1].y = off.y }
      }
      k1 = k
      k = nc[k1]
      if (!cyclic(k, i, k1)) break
    }
    if (!found) {
      dk.x = sign(pt[k].x - pt[k1].x); dk.y = sign(pt[k].y - pt[k1].y)
      cur.x = pt[k1].x - pt[i].x; cur.y = pt[k1].y - pt[i].y
      const a = xprod(constraint[0], cur), b = xprod(constraint[0], dk), c = xprod(constraint[1], cur), d = xprod(constraint[1], dk)
      let j = 10000000
      if (b < 0) j = Math.floor(a / -b)
      if (d > 0) j = Math.min(j, Math.floor(-c / d))
      pivk[i] = mod(k1 + j, n)
    }
  }
  let j = pivk[n - 1]
  p.lon[n - 1] = j
  for (let i = n - 2; i >= 0; i--) {
    if (cyclic(i + 1, pivk[i], j)) j = pivk[i]
    p.lon[i] = j
  }
  for (let i = n - 1; cyclic(mod(i + 1, n), j, p.lon[i]); i--) p.lon[i] = j
}

function penalty3(p: Path, i: number, j: number): number {
  const n = p.len, pt = p.pt, s = p.sums
  let r = 0
  if (j >= n) { j -= n; r = 1 }
  const x = s[j + 1].x - s[i].x + r * s[n].x, y = s[j + 1].y - s[i].y + r * s[n].y
  const x2 = s[j + 1].x2 - s[i].x2 + r * s[n].x2, xy = s[j + 1].xy - s[i].xy + r * s[n].xy, y2 = s[j + 1].y2 - s[i].y2 + r * s[n].y2
  const k = j + 1 - i + r * n
  const px = (pt[i].x + pt[j].x) / 2 - pt[0].x, py = (pt[i].y + pt[j].y) / 2 - pt[0].y
  const ey = pt[j].x - pt[i].x, ex = -(pt[j].y - pt[i].y)
  const a = (x2 - 2 * x * px) / k + px * px, b = (xy - x * py - y * px) / k + px * py, c = (y2 - 2 * y * py) / k + py * py
  return Math.sqrt(Math.max(0, ex * ex * a + 2 * ex * ey * b + ey * ey * c))
}

/** Optimal polygon: fewest segments, then least penalty (potrace §2.2.3). */
function bestPolygon(p: Path) {
  const n = p.len
  const pen = new Array<number>(n + 1), prev = new Array<number>(n + 1), clip0 = new Array<number>(n), clip1 = new Array<number>(n + 1), seg0 = new Array<number>(n + 1), seg1 = new Array<number>(n + 1)
  for (let i = 0; i < n; i++) {
    let c = mod(p.lon[mod(i - 1, n)] - 1, n)
    if (c === i) c = mod(i + 1, n)
    clip0[i] = c < i ? n : c
  }
  let j = 1
  for (let i = 0; i < n; i++) while (j <= clip0[i]) { clip1[j] = i; j++ }
  let i = 0
  for (j = 0; i < n; j++) { seg0[j] = i; i = clip0[i] }
  seg0[j] = n
  const m = j
  i = n
  for (j = m; j > 0; j--) { seg1[j] = i; i = clip1[i] }
  seg1[0] = 0
  pen[0] = 0
  for (j = 1; j <= m; j++) {
    for (i = seg1[j]; i <= seg0[j]; i++) {
      let best = -1
      for (let k = seg0[j - 1]; k >= clip1[i]; k--) {
        const t = penalty3(p, k, i) + pen[k]
        if (best < 0 || t < best) { prev[i] = k; best = t }
      }
      pen[i] = best
    }
  }
  p.m = m
  p.po = new Array<number>(m)
  for (i = n, j = m - 1; i > 0; j--) { i = prev[i]; p.po[j] = i }
}

function pointSlope(p: Path, i: number, j: number, ctr: Pt, dir: Pt) {
  const n = p.len, s = p.sums
  let r = 0
  while (j >= n) { j -= n; r++ }
  while (i >= n) { i -= n; r-- }
  while (j < 0) { j += n; r-- }
  while (i < 0) { i += n; r++ }
  const x = s[j + 1].x - s[i].x + r * s[n].x, y = s[j + 1].y - s[i].y + r * s[n].y
  const x2 = s[j + 1].x2 - s[i].x2 + r * s[n].x2, xy = s[j + 1].xy - s[i].xy + r * s[n].xy, y2 = s[j + 1].y2 - s[i].y2 + r * s[n].y2
  const k = j + 1 - i + r * n
  ctr.x = x / k; ctr.y = y / k
  let a = (x2 - (x * x) / k) / k
  const b = (xy - (x * y) / k) / k
  let c = (y2 - (y * y) / k) / k
  const l2 = (a + c + Math.sqrt((a - c) * (a - c) + 4 * b * b)) / 2
  a -= l2; c -= l2
  let l: number
  if (Math.abs(a) >= Math.abs(c)) { l = Math.hypot(a, b); if (l) { dir.x = -b / l; dir.y = a / l } }
  else { l = Math.hypot(c, b); if (l) { dir.x = -c / l; dir.y = b / l } }
  if (!l) dir.x = dir.y = 0
}

type Quad = number[]
const quadForm = (Q: Quad, w: Pt) => {
  const v = [w.x, w.y, 1]
  let s = 0
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += v[i] * Q[i * 3 + j] * v[j]
  return s
}

function newCurve(n: number): Curve {
  return { n, tag: new Array(n), c: new Array(n * 3), vertex: new Array(n), alpha: new Array(n), alpha0: new Array(n), beta: new Array(n) }
}

/** Places each polygon vertex at the least-squares intersection of its two adjacent lines, within its pixel (§2.3). */
function adjustVertices(p: Path) {
  const m = p.m, po = p.po, n = p.len, pt = p.pt, x0 = p.x0, y0 = p.y0
  const ctr: Pt[] = [], dir: Pt[] = [], q: Quad[] = []
  p.curve = newCurve(m)
  for (let i = 0; i < m; i++) {
    let j = po[mod(i + 1, m)]
    j = mod(j - po[i], n) + po[i]
    ctr[i] = { x: 0, y: 0 }; dir[i] = { x: 0, y: 0 }
    pointSlope(p, po[i], j, ctr[i], dir[i])
  }
  for (let i = 0; i < m; i++) {
    const d = dir[i].x ** 2 + dir[i].y ** 2
    const Qi = new Array<number>(9).fill(0)
    if (d) {
      const v = [dir[i].y, -dir[i].x, 0]
      v[2] = -v[1] * ctr[i].y - v[0] * ctr[i].x
      for (let l = 0; l < 3; l++) for (let k = 0; k < 3; k++) Qi[l * 3 + k] = (v[l] * v[k]) / d
    }
    q[i] = Qi
  }
  for (let i = 0; i < m; i++) {
    const s: Pt = { x: pt[po[i]].x - x0, y: pt[po[i]].y - y0 }
    const j = mod(i - 1, m)
    const Q = q[j].map((v, k) => v + q[i][k])
    const w: Pt = { x: 0, y: 0 }
    for (;;) {
      const det = Q[0] * Q[4] - Q[1] * Q[3]
      if (det) {
        w.x = (-Q[2] * Q[4] + Q[5] * Q[1]) / det
        w.y = (Q[2] * Q[3] - Q[5] * Q[0]) / det
        break
      }
      const v = [0, 0, 0]
      if (Q[0] > Q[4]) { v[0] = -Q[1]; v[1] = Q[0] }
      else if (Q[4]) { v[0] = -Q[4]; v[1] = Q[3] }
      else { v[0] = 1; v[1] = 0 }
      const d = v[0] * v[0] + v[1] * v[1]
      v[2] = -v[1] * s.y - v[0] * s.x
      for (let l = 0; l < 3; l++) for (let k = 0; k < 3; k++) Q[l * 3 + k] += (v[l] * v[k]) / d
    }
    if (Math.abs(w.x - s.x) <= 0.5 && Math.abs(w.y - s.y) <= 0.5) { p.curve.vertex[i] = { x: w.x + x0, y: w.y + y0 }; continue }
    let min = quadForm(Q, s), xmin = s.x, ymin = s.y
    if (Q[0]) for (let z = 0; z < 2; z++) {
      w.y = s.y - 0.5 + z
      w.x = -(Q[1] * w.y + Q[2]) / Q[0]
      const cand = quadForm(Q, w)
      if (Math.abs(w.x - s.x) <= 0.5 && cand < min) { min = cand; xmin = w.x; ymin = w.y }
    }
    if (Q[4]) for (let z = 0; z < 2; z++) {
      w.x = s.x - 0.5 + z
      w.y = -(Q[3] * w.x + Q[5]) / Q[4]
      const cand = quadForm(Q, w)
      if (Math.abs(w.y - s.y) <= 0.5 && cand < min) { min = cand; xmin = w.x; ymin = w.y }
    }
    for (let l = 0; l < 2; l++) for (let k = 0; k < 2; k++) {
      w.x = s.x - 0.5 + l; w.y = s.y - 0.5 + k
      const cand = quadForm(Q, w)
      if (cand < min) { min = cand; xmin = w.x; ymin = w.y }
    }
    p.curve.vertex[i] = { x: xmin + x0, y: ymin + y0 }
  }
}

/** Corner detection and Bézier smoothing controlled by alphaMax (§2.3.2). */
function smoothCurve(p: Path, alphaMax: number) {
  const cv = p.curve, m = cv.n
  for (let i = 0; i < m; i++) {
    const j = mod(i + 1, m), k = mod(i + 2, m)
    const p4 = interval(0.5, cv.vertex[k], cv.vertex[j])
    const denom = ddenom(cv.vertex[i], cv.vertex[k])
    let alpha: number
    if (denom !== 0) {
      const dd = Math.abs(dpara(cv.vertex[i], cv.vertex[j], cv.vertex[k]) / denom)
      alpha = (dd > 1 ? 1 - 1 / dd : 0) / 0.75
    } else alpha = 4 / 3
    cv.alpha0[j] = alpha
    if (alpha >= alphaMax) {
      cv.tag[j] = 'CORNER'
      cv.c[3 * j + 1] = cv.vertex[j]
      cv.c[3 * j + 2] = p4
    } else {
      alpha = Math.max(0.55, Math.min(1, alpha))
      cv.tag[j] = 'CURVE'
      cv.c[3 * j] = interval(0.5 + 0.5 * alpha, cv.vertex[i], cv.vertex[j])
      cv.c[3 * j + 1] = interval(0.5 + 0.5 * alpha, cv.vertex[k], cv.vertex[j])
      cv.c[3 * j + 2] = p4
    }
    cv.alpha[j] = alpha
    cv.beta[j] = 0.5
  }
}

interface Opti { pen: number; c: [Pt, Pt]; t: number; s: number; alpha: number }

function optiPenalty(p: Path, i: number, j: number, res: Opti, tol: number, convc: number[], areac: number[]): boolean {
  const cv = p.curve, m = cv.n, V = cv.vertex
  if (i === j) return true
  const i1 = mod(i + 1, m)
  let k1 = mod(i + 1, m)
  const conv = convc[k1]
  if (conv === 0) return true
  const d = ddist(V[i], V[i1])
  for (let k = k1; k !== j; k = k1) {
    k1 = mod(k + 1, m)
    const k2 = mod(k + 2, m)
    if (convc[k1] !== conv) return true
    if (sign(cprod(V[i], V[i1], V[k1], V[k2])) !== conv) return true
    if (iprod1(V[i], V[i1], V[k1], V[k2]) < d * ddist(V[k1], V[k2]) * -0.999847695156) return true
  }
  const p0 = cv.c[mod(i, m) * 3 + 2], p1 = V[mod(i + 1, m)], p2 = V[mod(j, m)], p3 = cv.c[mod(j, m) * 3 + 2]
  let area = areac[j] - areac[i]
  area -= dpara(V[0], cv.c[i * 3 + 2], cv.c[j * 3 + 2]) / 2
  if (i >= j) area += areac[m]
  const A1 = dpara(p0, p1, p2), A2 = dpara(p0, p1, p3), A3 = dpara(p0, p2, p3)
  const A4 = A1 + A3 - A2
  if (A2 === A1) return true
  let t = A3 / (A3 - A4)
  const s = A2 / (A2 - A1)
  const A = (A2 * t) / 2
  if (A === 0) return true
  const R = area / A
  const alpha = 2 - Math.sqrt(4 - R / 0.3)
  res.c = [interval(t * alpha, p0, p1), interval(s * alpha, p3, p2)]
  res.alpha = alpha; res.t = t; res.s = s
  const q1 = res.c[0], q2 = res.c[1]
  res.pen = 0
  for (let k = mod(i + 1, m); k !== j; k = k1) {
    k1 = mod(k + 1, m)
    t = tangent(p0, q1, q2, p3, V[k], V[k1])
    if (t < -0.5) return true
    const pt = bezierPt(t, p0, q1, q2, p3)
    const dd = ddist(V[k], V[k1])
    if (dd === 0) return true
    const d1 = dpara(V[k], V[k1], pt) / dd
    if (Math.abs(d1) > tol) return true
    if (iprod(V[k], V[k1], pt) < 0 || iprod(V[k1], V[k], pt) < 0) return true
    res.pen += d1 * d1
  }
  for (let k = i; k !== j; k = k1) {
    k1 = mod(k + 1, m)
    t = tangent(p0, q1, q2, p3, cv.c[k * 3 + 2], cv.c[k1 * 3 + 2])
    if (t < -0.5) return true
    const pt = bezierPt(t, p0, q1, q2, p3)
    const dd = ddist(cv.c[k * 3 + 2], cv.c[k1 * 3 + 2])
    if (dd === 0) return true
    let d1 = dpara(cv.c[k * 3 + 2], cv.c[k1 * 3 + 2], pt) / dd
    let d2 = (dpara(cv.c[k * 3 + 2], cv.c[k1 * 3 + 2], V[k1]) / dd) * 0.75 * cv.alpha[k1]
    if (d2 < 0) { d1 = -d1; d2 = -d2 }
    if (d1 < d2 - tol) return true
    if (d1 < d2) res.pen += (d1 - d2) ** 2
  }
  return false
}

/** Joins runs of Bézier segments into fewer curves within `tol` (§2.4). */
function optiCurve(p: Path, tol: number) {
  const cv = p.curve, m = cv.n, V = cv.vertex
  const pt = new Array<number>(m + 1), pen = new Array<number>(m + 1), len = new Array<number>(m + 1), opt = new Array<Opti>(m + 1)
  const convc = new Array<number>(m), areac = new Array<number>(m + 1)
  for (let i = 0; i < m; i++) convc[i] = cv.tag[i] === 'CURVE' ? sign(dpara(V[mod(i - 1, m)], V[i], V[mod(i + 1, m)])) : 0
  let area = 0
  areac[0] = 0
  const p0 = V[0]
  for (let i = 0; i < m; i++) {
    const i1 = mod(i + 1, m)
    if (cv.tag[i1] === 'CURVE') {
      const al = cv.alpha[i1]
      area += (0.3 * al * (4 - al) * dpara(cv.c[i * 3 + 2], V[i1], cv.c[i1 * 3 + 2])) / 2
      area += dpara(p0, cv.c[i * 3 + 2], cv.c[i1 * 3 + 2]) / 2
    }
    areac[i + 1] = area
  }
  pt[0] = -1; pen[0] = 0; len[0] = 0
  let o: Opti = { pen: 0, c: [{ x: 0, y: 0 }, { x: 0, y: 0 }], t: 0, s: 0, alpha: 0 }
  for (let j = 1; j <= m; j++) {
    pt[j] = j - 1; pen[j] = pen[j - 1]; len[j] = len[j - 1] + 1
    for (let i = j - 2; i >= 0; i--) {
      if (optiPenalty(p, i, mod(j, m), o, tol, convc, areac)) break
      if (len[j] > len[i] + 1 || (len[j] === len[i] + 1 && pen[j] > pen[i] + o.pen)) {
        pt[j] = i; pen[j] = pen[i] + o.pen; len[j] = len[i] + 1; opt[j] = o
        o = { pen: 0, c: [{ x: 0, y: 0 }, { x: 0, y: 0 }], t: 0, s: 0, alpha: 0 }
      }
    }
  }
  const om = len[m]
  const oc = newCurve(om)
  const s = new Array<number>(om), t = new Array<number>(om)
  let j = m
  for (let i = om - 1; i >= 0; i--) {
    const jm = mod(j, m)
    if (pt[j] === j - 1) {
      oc.tag[i] = cv.tag[jm]
      oc.c[i * 3] = cv.c[jm * 3]; oc.c[i * 3 + 1] = cv.c[jm * 3 + 1]; oc.c[i * 3 + 2] = cv.c[jm * 3 + 2]
      oc.vertex[i] = V[jm]; oc.alpha[i] = cv.alpha[jm]; oc.alpha0[i] = cv.alpha0[jm]; oc.beta[i] = cv.beta[jm]
      s[i] = t[i] = 1
    } else {
      oc.tag[i] = 'CURVE'
      oc.c[i * 3] = opt[j].c[0]; oc.c[i * 3 + 1] = opt[j].c[1]; oc.c[i * 3 + 2] = cv.c[jm * 3 + 2]
      oc.vertex[i] = interval(opt[j].s, cv.c[jm * 3 + 2], V[jm])
      oc.alpha[i] = oc.alpha0[i] = opt[j].alpha
      s[i] = opt[j].s; t[i] = opt[j].t
    }
    j = pt[j]
  }
  for (let i = 0; i < om; i++) oc.beta[i] = s[i] / (s[i] + t[mod(i + 1, om)])
  p.curve = oc
}

const f2 = (v: number) => String(Math.round(v * 100) / 100)

function curveToD(cv: Curve): { d: string; curves: number; lines: number } {
  const n = cv.n
  let curves = 0, lines = 0
  let d = `M${f2(cv.c[(n - 1) * 3 + 2].x)} ${f2(cv.c[(n - 1) * 3 + 2].y)}`
  for (let i = 0; i < n; i++) {
    const c = cv.c
    if (cv.tag[i] === 'CURVE') { d += `C${f2(c[i * 3].x)} ${f2(c[i * 3].y)} ${f2(c[i * 3 + 1].x)} ${f2(c[i * 3 + 1].y)} ${f2(c[i * 3 + 2].x)} ${f2(c[i * 3 + 2].y)}`; curves++ }
    else { d += `L${f2(c[i * 3 + 1].x)} ${f2(c[i * 3 + 1].y)}L${f2(c[i * 3 + 2].x)} ${f2(c[i * 3 + 2].y)}`; lines += 2 }
  }
  return { d: d + 'Z', curves, lines }
}

export interface OutlineResult { d: string; paths: number; curves: number; lines: number; corners: number }

export function traceOutline(bm: Uint8Array, w: number, h: number, o: TraceOptions): OutlineResult {
  const paths = decompose(bm, w, h, o)
  let d = '', curves = 0, lines = 0, corners = 0
  for (const p of paths) {
    calcSums(p)
    calcLon(p)
    bestPolygon(p)
    adjustVertices(p)
    smoothCurve(p, o.alphaMax)
    if (o.optCurve) optiCurve(p, o.optTolerance)
    corners += p.curve.tag.filter((t) => t === 'CORNER').length
    const r = curveToD(p.curve)
    d += r.d
    curves += r.curves
    lines += r.lines
  }
  return { d, paths: paths.length, curves, lines, corners }
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

export interface Options extends BinOptions, TraceOptions, CenterOptions { mode2: 'outline' | 'centerline'; speckle: number }
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
