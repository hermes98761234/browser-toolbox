// Front-lit bas-relief from a grayscale height field: edge-preserving smoothing, a monotone height
// curve, rectangular plaques or round medallions/coins with a border and solid base, a closed STL
// mesh and a tangent-space normal map.

/** Edge-preserving (bilateral) smoothing: spatial Gaussian × range Gaussian. Values 0..1. */
export function bilateral(g: Float32Array, w: number, h: number, radius: number, sigmaR: number): Float32Array {
  const r = Math.max(0, Math.round(radius))
  if (r === 0) return g.slice()
  const ss = 2 * (r / 2) ** 2, sr = 2 * sigmaR * sigmaR
  const kern = new Float32Array((2 * r + 1) ** 2)
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) kern[(dy + r) * (2 * r + 1) + dx + r] = Math.exp(-(dx * dx + dy * dy) / ss)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = g[y * w + x]
      let sum = 0, wsum = 0
      for (let dy = -r; dy <= r; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy))
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx))
          const v = g[yy * w + xx]
          const d = v - c
          const k = kern[(dy + r) * (2 * r + 1) + dx + r] * Math.exp(-(d * d) / sr)
          sum += v * k
          wsum += k
        }
      }
      out[y * w + x] = sum / wsum
    }
  return out
}

/** Separable box blur repeated `passes` times (≈ Gaussian), radius in pixels. */
export function soften(g: Float32Array, w: number, h: number, radius: number, passes = 2): Float32Array {
  const r = Math.max(0, Math.round(radius))
  const a = g.slice()
  if (!r) return a
  const b = new Float32Array(w * h)
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0
        for (let d = -r; d <= r; d++) s += a[y * w + Math.min(w - 1, Math.max(0, x + d))]
        b[y * w + x] = s / (2 * r + 1)
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0
        for (let d = -r; d <= r; d++) s += b[Math.min(h - 1, Math.max(0, y + d)) * w + x]
        a[y * w + x] = s / (2 * r + 1)
      }
  }
  return a
}

export type Pt = [number, number]

/** Monotone piecewise-cubic curve through the control points (Fritsch–Carlson tangents). */
export function monotoneCurve(input: Pt[]): (x: number) => number {
  const p = [...input].sort((a, b) => a[0] - b[0]).filter((q, i, arr) => i === 0 || q[0] > arr[i - 1][0] + 1e-6)
  const n = p.length
  if (n === 0) return (x) => x
  if (n === 1) return () => p[0][1]
  const d: number[] = [], m: number[] = new Array(n).fill(0)
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]))
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * d[i]
      m[i + 1] = t * b * d[i]
    }
  }
  return (x) => {
    if (x <= p[0][0]) return p[0][1]
    if (x >= p[n - 1][0]) return p[n - 1][1]
    let i = 0
    while (x > p[i + 1][0]) i++
    const h = p[i + 1][0] - p[i][0], t = (x - p[i][0]) / h
    const t2 = t * t, t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * p[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * p[i + 1][1] + (t3 - t2) * h * m[i + 1]
  }
}

/** Bilinear sample of a w×h grid at u,v ∈ [0,1] (v down). */
export function sample(g: Float32Array, w: number, h: number, u: number, v: number): number {
  const x = Math.min(w - 1, Math.max(0, u * (w - 1))), y = Math.min(h - 1, Math.max(0, v * (h - 1)))
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1)
  const fx = x - x0, fy = y - y0
  const a = g[y0 * w + x0] * (1 - fx) + g[y0 * w + x1] * fx
  const b = g[y1 * w + x0] * (1 - fx) + g[y1 * w + x1] * fx
  return a * (1 - fy) + b * fy
}

export interface ReliefOpts {
  shape: 'rect' | 'round'
  width: number // mm (diameter when round)
  height: number // mm (rect only)
  base: number // solid base thickness, mm
  depth: number // relief depth, mm
  mode: 'emboss' | 'engrave'
  border: number // border band width, mm (0 = none)
  rim: number // border height above the base, mm
}

