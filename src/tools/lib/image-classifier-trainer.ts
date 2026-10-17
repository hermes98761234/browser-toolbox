// Image classifier trainer core: handcrafted features (colour histogram + HOG-like gradient histogram +
// tiny grey thumbnail), z-score standardisation, k-nearest-neighbours and a small softmax / MLP trained
// with mini-batch gradient descent. No pretrained network: this works for simple, visually distinct
// classes under consistent lighting, not for general object recognition.

export const SIDE = 32 // every image is resampled to SIDE × SIDE RGBA before feature extraction

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Area-average resample of RGBA pixels to SIDE × SIDE. */
export function resample(src: Uint8ClampedArray | number[], w: number, h: number, side = SIDE): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(side * side * 4)
  for (let y = 0; y < side; y++) {
    const y0 = Math.floor((y * h) / side), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / side))
    for (let x = 0; x < side; x++) {
      const x0 = Math.floor((x * w) / side), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / side))
      const acc = [0, 0, 0, 0]
      let n = 0
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * w + xx) * 4
          for (let c = 0; c < 4; c++) acc[c] += src[i + c]
          n++
        }
      const o = (y * side + x) * 4
      for (let c = 0; c < 4; c++) out[o + c] = acc[c] / n
    }
  }
  return out
}

export const FEATURE_PARTS = { color: 64, hog: 4 * 4 * 9, thumb: 64 }
export const FEATURE_LEN = FEATURE_PARTS.color + FEATURE_PARTS.hog + FEATURE_PARTS.thumb

/** Feature vector of a SIDE × SIDE RGBA image. */
export function features(px: Uint8ClampedArray): number[] {
  const N = SIDE * SIDE
  // 1) colour histogram, 4 × 4 × 4 RGB bins, normalised to sum 1 then sqrt (Hellinger)
  const col = new Array(64).fill(0)
  const grey = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]
    col[(r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)]++
    grey[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }
  const f: number[] = col.map((c) => Math.sqrt(c / N))
  // 2) HOG-like: 4 × 4 cells of 8 × 8 px, 9 unsigned orientation bins, magnitude-weighted, L2-normalised per cell
  const cell = SIDE / 4
  const hog = new Array(FEATURE_PARTS.hog).fill(0)
  for (let y = 0; y < SIDE; y++)
    for (let x = 0; x < SIDE; x++) {
      const gx = grey[y * SIDE + Math.min(SIDE - 1, x + 1)] - grey[y * SIDE + Math.max(0, x - 1)]
      const gy = grey[Math.min(SIDE - 1, y + 1) * SIDE + x] - grey[Math.max(0, y - 1) * SIDE + x]
      const mag = Math.hypot(gx, gy)
      if (!mag) continue
      let ang = Math.atan2(gy, gx)
      if (ang < 0) ang += Math.PI
      const pos = (ang / Math.PI) * 9 - 0.5 // bilinear vote between neighbouring bins
      const b0 = Math.floor(pos), t = pos - b0
      const base = (Math.floor(y / cell) * 4 + Math.floor(x / cell)) * 9
      hog[base + ((b0 + 9) % 9)] += mag * (1 - t)
      hog[base + ((b0 + 1) % 9)] += mag * t
    }
  for (let c = 0; c < 16; c++) {
    const s = Math.hypot(...hog.slice(c * 9, c * 9 + 9)) + 1e-6
    for (let k = 0; k < 9; k++) f.push(Math.min(0.4, hog[c * 9 + k] / s)) // clipped like HOG's L2-Hys
  }
  // 3) 8 × 8 grey thumbnail (coarse layout / brightness)
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      let s = 0
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) s += grey[(y * 4 + yy) * SIDE + x * 4 + xx]
      f.push(s / 16)
    }
  return f
}

export interface Scaler { mean: number[]; std: number[] }

