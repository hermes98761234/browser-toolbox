// Global motion estimation (block matching + robust similarity fit), trajectory smoothing and crop.
// Frames are small grayscale Float32Arrays (row-major, w×h).

export interface Motion {
  dx: number
  dy: number
  /** rotation in radians */
  da: number
  /** fraction of blocks that agreed with the fit */
  conf: number
}

export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2]
  return g
}

/** 2× box downsample. */
export function half(g: Float32Array, w: number, h: number): [Float32Array, number, number] {
  const W = w >> 1, H = h >> 1
  const o = new Float32Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = 2 * y * w + 2 * x
      o[y * W + x] = (g[i] + g[i + 1] + g[i + w] + g[i + w + 1]) / 4
    }
  return [o, W, H]
}

/** Mean absolute difference of a bx×by block at (x,y) in a vs (x+dx,y+dy) in b. */
function sad(a: Float32Array, b: Float32Array, w: number, x: number, y: number, bw: number, bh: number, dx: number, dy: number, step = 1): number {
  let s = 0, n = 0
  for (let j = 0; j < bh; j += step) {
    const ra = (y + j) * w + x, rb = (y + j + dy) * w + x + dx
    for (let i = 0; i < bw; i += step) {
      s += Math.abs(a[ra + i] - b[rb + i])
      n++
    }
  }
  return s / n
}

/** Parabolic sub-pixel offset from three costs around a minimum. */
const parab = (l: number, c: number, r: number) => {
  const d = l - 2 * c + r
  return d > 1e-9 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / d)) : 0
}

/** Global translation of `cur` relative to `prev` by exhaustive SAD over the central region. */
export function globalShift(prev: Float32Array, cur: Float32Array, w: number, h: number, r: number): [number, number] {
  const m = r + 1
  let best = Infinity, bx = 0, by = 0
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const c = sad(prev, cur, w, m, m, w - 2 * m, h - 2 * m, dx, dy, 2)
      if (c < best) [best, bx, by] = [c, dx, dy]
    }
  return [bx, by]
}

interface Vec {
  x: number
  y: number
  u: number
  v: number
  w: number
}

/** Weighted least squares fit of x' = a x − b y + tx, y' = b x + a y + ty on displacement vectors. */
export function fitSimilarity(vs: Vec[]): { a: number; b: number; tx: number; ty: number } {
  let W = 0, sx = 0, sy = 0, su = 0, sv = 0
  for (const p of vs) {
    W += p.w
    sx += p.w * p.x
    sy += p.w * p.y
    su += p.w * (p.x + p.u)
    sv += p.w * (p.y + p.v)
  }
  if (W <= 0) return { a: 1, b: 0, tx: 0, ty: 0 }
  const mx = sx / W, my = sy / W, mu = su / W, mv = sv / W
  let num1 = 0, num2 = 0, den = 0
  for (const p of vs) {
    const x = p.x - mx, y = p.y - my, X = p.x + p.u - mu, Y = p.y + p.v - mv
    num1 += p.w * (x * X + y * Y)
    num2 += p.w * (x * Y - y * X)
    den += p.w * (x * x + y * y)
  }
  const a = den > 1e-9 ? num1 / den : 1
  const b = den > 1e-9 ? num2 / den : 0
  return { a, b, tx: mu - (a * mx - b * my), ty: mv - (b * mx + a * my) }
}

/**
 * Estimates camera motion between two frames (content displacement prev→cur), in pixels of the
 * given frame size, with rotation about the frame centre.
 */
