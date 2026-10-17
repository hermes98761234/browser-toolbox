// Raster → SVG tracing, written from scratch: k-means colour quantization, marching-squares contours,
// Ramer–Douglas–Peucker simplification and Schneider-style least-squares cubic Bézier fitting.

export type P = [number, number]
export type RGB = [number, number, number]

export interface Options {
  colors: number
  /** Bézier fit tolerance in px */
  error: number
  /** RDP tolerance in px for polygon mode */
  simplify: number
  /** corner angle in degrees: sharper turns break the curve */
  corner: number
  /** drop specks smaller than this area (px²) */
  minArea: number
  mode: 'curves' | 'polygons'
  /** paint lower layers under upper ones so no hairline gaps appear */
  stacked: boolean
  /** alpha below this is transparent */
  alpha: number
}

export const DEFAULTS: Options = { colors: 6, error: 1.0, simplify: 0.8, corner: 40, minArea: 20, mode: 'curves', stacked: true, alpha: 128 }

// ---------- colour quantization ----------

/** Deterministic k-means++ in RGB on (sampled) opaque pixels. */
export function kmeans(px: Uint8ClampedArray, k: number, alphaMin = 128, iters = 12, seed = 7): RGB[] {
  let s = seed >>> 0
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const total = px.length / 4
  const step = Math.max(1, Math.floor(total / 40000))
  const pts: number[] = []
  for (let i = 0; i < total; i += step) if (px[i * 4 + 3] >= alphaMin) pts.push(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])
  const n = pts.length / 3
  if (!n) return [[255, 255, 255]]
  const d2 = (i: number, c: RGB) => (pts[i * 3] - c[0]) ** 2 + (pts[i * 3 + 1] - c[1]) ** 2 + (pts[i * 3 + 2] - c[2]) ** 2
  const cents: RGB[] = []
  const first = Math.floor(rnd() * n)
  cents.push([pts[first * 3], pts[first * 3 + 1], pts[first * 3 + 2]])
  const best = new Float64Array(n).fill(Infinity)
  while (cents.length < k) {
    let sum = 0
    for (let i = 0; i < n; i++) {
      best[i] = Math.min(best[i], d2(i, cents[cents.length - 1]))
      sum += best[i]
    }
    if (sum === 0) break
    let r = rnd() * sum
    let pick = n - 1
    for (let i = 0; i < n; i++) {
      r -= best[i]
      if (r <= 0) { pick = i; break }
    }
    cents.push([pts[pick * 3], pts[pick * 3 + 1], pts[pick * 3 + 2]])
  }
  const assign = new Int32Array(n)
  for (let it = 0; it < iters; it++) {
    const acc = cents.map(() => [0, 0, 0, 0])
    for (let i = 0; i < n; i++) {
      let bi = 0, bd = Infinity
      for (let c = 0; c < cents.length; c++) {
        const d = d2(i, cents[c])
        if (d < bd) { bd = d; bi = c }
      }
      assign[i] = bi
      const a = acc[bi]
      a[0] += pts[i * 3]; a[1] += pts[i * 3 + 1]; a[2] += pts[i * 3 + 2]; a[3]++
    }
    let moved = 0
    cents.forEach((c, j) => {
      const a = acc[j]
      if (!a[3]) return
      const nc: RGB = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]
      moved += Math.abs(nc[0] - c[0]) + Math.abs(nc[1] - c[1]) + Math.abs(nc[2] - c[2])
      cents[j] = nc
    })
    if (moved < 0.5) break
  }
  return cents.map((c) => c.map(Math.round) as RGB)
}

/** Index of the nearest palette colour for each pixel (−1 = transparent). */
export function quantize(px: Uint8ClampedArray, pal: RGB[], alphaMin = 128): Int16Array {
  const n = px.length / 4
  const out = new Int16Array(n)
  for (let i = 0; i < n; i++) {
    if (px[i * 4 + 3] < alphaMin) { out[i] = -1; continue }
    let bi = 0, bd = Infinity
    for (let c = 0; c < pal.length; c++) {
      const d = (px[i * 4] - pal[c][0]) ** 2 + (px[i * 4 + 1] - pal[c][1]) ** 2 + (px[i * 4 + 2] - pal[c][2]) ** 2
      if (d < bd) { bd = d; bi = c }
    }
    out[i] = bi
  }
  return out
}