export function fitScaler(X: number[][]): Scaler {
  const d = X[0]?.length ?? 0
  const mean = new Array(d).fill(0), std = new Array(d).fill(0)
  for (const x of X) for (let j = 0; j < d; j++) mean[j] += x[j] / X.length
  for (const x of X) for (let j = 0; j < d; j++) std[j] += (x[j] - mean[j]) ** 2 / X.length
  return { mean, std: std.map((v) => Math.sqrt(v) || 1) }
}
export const scale = (s: Scaler, x: number[]) => x.map((v, j) => (v - s.mean[j]) / s.std[j])

export function softmax(z: number[]): number[] {
  const m = Math.max(...z)
  const e = z.map((v) => Math.exp(v - m))
  const s = e.reduce((a, b) => a + b, 0)
  return e.map((v) => v / s)
}

/** Distance-weighted k-NN probabilities over `k` classes count `nc`. */
export function knnPredict(train: number[][], labels: number[], x: number[], k: number, nc: number): number[] {
  const d = train.map((t, i) => {
    let s = 0
    for (let j = 0; j < x.length; j++) s += (t[j] - x[j]) ** 2
    return [Math.sqrt(s), labels[i]] as const
  })
  d.sort((a, b) => a[0] - b[0])
  const p = new Array(nc).fill(0)
  const near = d.slice(0, Math.max(1, Math.min(k, d.length)))
  for (const [dist, l] of near) p[l] += 1 / (dist + 1e-3)
  const s = p.reduce((a, b) => a + b, 0) || 1
  return p.map((v) => v / s)
}

export interface Net { W1: number[][]; b1: number[]; W2: number[][]; b2: number[]; hidden: number }

/** One-hidden-layer ReLU network (hidden = 0 → plain softmax regression). */
export function initNet(din: number, hidden: number, nc: number, seed = 1): Net {
  const r = rng(seed)
  const g = (fan: number) => (r() * 2 - 1) * Math.sqrt(6 / fan)
  const h = hidden || din
  return {
    hidden,
    W1: hidden ? Array.from({ length: hidden }, () => Array.from({ length: din }, () => g(din + hidden))) : [],
    b1: new Array(hidden).fill(0),
    W2: Array.from({ length: nc }, () => Array.from({ length: h }, () => (hidden ? g(h + nc) : 0))),
    b2: new Array(nc).fill(0),
  }
}

function forward(n: Net, x: number[]): { h: number[]; p: number[] } {
  const h = n.hidden ? n.W1.map((w, i) => Math.max(0, w.reduce((a, v, j) => a + v * x[j], n.b1[i]))) : x
  const p = softmax(n.W2.map((w, c) => w.reduce((a, v, j) => a + v * h[j], n.b2[c])))
  return { h, p }
}
export const netPredict = (n: Net, x: number[]) => forward(n, x).p