/** Height (mm, from the back) at plate point x,y (mm, origin at centre, y up). `field` is 0..1, 1 = feature. */
export function heightAt(field: Float32Array, fw: number, fh: number, o: ReliefOpts, x: number, y: number): number {
  const W = o.width, H = o.shape === 'round' ? o.width : o.height
  let edge: number, u: number, v: number
  if (o.shape === 'round') {
    const R = W / 2, ri = Math.max(1e-6, R - o.border)
    edge = R - Math.hypot(x, y)
    u = (x + ri) / (2 * ri)
    v = (ri - y) / (2 * ri)
  } else {
    edge = Math.min(W / 2 - Math.abs(x), H / 2 - Math.abs(y))
    const iw = Math.max(1e-6, W - 2 * o.border), ih = Math.max(1e-6, H - 2 * o.border)
    u = (x + iw / 2) / iw
    v = (ih / 2 - y) / ih
  }
  if (o.border > 0 && edge < o.border - 1e-9) return o.base + o.rim
  const f = sample(field, fw, fh, u, v)
  const z = o.mode === 'emboss' ? o.base + f * o.depth : o.base + (1 - f) * o.depth
  // short bevel from the border into the relief hides grid stair-steps along the inner edge
  const ramp = Math.min(0.6, o.border * 0.4)
  if (o.border > 0 && edge < o.border + ramp) {
    const t = (edge - o.border) / ramp
    return (o.base + o.rim) * (1 - t) + z * t
  }
  return z
}

/** Plate point for grid vertex i,j (C×R). Round plates use the elliptical square→disc mapping. */
export function gridPoint(i: number, j: number, C: number, R: number, o: ReliefOpts): [number, number] {
  const u = -1 + (2 * i) / (C - 1), v = 1 - (2 * j) / (R - 1)
  if (o.shape === 'round') {
    const r = o.width / 2
    return [r * u * Math.sqrt(1 - (v * v) / 2), r * v * Math.sqrt(1 - (u * u) / 2)]
  }
  return [(u * o.width) / 2, (v * o.height) / 2]
}

/** Closed triangle mesh (flat xyz triples, mm, z = out of the front). */
export function buildMesh(z: (x: number, y: number) => number, C: number, R: number, o: ReliefOpts): Float32Array {
  const P = new Float32Array(C * R * 3)
  for (let j = 0; j < R; j++)
    for (let i = 0; i < C; i++) {
      const [x, y] = gridPoint(i, j, C, R, o)
      P.set([x, y, z(x, y)], (j * C + i) * 3)
    }
  const loop: [number, number][] = []
  for (let i = 0; i < C - 1; i++) loop.push([i, R - 1])
  for (let j = R - 1; j > 0; j--) loop.push([C - 1, j])
  for (let i = C - 1; i > 0; i--) loop.push([i, 0])
  for (let j = 0; j < R - 1; j++) loop.push([0, j])
  const tris = (C - 1) * (R - 1) * 2 + loop.length * 3
  const out = new Float32Array(tris * 9)
  let k = 0
  const put = (a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>) => {
    out[k] = a[0]; out[k + 1] = a[1]; out[k + 2] = a[2]
    out[k + 3] = b[0]; out[k + 4] = b[1]; out[k + 5] = b[2]
    out[k + 6] = c[0]; out[k + 7] = c[1]; out[k + 8] = c[2]
    k += 9
  }
  const T = (i: number, j: number) => P.subarray((j * C + i) * 3, (j * C + i) * 3 + 3)
  const B = (i: number, j: number) => [P[(j * C + i) * 3], P[(j * C + i) * 3 + 1], 0]
  for (let j = 0; j < R - 1; j++)
    for (let i = 0; i < C - 1; i++) {
      put(T(i, j), T(i, j + 1), T(i + 1, j + 1))
      put(T(i, j), T(i + 1, j + 1), T(i + 1, j))
    }
  const centre = [0, 0, 0]
  for (let n = 0; n < loop.length; n++) {
    const a = loop[n], b = loop[(n + 1) % loop.length]
    put(B(...a), B(...b), T(...b))
    put(B(...a), T(...b), T(...a))
    put(centre, B(...b), B(...a))
  }
  return out
}

/** Tangent-space normal map (RGBA) of the height function over a w×h pixel raster of the plate. */
export function normalMap(z: (x: number, y: number) => number, w: number, h: number, o: ReliefOpts, strength = 1): Uint8ClampedArray<ArrayBuffer> {
  const W = o.width, H = o.shape === 'round' ? o.width : o.height
  const px = W / w, py = H / h
  const out = new Uint8ClampedArray(w * h * 4)
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = -W / 2 + (i + 0.5) * px, y = H / 2 - (j + 0.5) * py
      const k = (j * w + i) * 4
      if (o.shape === 'round' && Math.hypot(x, y) > W / 2) {
        out.set([128, 128, 255, 0], k)
        continue
      }
      const dzdx = (z(x + px, y) - z(x - px, y)) / (2 * px)
      const dzdy = (z(x, y + py) - z(x, y - py)) / (2 * py)
      const nx = -dzdx * strength, ny = -dzdy * strength, l = Math.hypot(nx, ny, 1)
      out.set([Math.round((nx / l) * 127.5 + 127.5), Math.round((ny / l) * 127.5 + 127.5), Math.round((1 / l) * 127.5 + 127.5), 255], k)
    }
  return out
}
