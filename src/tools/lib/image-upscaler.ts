// Classical (non-AI) image upscaling: kernel resampling, edge-directed doubling, pixel-art scalers, unsharp mask.
// All functions work on RGBA byte buffers and are written for this project (no third-party code).

export interface Img { w: number; h: number; d: Uint8ClampedArray }
export type Method = 'nearest' | 'bilinear' | 'bicubic' | 'lanczos3' | 'edge' | 'pixelart'

export const METHODS: Record<Method, { name: string; note: string }> = {
  lanczos3: { name: 'Lanczos-3', note: 'Windowed-sinc, 6×6 taps. Sharpest general-purpose kernel; slight ringing on hard edges.' },
  bicubic: { name: 'Bicubic', note: 'Keys cubic (a = −0.5), 4×4 taps. Smooth and natural, a little softer than Lanczos.' },
  edge: { name: 'Edge-directed', note: 'Doubles the image repeatedly, interpolating along the edge direction (smaller gradient) instead of across it. Fewer jaggies on diagonals and text.' },
  pixelart: { name: 'Pixel-art (Scale2×/3×)', note: 'Rule-based scaler for sprites and icons: keeps flat colours and rounds diagonal staircases. Integer factors only (2×, 3×, 4×).' },
  bilinear: { name: 'Bilinear', note: 'Linear blend of 2×2 neighbours. Fast, blurry.' },
  nearest: { name: 'Nearest neighbour', note: 'Copies pixels into blocks. Useful as the “before” reference.' },
}

const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x))
export const KERNELS: Record<'bilinear' | 'bicubic' | 'lanczos3', { r: number; f: (x: number) => number }> = {
  bilinear: { r: 1, f: (x) => Math.max(0, 1 - Math.abs(x)) },
  bicubic: {
    r: 2,
    f: (x) => {
      const a = -0.5
      x = Math.abs(x)
      return x <= 1 ? (a + 2) * x ** 3 - (a + 3) * x ** 2 + 1 : x < 2 ? a * x ** 3 - 5 * a * x ** 2 + 8 * a * x - 4 * a : 0
    },
  },
  lanczos3: { r: 3, f: (x) => (Math.abs(x) < 3 ? sinc(x) * sinc(x / 3) : 0) },
}

/** Precomputed taps for one axis: for every output coordinate the first source index and normalised weights. */
function taps(src: number, dst: number, k: { r: number; f: (x: number) => number }) {
  const scale = dst / src
  const sup = scale < 1 ? k.r / scale : k.r
  const n = Math.ceil(sup) * 2 + 1
  const first = new Int32Array(dst)
  const w = new Float32Array(dst * n)
  for (let o = 0; o < dst; o++) {
    const c = (o + 0.5) / scale - 0.5
    const s0 = Math.floor(c - sup) + 1
    first[o] = s0
    let sum = 0
    for (let j = 0; j < n; j++) {
      const x = (s0 + j - c) * (scale < 1 ? scale : 1)
      const v = k.f(x)
      w[o * n + j] = v
      sum += v
    }
    for (let j = 0; j < n; j++) w[o * n + j] /= sum || 1
  }
  return { first, w, n }
}

const clampI = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v)

/**
 * Separable kernel resize with premultiplied alpha (no dark fringes around transparency).
 * `onRows(done, total)` reports progress while the vertical pass is processed in bands.
 */