/** Majority filter (3×3) that removes isolated anti-aliasing pixels. */
export function despeckle(idx: Int16Array, w: number, h: number): Int16Array {
  const out = idx.slice()
  const cnt = new Map<number, number>()
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const c = idx[y * w + x]
      let same = 0
      cnt.clear()
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const v = idx[(y + dy) * w + x + dx]
        if (v === c) same++
        cnt.set(v, (cnt.get(v) ?? 0) + 1)
      }
      if (same <= 1) {
        let bv = c, bn = 0
        for (const [v, k] of cnt) if (k > bn) { bn = k; bv = v }
        out[y * w + x] = bv
      }
    }
  }
  return out
}

/** Re-labels connected regions smaller than `minArea` pixels with their most common neighbouring colour. */
export function mergeSmall(idx: Int16Array, w: number, h: number, minArea: number): Int16Array {
  if (minArea <= 1) return idx
  const out = idx.slice()
  const lab = new Int32Array(w * h).fill(-1)
  const stack: number[] = []
  const comp: number[] = []
  let n = 0
  for (let s0 = 0; s0 < w * h; s0++) {
    if (lab[s0] >= 0) continue
    const c = out[s0]
    comp.length = 0
    stack.push(s0)
    lab[s0] = n
    while (stack.length) {
      const i = stack.pop()!
      comp.push(i)
      const x = i % w, y = (i - x) / w
      if (x > 0 && lab[i - 1] < 0 && out[i - 1] === c) { lab[i - 1] = n; stack.push(i - 1) }
      if (x < w - 1 && lab[i + 1] < 0 && out[i + 1] === c) { lab[i + 1] = n; stack.push(i + 1) }
      if (y > 0 && lab[i - w] < 0 && out[i - w] === c) { lab[i - w] = n; stack.push(i - w) }
      if (y < h - 1 && lab[i + w] < 0 && out[i + w] === c) { lab[i + w] = n; stack.push(i + w) }
    }
    // also merge 1-pixel-thin slivers (anti-aliasing fringes): no pixel has all 4 neighbours in the region
    let thin = comp.length < minArea * 40
    if (thin && comp.length >= minArea) {
      for (const i of comp) {
        const x = i % w
        if (x > 0 && x < w - 1 && i >= w && i < w * (h - 1) && lab[i - 1] === n && lab[i + 1] === n && lab[i - w] === n && lab[i + w] === n) { thin = false; break }
      }
    }
    if (comp.length < minArea || thin) {
      const votes = new Map<number, number>()
      for (const i of comp) {
        const x = i % w
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
          if (j < 0 || j >= w * h || out[j] === c) continue
          votes.set(out[j], (votes.get(out[j]) ?? 0) + 1)
        }
      }
      let best = c, bv = 0
      for (const [v, k] of votes) if (k > bv) { bv = k; best = v }
      for (const i of comp) out[i] = best
    }
    n++
  }
  return out
}

// ---------- marching squares ----------

/**
 * Closed contours of a binary mask (1 = inside), in pixel coordinates. Contours run along pixel edges with
 * 45° cuts at corners; outer boundaries and holes have opposite orientation (use the even-odd fill rule).
 */