export function estimateMotion(prev: Float32Array, cur: Float32Array, w: number, h: number, opts: { rotation?: boolean } = {}): Motion {
  // Coarse: global translation at half resolution.
  const [p2, w2, h2] = half(prev, w, h)
  const [c2] = half(cur, w, h)
  const [gx, gy] = globalShift(p2, c2, w2, h2, Math.max(4, Math.round(w2 / 10)))
  const ox = 2 * gx, oy = 2 * gy
  // Fine: per-block search around the coarse guess.
  const B = Math.max(8, Math.round(w / 12)), R = 3
  const cols = 8, rows = 5
  const vecs: Vec[] = []
  const marginX = Math.abs(ox) + R + 2, marginY = Math.abs(oy) + R + 2
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = Math.round(marginX + ((w - 2 * marginX - B) * c) / (cols - 1))
      const y = Math.round(marginY + ((h - 2 * marginY - B) * r) / (rows - 1))
      if (x < 0 || y < 0 || x + B > w || y + B > h) continue
      // Texture check: skip flat blocks (sky, walls) that match anywhere.
      let mean = 0
      for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) mean += prev[(y + j) * w + x + i]
      mean /= B * B
      let vari = 0
      for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) vari += (prev[(y + j) * w + x + i] - mean) ** 2
      vari /= B * B
      if (vari < 25) continue
      const cost = (dx: number, dy: number) => {
        const X = x + dx, Y = y + dy
        if (X < 0 || Y < 0 || X + B > w || Y + B > h) return Infinity
        return sad(prev, cur, w, x, y, B, B, dx, dy)
      }
      let best = Infinity, bx = ox, by = oy
      for (let dy = oy - R; dy <= oy + R; dy++)
        for (let dx = ox - R; dx <= ox + R; dx++) {
          const cst = cost(dx, dy)
          if (cst < best) [best, bx, by] = [cst, dx, dy]
        }
      if (!Number.isFinite(best)) continue
      const sx = parab(cost(bx - 1, by), best, cost(bx + 1, by))
      const sy = parab(cost(bx, by - 1), best, cost(bx, by + 1))
      vecs.push({ x: x + B / 2 - w / 2, y: y + B / 2 - h / 2, u: bx + (Number.isFinite(sx) ? sx : 0), v: by + (Number.isFinite(sy) ? sy : 0), w: 1 })
    }
  if (vecs.length < 3) return { dx: ox, dy: oy, da: 0, conf: 0 }
  // Robust fit: iteratively drop vectors (moving objects) far from the model.
  let fit = fitSimilarity(vecs)
  for (let it = 0; it < 3; it++) {
    const res = vecs.map((p) => Math.hypot(fit.a * p.x - fit.b * p.y + fit.tx - (p.x + p.u), fit.b * p.x + fit.a * p.y + fit.ty - (p.y + p.v)))
    const med = [...res].sort((a, b) => a - b)[res.length >> 1]
    const thr = Math.max(0.75, 2.5 * med)
    vecs.forEach((p, i) => (p.w = res[i] <= thr ? 1 : 0))
    fit = fitSimilarity(vecs)
  }
  if (!opts.rotation) {
    // Translation only: weighted mean of inlier vectors.
    const inl = vecs.filter((p) => p.w > 0)
    const n = inl.length || 1
    return { dx: inl.reduce((s, p) => s + p.u, 0) / n, dy: inl.reduce((s, p) => s + p.v, 0) / n, da: 0, conf: inl.length / vecs.length }
  }
  const conf = vecs.filter((p) => p.w > 0).length / vecs.length
  return { dx: fit.tx, dy: fit.ty, da: Math.atan2(fit.b, fit.a), conf }
}

export interface Traj {
  t: number[]
  x: number[]
  y: number[]
  a: number[]
}

/** Cumulative camera path from per-frame motions. */
export function accumulate(times: number[], ms: Motion[]): Traj {
  const out: Traj = { t: [], x: [], y: [], a: [] }
  let x = 0, y = 0, a = 0
  times.forEach((t, i) => {
    if (i > 0) {
      x += ms[i].dx
      y += ms[i].dy
      a += ms[i].da
    }
    out.t.push(t)
    out.x.push(x)
    out.y.push(y)
    out.a.push(a)
  })
  return out
}

/** Gaussian smoothing with sigma in samples; edges use the renormalized truncated kernel. */
export function gaussSmooth(v: number[], sigma: number): number[] {
  if (sigma <= 0) return [...v]
  const r = Math.ceil(3 * sigma)
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)))
  return v.map((_, i) => {
    let s = 0, w = 0
    for (let j = -r; j <= r; j++) {
      const q = i + j
      if (q < 0 || q >= v.length) continue
      s += v[q] * k[j + r]
      w += k[j + r]
    }
    return s / w
  })
}

/** Linear fit removal: keeps intentional constant pans when 'lock' mode wants a tripod look. */
export function lineFit(v: number[]): number[] {
  const n = v.length
  if (n < 2) return [...v]
  const mx = (n - 1) / 2, my = v.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  v.forEach((y, i) => {
    num += (i - mx) * (y - my)
    den += (i - mx) ** 2
  })
  const b = num / den
  return v.map((_, i) => my + b * (i - mx))
}

export interface Corr {
  dx: number
  dy: number
  da: number
}

/**
 * Smallest zoom Z (≥1) so the warped frame covers the whole viewport, for the forward map
 * out = Z · (R(da)·q + t) with centred coordinates.
 */
export function requiredZoom(c: Corr, w: number, h: number): number {
  const fits = (Z: number) => {
    const cos = Math.cos(-c.da), sin = Math.sin(-c.da)
    for (const [ox, oy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) {
      const px = ox / Z - c.dx, py = oy / Z - c.dy
      const qx = cos * px - sin * py, qy = sin * px + cos * py
      if (Math.abs(qx) > w / 2 + 1e-6 || Math.abs(qy) > h / 2 + 1e-6) return false
    }
    return true
  }
  if (fits(1)) return 1
  let lo = 1, hi = 1.05
  while (!fits(hi) && hi < 8) hi *= 1.25
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2
    if (fits(m)) hi = m
    else lo = m
  }
  return hi
}

/** Root mean square of frame-to-frame differences (jitter measure). */
export function jitter(v: number[]): number {
  if (v.length < 2) return 0
  let s = 0
  for (let i = 1; i < v.length; i++) s += (v[i] - v[i - 1]) ** 2
  return Math.sqrt(s / (v.length - 1))
}

/** Linear interpolation of a sampled series at time t. */
export function sampleAt(ts: number[], vs: number[], t: number): number {
  if (!ts.length) return 0
  if (t <= ts[0]) return vs[0]
  if (t >= ts[ts.length - 1]) return vs[vs.length - 1]
  let lo = 0, hi = ts.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (ts[m] <= t) lo = m
    else hi = m
  }
  const f = (t - ts[lo]) / (ts[hi] - ts[lo] || 1)
  return vs[lo] + f * (vs[hi] - vs[lo])
}
