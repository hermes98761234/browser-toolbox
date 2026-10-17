// Tiny multilayer perceptron with backprop (binary classification, sigmoid output, BCE loss) + toy datasets.

export type Act = 'tanh' | 'relu' | 'sigmoid' | 'linear'
export type DatasetKind = 'circle' | 'xor' | 'gauss' | 'spiral' | 'moons'
export type Feature = 'x' | 'y' | 'x2' | 'y2' | 'xy' | 'sinx' | 'siny'

export interface Pt { x: number; y: number; label: 0 | 1 }

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

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r())

/** Points in [-6, 6]². `noise` 0..1. */
export function makeData(kind: DatasetKind, n: number, noise: number, seed = 1): Pt[] {
  const r = rng(seed)
  const pts: Pt[] = []
  const nz = () => gauss(r) * noise
  for (let i = 0; i < n; i++) {
    const half = i < n / 2
    switch (kind) {
      case 'circle': {
        const rad = half ? r() * 2.5 : 3.5 + r() * 1.5
        const a = r() * 2 * Math.PI
        pts.push({ x: rad * Math.cos(a) + nz() * 1.5, y: rad * Math.sin(a) + nz() * 1.5, label: half ? 1 : 0 })
        break
      }
      case 'xor': {
        let x = r() * 10 - 5, y = r() * 10 - 5
        x += x > 0 ? 0.3 : -0.3
        y += y > 0 ? 0.3 : -0.3
        pts.push({ x: x + nz() * 1.5, y: y + nz() * 1.5, label: x * y >= 0 ? 1 : 0 })
        break
      }
      case 'gauss': {
        const c = half ? 2 : -2
        pts.push({ x: c + gauss(r) * (0.6 + noise * 1.5), y: c + gauss(r) * (0.6 + noise * 1.5), label: half ? 1 : 0 })
        break
      }
      case 'spiral': {
        const k = Math.floor(i / 2)
        const m = Math.ceil(n / 2)
        const cls = i % 2
        const rad = (k / m) * 5
        const t = (1.75 * k / m) * 2 * Math.PI + cls * Math.PI
        pts.push({ x: rad * Math.sin(t) + nz(), y: rad * Math.cos(t) + nz(), label: cls as 0 | 1 })
        break
      }
      case 'moons': {
        const t = r() * Math.PI
        if (half) pts.push({ x: 3 * Math.cos(t) - 1.5 + nz(), y: 3 * Math.sin(t) - 0.75 + nz(), label: 1 })
        else pts.push({ x: 3 - 3 * Math.cos(t) - 1.5 + nz(), y: 1.5 - 3 * Math.sin(t) - 0.75 + nz(), label: 0 })
        break
      }
    }
  }
  return pts
}

export function features(x: number, y: number, fs: Feature[]): number[] {
  const u = x / 6, v = y / 6
  return fs.map((f) => (f === 'x' ? u : f === 'y' ? v : f === 'x2' ? u * u : f === 'y2' ? v * v : f === 'xy' ? u * v : f === 'sinx' ? Math.sin(x) : Math.sin(y)))
}

const fwd: Record<Act, (z: number) => number> = {
  tanh: Math.tanh,
  relu: (z) => (z > 0 ? z : 0),
  sigmoid: (z) => 1 / (1 + Math.exp(-z)),
  linear: (z) => z,
}
/** Derivative expressed through the activation output a. */
const der: Record<Act, (a: number, z: number) => number> = {
  tanh: (a) => 1 - a * a,
  relu: (_a, z) => (z > 0 ? 1 : 0),
  sigmoid: (a) => a * (1 - a),
  linear: () => 1,
}

export interface Net {
  sizes: number[]
  /** W[l][j][i]: weight from neuron i of layer l to neuron j of layer l+1. */
  W: number[][][]
  b: number[][]
  act: Act
}