export function contours(mask: Uint8Array, w: number, h: number): P[][] {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0)
  const next = new Map<number, number>()
  const W2 = 2 * w + 4
  const key = (x2: number, y2: number) => (y2 + 2) * W2 + (x2 + 2)
  // doubled coordinates of edge midpoints between corner (pixel-centre) grid points
  const seg = (ax: number, ay: number, bx: number, by: number) => next.set(key(ax, ay), key(bx, by))
  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      const tl = at(x, y), tr = at(x + 1, y), br = at(x + 1, y + 1), bl = at(x, y + 1)
      const c = (tl << 3) | (tr << 2) | (br << 1) | bl
      if (c === 0 || c === 15) continue
      const X = 2 * x, Y = 2 * y
      const T: P = [X + 1, Y], R: P = [X + 2, Y + 1], B: P = [X + 1, Y + 2], L: P = [X, Y + 1]
      // inside on the right-hand side of each directed segment (screen coords, y down)
      const pairs: Record<number, [P, P][]> = {
        1: [[L, B]], 2: [[B, R]], 3: [[L, R]], 4: [[R, T]], 5: [[L, T], [R, B]], 6: [[B, T]], 7: [[L, T]],
        8: [[T, L]], 9: [[T, B]], 10: [[T, R], [B, L]], 11: [[T, R]], 12: [[R, L]], 13: [[R, B]], 14: [[B, L]],
      }
      for (const [a, b] of pairs[c]) seg(a[0], a[1], b[0], b[1])
    }
  }
  const loops: P[][] = []
  const seen = new Set<number>()
  for (const start of next.keys()) {
    if (seen.has(start)) continue
    const loop: P[] = []
    let k = start
    while (!seen.has(k)) {
      seen.add(k)
      const x2 = (k % W2) - 2, y2 = Math.floor(k / W2) - 2
      // doubled corner-grid coords → pixel coords (corner grid point (x,y) is the centre of pixel x,y)
      loop.push([x2 / 2 + 0.5, y2 / 2 + 0.5])
      const n = next.get(k)
      if (n === undefined) break
      k = n
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

export function signedArea(p: P[]): number {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

// ---------- simplification ----------

function rdpOpen(p: P[], eps: number): P[] {
  if (p.length < 3) return p
  const [a, b] = [p[0], p[p.length - 1]]
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  let bi = 0, bd = -1
  for (let i = 1; i < p.length - 1; i++) {
    const d = len ? Math.abs(dy * p[i][0] - dx * p[i][1] + b[0] * a[1] - b[1] * a[0]) / len : Math.hypot(p[i][0] - a[0], p[i][1] - a[1])
    if (d > bd) { bd = d; bi = i }
  }
  if (bd <= eps) return [a, b]
  const l = rdpOpen(p.slice(0, bi + 1), eps)
  return [...l.slice(0, -1), ...rdpOpen(p.slice(bi), eps)]
}

/** Ramer–Douglas–Peucker for a closed ring. */
export function rdpClosed(p: P[], eps: number): P[] {
  if (p.length < 4) return p
  let far = 0, fd = -1
  for (let i = 1; i < p.length; i++) {
    const d = (p[i][0] - p[0][0]) ** 2 + (p[i][1] - p[0][1]) ** 2
    if (d > fd) { fd = d; far = i }
  }
  const a = rdpOpen(p.slice(0, far + 1), eps)
  const b = rdpOpen([...p.slice(far), p[0]], eps)
  return [...a.slice(0, -1), ...b.slice(0, -1)]
}

// ---------- Bézier fitting ----------

export type Bez = [P, P, P, P]
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]]
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]]
const mulS = (a: P, s: number): P => [a[0] * s, a[1] * s]
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1]
const nrm = (a: P): P => {
  const l = Math.hypot(a[0], a[1])
  return l ? [a[0] / l, a[1] / l] : [0, 0]
}
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1])

export function bezAt(b: Bez, t: number): P {
  const s = 1 - t
  const k = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t]
  return [k[0] * b[0][0] + k[1] * b[1][0] + k[2] * b[2][0] + k[3] * b[3][0], k[0] * b[0][1] + k[1] * b[1][1] + k[2] * b[2][1] + k[3] * b[3][1]]
}

function chordParams(p: P[]): number[] {
  const u = [0]
  for (let i = 1; i < p.length; i++) u.push(u[i - 1] + dist(p[i], p[i - 1]))
  const L = u[u.length - 1] || 1
  return u.map((x) => x / L)
}

function generate(p: P[], u: number[], t1: P, t2: P): Bez {
  const first = p[0], last = p[p.length - 1]
  const C = [[0, 0], [0, 0]], X = [0, 0]
  for (let i = 0; i < p.length; i++) {
    const t = u[i], s = 1 - t
    const b0 = s * s * s, b1 = 3 * s * s * t, b2 = 3 * s * t * t, b3 = t * t * t
    const A1 = mulS(t1, b1), A2 = mulS(t2, b2)
    C[0][0] += dot(A1, A1); C[0][1] += dot(A1, A2); C[1][1] += dot(A2, A2)
    const tmp = sub(p[i], add(mulS(first, b0 + b1), mulS(last, b2 + b3)))
    X[0] += dot(A1, tmp); X[1] += dot(A2, tmp)
  }
  C[1][0] = C[0][1]
  const det = C[0][0] * C[1][1] - C[1][0] * C[0][1]
  let al = det ? (X[0] * C[1][1] - X[1] * C[0][1]) / det : 0
  let ar = det ? (C[0][0] * X[1] - C[1][0] * X[0]) / det : 0
  const seg = dist(first, last)
  const eps = 1e-6 * seg
  if (al < eps || ar < eps || al > seg * 3 || ar > seg * 3) al = ar = seg / 3
  return [first, add(first, mulS(t1, al)), add(last, mulS(t2, ar)), last]
}