/** Trains in place with mini-batch SGD + momentum and L2; returns the mean cross-entropy per epoch. */
export function trainNet(n: Net, X: number[][], y: number[], o: { epochs: number; lr: number; l2: number; batch?: number; seed?: number }): number[] {
  const r = rng(o.seed ?? 7)
  const B = o.batch ?? 16
  const nc = n.W2.length
  const vW2 = n.W2.map((w) => w.map(() => 0)), vb2 = n.b2.map(() => 0)
  const vW1 = n.W1.map((w) => w.map(() => 0)), vb1 = n.b1.map(() => 0)
  const losses: number[] = []
  const idx = X.map((_, i) => i)
  for (let ep = 0; ep < o.epochs; ep++) {
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    let loss = 0
    for (let s = 0; s < idx.length; s += B) {
      const batch = idx.slice(s, s + B)
      const gW2 = n.W2.map((w) => w.map(() => 0)), gb2 = new Array(nc).fill(0)
      const gW1 = n.W1.map((w) => w.map(() => 0)), gb1 = new Array(n.hidden).fill(0)
      for (const i of batch) {
        const x = X[i]
        const { h, p } = forward(n, x)
        loss -= Math.log(Math.max(1e-12, p[y[i]]))
        const dz = p.map((v, c) => v - (c === y[i] ? 1 : 0))
        for (let c = 0; c < nc; c++) {
          gb2[c] += dz[c]
          for (let j = 0; j < h.length; j++) gW2[c][j] += dz[c] * h[j]
        }
        if (n.hidden)
          for (let k = 0; k < n.hidden; k++) {
            if (h[k] <= 0) continue
            let dh = 0
            for (let c = 0; c < nc; c++) dh += dz[c] * n.W2[c][k]
            gb1[k] += dh
            for (let j = 0; j < x.length; j++) gW1[k][j] += dh * x[j]
          }
      }
      const step = (W: number[][], G: number[][], V: number[][], b: number[], gb: number[], vb: number[]) => {
        for (let a = 0; a < W.length; a++) {
          for (let j = 0; j < W[a].length; j++) {
            V[a][j] = 0.9 * V[a][j] - o.lr * (G[a][j] / batch.length + o.l2 * W[a][j])
            W[a][j] += V[a][j]
          }
          vb[a] = 0.9 * vb[a] - (o.lr * gb[a]) / batch.length
          b[a] += vb[a]
        }
      }
      step(n.W2, gW2, vW2, n.b2, gb2, vb2)
      if (n.hidden) step(n.W1, gW1, vW1, n.b1, gb1, vb1)
    }
    losses.push(loss / idx.length)
  }
  return losses
}

/** Stratified split: every `every`-th sample of each class goes to validation. */
export function holdout(labels: number[], every = 5): { train: number[]; val: number[] } {
  const seen = new Map<number, number>()
  const train: number[] = [], val: number[] = []
  labels.forEach((l, i) => {
    const c = (seen.get(l) ?? 0) + 1
    seen.set(l, c)
    ;(c % every === 0 ? val : train).push(i)
  })
  return { train, val }
}

export function confusion(truth: number[], pred: number[], nc: number): number[][] {
  const m = Array.from({ length: nc }, () => new Array(nc).fill(0))
  truth.forEach((t, i) => m[t][pred[i]]++)
  return m
}

export const argmax = (p: number[]) => p.reduce((b, v, i) => (v > p[b] ? i : b), 0)

// ---------- synthetic demo images (shape classes with random colours, so colour alone can't decide) ----------

export const DEMO_CLASSES = ['Circle', 'Stripes', 'Checker'] as const

export function synth(cls: number, seed: number, side = 64): Uint8ClampedArray<ArrayBuffer> {
  const r = rng(seed * 7919 + cls * 104729)
  const hsl = (h: number, s: number, l: number) => {
    const k = (n: number) => (n + h / 30) % 12
    const a = s * Math.min(l, 1 - l)
    return [0, 8, 4].map((n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
  }
  const bg = hsl(r() * 360, 0.3 + r() * 0.5, 0.2 + r() * 0.6)
  const fg = hsl(r() * 360, 0.5 + r() * 0.5, 0.15 + r() * 0.7)
  const out = new Uint8ClampedArray(side * side * 4)
  const cx = side * (0.3 + r() * 0.4), cy = side * (0.3 + r() * 0.4), rad = side * (0.18 + r() * 0.17)
  const ang = r() * Math.PI, period = side * (0.12 + r() * 0.12), sq = side * (0.12 + r() * 0.12)
  const noise = 10 + r() * 30
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      let on: boolean
      if (cls === 0) on = Math.hypot(x - cx, y - cy) < rad
      else if (cls === 1) {
        const t = (x * Math.cos(ang) + y * Math.sin(ang)) / period
        on = t - Math.floor(t) < 0.5
      }
      else on = (Math.floor(x / sq) + Math.floor(y / sq)) % 2 === 0
      const c = on ? fg : bg
      const o = (y * side + x) * 4
      for (let k = 0; k < 3; k++) out[o + k] = c[k] + (r() - 0.5) * noise
      out[o + 3] = 255
    }
  return out
}