export function resize(img: Img, W: number, H: number, method: Method, onRows?: (done: number, total: number) => void): Img {
  if (method === 'nearest' || method === 'pixelart' || method === 'edge') {
    const out = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      const sy = Math.min(img.h - 1, Math.floor(((y + 0.5) * img.h) / H))
      for (let x = 0; x < W; x++) {
        const sx = Math.min(img.w - 1, Math.floor(((x + 0.5) * img.w) / W))
        const s = (sy * img.w + sx) * 4, d = (y * W + x) * 4
        out[d] = img.d[s]; out[d + 1] = img.d[s + 1]; out[d + 2] = img.d[s + 2]; out[d + 3] = img.d[s + 3]
      }
    }
    return { w: W, h: H, d: out }
  }
  const k = KERNELS[method]
  const tx = taps(img.w, W, k)
  const ty = taps(img.h, H, k)
  // horizontal pass → float premultiplied
  const mid = new Float32Array(W * img.h * 4)
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0
      const s0 = tx.first[x]
      for (let j = 0; j < tx.n; j++) {
        const wt = tx.w[x * tx.n + j]
        if (!wt) continue
        const i = (y * img.w + clampI(s0 + j, img.w - 1)) * 4
        const al = img.d[i + 3] / 255
        r += wt * img.d[i] * al; g += wt * img.d[i + 1] * al; b += wt * img.d[i + 2] * al; a += wt * al
      }
      const o = (y * W + x) * 4
      mid[o] = r; mid[o + 1] = g; mid[o + 2] = b; mid[o + 3] = a
    }
  }
  const out = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    const s0 = ty.first[y]
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let j = 0; j < ty.n; j++) {
        const wt = ty.w[y * ty.n + j]
        if (!wt) continue
        const i = (clampI(s0 + j, img.h - 1) * W + x) * 4
        r += wt * mid[i]; g += wt * mid[i + 1]; b += wt * mid[i + 2]; a += wt * mid[i + 3]
      }
      const o = (y * W + x) * 4
      const al = a > 1e-6 ? a : 0
      out[o] = al ? r / al : 0; out[o + 1] = al ? g / al : 0; out[o + 2] = al ? b / al : 0; out[o + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255)
    }
    if (onRows && (y & 63) === 63) onRows(y + 1, H)
  }
  return { w: W, h: H, d: out }
}

// ---------- edge-directed 2× ----------

const lum = (d: ArrayLike<number>, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] + 0.5 * d[i + 3]

/**
 * Doubles an image. Original pixels land on even coordinates; each missing pixel is interpolated with a
 * 4-tap cubic (−1, 9, 9, −1)/16 along whichever of two candidate directions has the smaller luminance
 * gradient, blending both when neither direction dominates. Pass 1 fills diagonal centres, pass 2 the rest.
 */
export function edgeDouble(img: Img): Img {
  const W = img.w * 2, H = img.h * 2
  const f = new Float32Array(W * H * 4)
  const known = new Uint8Array(W * H)
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const s = (y * img.w + x) * 4, d = (2 * y * W + 2 * x) * 4
      for (let c = 0; c < 4; c++) f[d + c] = img.d[s + c]
      known[2 * y * W + 2 * x] = 1
    }
  const at = (x: number, y: number) => (clampI(y, H - 1) * W + clampI(x, W - 1)) * 4
  // when sampling outside the image, fall back to the nearest *known* lattice point of the same parity
  const px = (x: number, y: number, par: number) => {
    let cx = clampI(x, W - 1), cy = clampI(y, H - 1)
    if (par === 0) { if (cx & 1) cx--; if (cy & 1) cy-- }
    return at(cx, cy)
  }
  const fill = (x: number, y: number, dirs: [[number, number], [number, number]], par: number) => {
    const g = [0, 0]
    for (let k = 0; k < 2; k++) {
      const [dx, dy] = dirs[k]
      // gradient along the direction, measured over three neighbouring parallel pairs
      let s = 0
      for (const o of [-2, 0, 2]) {
        const ox = dirs[1 - k][0] * (o / 2) * 2, oy = dirs[1 - k][1] * (o / 2) * 2
        s += Math.abs(lum(f, px(x - dx + ox, y - dy + oy, par)) - lum(f, px(x + dx + ox, y + dy + oy, par)))
      }
      g[k] = s
    }
    const interp = (dx: number, dy: number, c: number) =>
      (-f[px(x - 3 * dx, y - 3 * dy, par) + c] + 9 * f[px(x - dx, y - dy, par) + c] + 9 * f[px(x + dx, y + dy, par) + c] - f[px(x + 3 * dx, y + 3 * dy, par) + c]) / 16
    const o = (y * W + x) * 4
    const t = 1.3
    for (let c = 0; c < 4; c++) {
      const a = interp(dirs[0][0], dirs[0][1], c), b = interp(dirs[1][0], dirs[1][1], c)
      let v: number
      if (g[0] * t < g[1]) v = a
      else if (g[1] * t < g[0]) v = b
      else {
        const wa = 1 / (1 + g[0] ** 2), wb = 1 / (1 + g[1] ** 2)
        v = (a * wa + b * wb) / (wa + wb)
      }
      // clamp to the range of the two nearest neighbours in each direction (prevents overshoot halos)
      const n = [px(x - dirs[0][0], y - dirs[0][1], par), px(x + dirs[0][0], y + dirs[0][1], par), px(x - dirs[1][0], y - dirs[1][1], par), px(x + dirs[1][0], y + dirs[1][1], par)].map((i) => f[i + c])
      f[o + c] = Math.min(Math.max(v, Math.min(...n)), Math.max(...n))
    }
  }
  for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) fill(x, y, [[1, 1], [1, -1]], 0)
  for (let y = 0; y < H; y++) for (let x = (y + 1) & 1; x < W; x += 2) fill(x, y, [[1, 0], [0, 1]], 1)
  const out = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < out.length; i++) out[i] = f[i]
  return { w: W, h: H, d: out }
}