function maxError(p: P[], b: Bez, u: number[]): [number, number] {
  let md = 0, mi = Math.floor(p.length / 2)
  for (let i = 1; i < p.length - 1; i++) {
    const d = dist(bezAt(b, u[i]), p[i]) ** 2
    if (d > md) { md = d; mi = i }
  }
  return [md, mi]
}

function newton(b: Bez, pt: P, t: number): number {
  const d1: P[] = [0, 1, 2].map((i) => mulS(sub(b[i + 1], b[i]), 3))
  const d2: P[] = [0, 1].map((i) => mulS(sub(d1[i + 1], d1[i]), 2))
  const s = 1 - t
  const q = bezAt(b, t)
  const q1: P = add(add(mulS(d1[0], s * s), mulS(d1[1], 2 * s * t)), mulS(d1[2], t * t))
  const q2: P = add(mulS(d2[0], s), mulS(d2[1], t))
  const num = dot(sub(q, pt), q1)
  const den = dot(q1, q1) + dot(sub(q, pt), q2)
  return den ? Math.min(1, Math.max(0, t - num / den)) : t
}

function fitCubic(p: P[], t1: P, t2: P, err: number, out: Bez[], depth = 0) {
  if (p.length === 2) {
    const d = dist(p[0], p[1]) / 3
    out.push([p[0], add(p[0], mulS(t1, d)), add(p[1], mulS(t2, d)), p[1]])
    return
  }
  let u = chordParams(p)
  let b = generate(p, u, t1, t2)
  let [e, split] = maxError(p, b, u)
  const e2 = err * err
  if (e < e2) { out.push(b); return }
  if (e < e2 * 4) {
    for (let k = 0; k < 4; k++) {
      u = u.map((t, i) => newton(b, p[i], t))
      b = generate(p, u, t1, t2)
      ;[e, split] = maxError(p, b, u)
      if (e < e2) { out.push(b); return }
    }
  }
  if (depth > 30) { out.push(b); return }
  split = Math.max(1, Math.min(p.length - 2, split))
  let tc = nrm(sub(p[split - 1], p[split + 1]))
  if (!tc[0] && !tc[1]) tc = nrm(sub(p[split - 1], p[split]))
  fitCubic(p.slice(0, split + 1), t1, tc, err, out, depth + 1)
  fitCubic(p.slice(split), mulS(tc, -1), t2, err, out, depth + 1)
}

/** Fit an open polyline with cubic Béziers (end tangents estimated from neighbours). */
export function fitCurve(p: P[], err: number): Bez[] {
  const q = p.filter((pt, i) => i === 0 || dist(pt, p[i - 1]) > 1e-9)
  if (q.length < 2) return []
  // one-sided second-order tangent estimate (−3p0 + 4pk − p2k), falling back to a chord
  const tan = (a: P, b: P, c: P | undefined): P => nrm(c ? sub(sub(mulS(b, 4), mulS(a, 3)), c) : sub(b, a))
  const k = Math.max(1, Math.min(2, Math.floor((q.length - 1) / 2)))
  const n = q.length - 1
  const t1 = tan(q[0], q[k], 2 * k <= n ? q[2 * k] : undefined)
  const t2 = tan(q[n], q[n - k], n - 2 * k >= 0 ? q[n - 2 * k] : undefined)
  const out: Bez[] = []
  fitCubic(q, t1, t2, err, out)
  return out
}

/** Indices where the ring turns sharper than `deg` (measured over ±k neighbours). */
export function corners(p: P[], deg: number, k = 2): number[] {
  const n = p.length
  const out: number[] = []
  const lim = Math.cos((deg * Math.PI) / 180)
  for (let i = 0; i < n; i++) {
    const a = nrm(sub(p[i], p[(i - k + n) % n])), b = nrm(sub(p[(i + k) % n], p[i]))
    const c = dot(a, b)
    if (c < lim) {
      const prev = out[out.length - 1]
      // keep the sharpest point of a run of corner candidates
      if (prev !== undefined && i - prev <= k) {
        const ap = nrm(sub(p[prev], p[(prev - k + n) % n])), bp = nrm(sub(p[(prev + k) % n], p[prev]))
        if (c < dot(ap, bp)) out[out.length - 1] = i
      } else out.push(i)
    }
  }
  if (out.length > 1 && out[0] + n - out[out.length - 1] <= k) out.pop()
  return out
}