export function createNet(sizes: number[], act: Act, seed = 7): Net {
  const r = rng(seed)
  const W: number[][][] = []
  const b: number[][] = []
  for (let l = 0; l < sizes.length - 1; l++) {
    const nin = sizes[l], nout = sizes[l + 1]
    const sd = act === 'relu' ? Math.sqrt(2 / nin) : Math.sqrt(1 / nin)
    W.push(Array.from({ length: nout }, () => Array.from({ length: nin }, () => gauss(r) * sd)))
    b.push(Array.from({ length: nout }, () => (act === 'relu' ? 0.1 : 0)))
  }
  return { sizes, W, b, act }
}

/** Returns activations of every layer (a[0] = input, last = sigmoid probability) and pre-activations. */
export function forward(net: Net, input: number[]): { a: number[][]; z: number[][] } {
  const a: number[][] = [input]
  const z: number[][] = [input]
  const L = net.W.length
  for (let l = 0; l < L; l++) {
    const prev = a[l]
    const zl = net.W[l].map((row, j) => row.reduce((s, w, i) => s + w * prev[i], net.b[l][j]))
    const f = l === L - 1 ? fwd.sigmoid : fwd[net.act]
    z.push(zl)
    a.push(zl.map(f))
  }
  return { a, z }
}

export const predict = (net: Net, input: number[]) => forward(net, input).a[net.W.length][0]

/** One SGD step on a mini-batch. Returns mean BCE loss of the batch before the update. */
export function trainBatch(net: Net, X: number[][], Y: number[], lr: number, l2 = 0): number {
  const L = net.W.length
  const gW = net.W.map((m) => m.map((r) => r.map(() => 0)))
  const gb = net.b.map((v) => v.map(() => 0))
  let loss = 0
  for (let k = 0; k < X.length; k++) {
    const { a, z } = forward(net, X[k])
    const p = Math.min(1 - 1e-9, Math.max(1e-9, a[L][0]))
    loss += -(Y[k] * Math.log(p) + (1 - Y[k]) * Math.log(1 - p))
    let delta = [a[L][0] - Y[k]] // sigmoid + BCE
    for (let l = L - 1; l >= 0; l--) {
      const prev = a[l]
      for (let j = 0; j < delta.length; j++) {
        gb[l][j] += delta[j]
        for (let i = 0; i < prev.length; i++) gW[l][j][i] += delta[j] * prev[i]
      }
      if (l > 0) {
        const nd: number[] = new Array(prev.length).fill(0)
        for (let i = 0; i < prev.length; i++) {
          let s = 0
          for (let j = 0; j < delta.length; j++) s += net.W[l][j][i] * delta[j]
          nd[i] = s * der[net.act](a[l][i], z[l][i])
        }
        delta = nd
      }
    }
  }
  const n = X.length || 1
  for (let l = 0; l < L; l++)
    for (let j = 0; j < net.W[l].length; j++) {
      net.b[l][j] -= (lr * gb[l][j]) / n
      for (let i = 0; i < net.W[l][j].length; i++) net.W[l][j][i] -= lr * (gW[l][j][i] / n + l2 * net.W[l][j][i])
    }
  return loss / n
}

export function evaluate(net: Net, X: number[][], Y: number[]): { loss: number; acc: number } {
  let loss = 0, ok = 0
  X.forEach((x, k) => {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, predict(net, x)))
    loss += -(Y[k] * Math.log(p) + (1 - Y[k]) * Math.log(1 - p))
    if ((p >= 0.5 ? 1 : 0) === Y[k]) ok++
  })
  return { loss: loss / (X.length || 1), acc: ok / (X.length || 1) }
}

/** Runs one epoch of shuffled mini-batch SGD. */
export function epoch(net: Net, X: number[][], Y: number[], lr: number, batch: number, l2: number, r: () => number): void {
  const idx = X.map((_, i) => i)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  for (let s = 0; s < idx.length; s += batch) {
    const ids = idx.slice(s, s + batch)
    trainBatch(net, ids.map((i) => X[i]), ids.map((i) => Y[i]), lr, l2)
  }
}