// ---------- pixel-art scalers ----------

const same = (d: Uint8ClampedArray, i: number, j: number) => d[i] === d[j] && d[i + 1] === d[j + 1] && d[i + 2] === d[j + 2] && d[i + 3] === d[j + 3]

/**
 * Scale2× / Scale3× family, written from the published rule description: each pixel E becomes an n×n block;
 * a corner takes the colour of its two orthogonal neighbours when they agree with each other and the opposite
 * neighbours differ, which rounds staircase diagonals while leaving flat areas untouched.
 */
export function pixelScale(img: Img, n: 2 | 3): Img {
  const W = img.w * n, H = img.h * n
  const out = new Uint8ClampedArray(W * H * 4)
  const P = (x: number, y: number) => (clampI(y, img.h - 1) * img.w + clampI(x, img.w - 1)) * 4
  const d = img.d
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const A = P(x - 1, y - 1), B = P(x, y - 1), C = P(x + 1, y - 1)
      const D = P(x - 1, y), E = P(x, y), F = P(x + 1, y)
      const G = P(x - 1, y + 1), H_ = P(x, y + 1), I = P(x + 1, y + 1)
      const blk: number[] = new Array(n * n).fill(E)
      if (!same(d, B, H_) && !same(d, D, F)) {
        if (n === 2) {
          if (same(d, D, B)) blk[0] = D
          if (same(d, B, F)) blk[1] = F
          if (same(d, D, H_)) blk[2] = D
          if (same(d, H_, F)) blk[3] = F
        } else {
          const db = same(d, D, B), bf = same(d, B, F), dh = same(d, D, H_), hf = same(d, H_, F)
          if (db) blk[0] = D
          if ((db && !same(d, E, C)) || (bf && !same(d, E, A))) blk[1] = B
          if (bf) blk[2] = F
          if ((db && !same(d, E, G)) || (dh && !same(d, E, A))) blk[3] = D
          if ((bf && !same(d, E, I)) || (hf && !same(d, E, C))) blk[5] = F
          if (dh) blk[6] = D
          if ((dh && !same(d, E, I)) || (hf && !same(d, E, G))) blk[7] = H_
          if (hf) blk[8] = F
        }
      }
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const s = blk[j * n + i], o = ((y * n + j) * W + x * n + i) * 4
          out[o] = d[s]; out[o + 1] = d[s + 1]; out[o + 2] = d[s + 2]; out[o + 3] = d[s + 3]
        }
    }
  return { w: W, h: H, d: out }
}

// ---------- unsharp mask ----------

export function gaussianBlur(img: Img, sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3))
  const k = new Float32Array(2 * r + 1)
  let s = 0
  for (let i = -r; i <= r; i++) s += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma))
  for (let i = 0; i < k.length; i++) k[i] /= s
  const { w, h, d } = img
  const tmp = new Float32Array(w * h * 3)
  const out = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        let v = 0
        for (let i = -r; i <= r; i++) v += k[i + r] * d[(y * w + clampI(x + i, w - 1)) * 4 + c]
        tmp[(y * w + x) * 3 + c] = v
      }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        let v = 0
        for (let i = -r; i <= r; i++) v += k[i + r] * tmp[(clampI(y + i, h - 1) * w + x) * 3 + c]
        out[(y * w + x) * 3 + c] = v
      }
  return out
}