/** Light 1-2-1 smoothing that keeps corner points fixed. */
export function smooth(p: P[], fixed: Set<number>): P[] {
  const n = p.length
  return p.map((pt, i) => (fixed.has(i) ? pt : [(p[(i - 1 + n) % n][0] + 2 * pt[0] + p[(i + 1) % n][0]) / 4, (p[(i - 1 + n) % n][1] + 2 * pt[1] + p[(i + 1) % n][1]) / 4] as P))
}

const r2 = (v: number) => Math.round(v * 100) / 100

/** SVG path data for a closed ring, as cubic Bézier curves split at corners. */
export function ringToCurves(ring: P[], o: Pick<Options, 'error' | 'corner'>): { d: string; segs: number } {
  // find corners on a lightly pre-smoothed copy (pixel stair-steps are not corners), then smooth the rest
  let pre = ring
  for (let k = 0; k < 2; k++) pre = smooth(pre, new Set())
  const cs = ring.length > 12 ? corners(pre, o.corner, 3) : []
  const fixed = new Set(cs)
  let sm = ring
  for (let k = 0; k < 3; k++) sm = smooth(sm, fixed)
  const n = sm.length
  const breaks = cs.length ? cs : [0]
  let d = ''
  let segs = 0
  for (let j = 0; j < breaks.length; j++) {
    const a = breaks[j], b = breaks[(j + 1) % breaks.length]
    const run: P[] = []
    let i = a
    do {
      run.push(sm[i])
      i = (i + 1) % n
    } while (i !== b)
    run.push(sm[b])
    const bz = fitCurve(run, o.error)
    if (!d && bz.length) d = `M${r2(bz[0][0][0])} ${r2(bz[0][0][1])}`
    for (const c of bz) d += `C${r2(c[1][0])} ${r2(c[1][1])} ${r2(c[2][0])} ${r2(c[2][1])} ${r2(c[3][0])} ${r2(c[3][1])}`
    segs += bz.length
  }
  return { d: d + 'Z', segs }
}

export function ringToPolygon(ring: P[], eps: number): { d: string; segs: number } {
  const s = rdpClosed(ring, eps)
  return { d: 'M' + s.map(([x, y]) => `${r2(x)} ${r2(y)}`).join('L') + 'Z', segs: s.length }
}

export const hex = (c: RGB) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

export interface Layer { color: string; d: string; area: number; paths: number; segs: number }
export interface Result { w: number; h: number; layers: Layer[]; palette: string[]; svg: string; nodes: number }

/** Full pipeline on RGBA pixels. */
export function trace(px: Uint8ClampedArray, w: number, h: number, o: Options, onProgress?: (f: number) => void): Result {
  const pal = kmeans(px, Math.max(2, Math.min(32, o.colors)), o.alpha)
  let idx = quantize(px, pal, o.alpha)
  if (w > 4 && h > 4) idx = despeckle(idx, w, h)
  idx = mergeSmall(idx, w, h, o.minArea)
  const counts = pal.map(() => 0)
  for (const v of idx) if (v >= 0) counts[v]++
  const order = pal.map((_, i) => i).filter((i) => counts[i] > 0).sort((a, b) => counts[b] - counts[a])
  const rank = new Int16Array(pal.length).fill(-1)
  order.forEach((c, r) => (rank[c] = r))
  const layers: Layer[] = []
  const mask = new Uint8Array(w * h)
  order.forEach((c, r) => {
    for (let i = 0; i < idx.length; i++) mask[i] = idx[i] >= 0 && (o.stacked ? rank[idx[i]] >= r : idx[i] === c) ? 1 : 0
    const rings = contours(mask, w, h).filter((ring) => Math.abs(signedArea(ring)) >= o.minArea)
    let d = '', segs = 0
    for (const ring of rings) {
      const res = o.mode === 'curves' ? ringToCurves(ring, o) : ringToPolygon(ring, o.simplify)
      d += res.d
      segs += res.segs
    }
    if (d) layers.push({ color: hex(pal[c]), d, area: counts[c], paths: rings.length, segs })
    onProgress?.((r + 1) / order.length)
  })
  const svg = toSvg(w, h, layers)
  return { w, h, layers, palette: order.map((c) => hex(pal[c])), svg, nodes: layers.reduce((a, l) => a + l.segs, 0) }
}

export function toSvg(w: number, h: number, layers: Layer[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n${layers.map((l) => `<path fill="${l.color}" fill-rule="evenodd" d="${l.d}"/>`).join('\n')}\n</svg>\n`
}