/** Classic unsharp mask: out = in + amount·(in − blur), skipped where |difference| < threshold. */
export function unsharp(img: Img, amount: number, sigma: number, threshold: number): Img {
  if (amount <= 0) return img
  const b = gaussianBlur(img, sigma)
  const out = new Uint8ClampedArray(img.d)
  for (let p = 0, q = 0; p < img.d.length; p += 4, q += 3)
    for (let c = 0; c < 3; c++) {
      const diff = img.d[p + c] - b[q + c]
      if (Math.abs(diff) >= threshold) out[p + c] = img.d[p + c] + amount * diff
    }
  return { ...img, d: out }
}

// ---------- tiling + pipeline ----------

export function crop(img: Img, x: number, y: number, w: number, h: number): Img {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let j = 0; j < h; j++) d.set(img.d.subarray(((y + j) * img.w + x) * 4, ((y + j) * img.w + x + w) * 4), j * w * 4)
  return { w, h, d }
}
function paste(dst: Img, src: Img, x: number, y: number) {
  for (let j = 0; j < src.h; j++) dst.d.set(src.d.subarray(j * src.w * 4, (j + 1) * src.w * 4), ((y + j) * dst.w + x) * 4)
}

/**
 * Runs an integer-factor scaler tile by tile: each source tile is padded by `margin` pixels so the
 * neighbourhood at tile borders is identical to a whole-image run, then the padded part is cut away.
 */
export function tiled(img: Img, factor: number, fn: (t: Img) => Img, tile = 128, margin = 6, onTile?: (done: number, total: number) => void): Img {
  const out: Img = { w: img.w * factor, h: img.h * factor, d: new Uint8ClampedArray(img.w * factor * img.h * factor * 4) }
  const nx = Math.ceil(img.w / tile), ny = Math.ceil(img.h / tile)
  let done = 0
  for (let ty = 0; ty < ny; ty++)
    for (let tx = 0; tx < nx; tx++) {
      const x0 = tx * tile, y0 = ty * tile
      const w = Math.min(tile, img.w - x0), h = Math.min(tile, img.h - y0)
      const px0 = Math.max(0, x0 - margin), py0 = Math.max(0, y0 - margin)
      const px1 = Math.min(img.w, x0 + w + margin), py1 = Math.min(img.h, y0 + h + margin)
      const r = fn(crop(img, px0, py0, px1 - px0, py1 - py0))
      paste(out, crop(r, (x0 - px0) * factor, (y0 - py0) * factor, w * factor, h * factor), x0 * factor, y0 * factor)
      onTile?.(++done, nx * ny)
    }
  return out
}

export interface Job { method: Method; factor: number; sharpen: number; sigma: number; threshold: number }
export const MAX_OUT = 4096 * 4096

export function outSize(w: number, h: number, j: Pick<Job, 'method' | 'factor'>): [number, number] {
  const f = j.method === 'pixelart' ? Math.min(4, Math.max(2, Math.round(j.factor))) : j.factor
  return [Math.max(1, Math.round(w * f)), Math.max(1, Math.round(h * f))]
}

export function upscale(img: Img, j: Job, progress: (p: number) => void = () => {}): Img {
  const [W, H] = outSize(img.w, img.h, j)
  if (W * H > MAX_OUT) throw new Error(`Output ${W}×${H} exceeds the ${Math.sqrt(MAX_OUT)}² pixel limit.`)
  let r: Img
  if (j.method === 'pixelart') {
    const f = Math.round(W / img.w)
    r = f === 3 ? tiled(img, 3, (t) => pixelScale(t, 3), 128, 2, (a, b) => progress((0.9 * a) / b))
      : tiled(img, f, (t) => (f === 4 ? pixelScale(pixelScale(t, 2), 2) : pixelScale(t, 2)), 128, 3, (a, b) => progress((0.9 * a) / b))
  } else if (j.method === 'edge') {
    let k = 1
    while (k < j.factor - 1e-9) k *= 2
    const passes = Math.log2(k)
    r = tiled(img, k, (t) => { let x = t; for (let i = 0; i < passes; i++) x = edgeDouble(x); return x }, 96, 6, (a, b) => progress((0.8 * a) / b))
    if (r.w !== W || r.h !== H) r = resize(r, W, H, 'lanczos3', (a, b) => progress(0.8 + (0.1 * a) / b))
  } else r = resize(img, W, H, j.method, (a, b) => progress((0.9 * a) / b))
  if (j.sharpen > 0) r = unsharp(r, j.sharpen, j.sigma, j.threshold)
  progress(1)
  return r
}
