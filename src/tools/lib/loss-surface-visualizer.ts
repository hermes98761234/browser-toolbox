// Classic 2-D optimisation test functions with analytic gradients, and first-order optimisers.

export type V2 = [number, number]

export interface Surface {
  id: string
  name: string
  f: (x: number, y: number) => number
  g: (x: number, y: number) => V2
  /** Plot window [xmin, xmax, ymin, ymax]. */
  box: [number, number, number, number]
  minima: V2[]
  start: V2
  /** Apply log(1+f) to the height so steep walls don't flatten the valley. */
  log: boolean
  lr: number
  /** Default rate for the adaptive methods (Adam, RMSProp), whose step is ≈ lr in parameter units. */
  alr: number
  note: string
}

export const SURFACES: Surface[] = [
  {
    id: 'bowl', name: 'Elongated bowl', log: false, lr: 0.08, alr: 0.05, start: [-4, 2.5], box: [-5, 5, -3.5, 3.5], minima: [[0, 0]],
    f: (x, y) => 0.5 * (0.2 * x * x + 2 * y * y),
    g: (x, y) => [0.2 * x, 2 * y],
    note: 'Ill-conditioned quadratic (curvatures 0.2 vs 2): plain SGD zig-zags across the narrow axis; momentum and Adam fix it.',
  },
  {
    id: 'rosen', name: 'Rosenbrock banana', log: true, lr: 0.0015, alr: 0.05, start: [-1.5, 2], box: [-2, 2, -1, 3], minima: [[1, 1]],
    f: (x, y) => (1 - x) ** 2 + 100 * (y - x * x) ** 2,
    g: (x, y) => [-2 * (1 - x) - 400 * x * (y - x * x), 200 * (y - x * x)],
    note: 'A curved, flat-bottomed valley. Finding the valley is easy; following it to (1, 1) is hard.',
  },
  {
    id: 'himmel', name: 'Himmelblau', log: true, lr: 0.01, alr: 0.05, start: [-0.5, -0.5], box: [-5, 5, -5, 5],
    minima: [[3, 2], [-2.805118, 3.131312], [-3.77931, -3.283186], [3.584428, -1.848126]],
    f: (x, y) => (x * x + y - 11) ** 2 + (x + y * y - 7) ** 2,
    g: (x, y) => [4 * x * (x * x + y - 11) + 2 * (x + y * y - 7), 2 * (x * x + y - 11) + 4 * y * (x + y * y - 7)],
    note: 'Four equal minima: the start point and optimiser decide which basin you land in.',
  },
  {
    id: 'beale', name: 'Beale', log: true, lr: 0.002, alr: 0.05, start: [1, 1.5], box: [-4.5, 4.5, -4.5, 4.5], minima: [[3, 0.5]],
    f: (x, y) => (1.5 - x + x * y) ** 2 + (2.25 - x + x * y * y) ** 2 + (2.625 - x + x * y ** 3) ** 2,
    g: (x, y) => {
      const a = 1.5 - x + x * y, b = 2.25 - x + x * y * y, c = 2.625 - x + x * y ** 3
      return [2 * a * (y - 1) + 2 * b * (y * y - 1) + 2 * c * (y ** 3 - 1), 2 * a * x + 4 * b * x * y + 6 * c * x * y * y]
    },
    note: 'Sharp ridges near the corners and a flat plateau; adaptive methods (RMSProp, Adam) cope much better.',
  },
  {
    id: 'rastrigin', name: 'Rastrigin', log: false, lr: 0.002, alr: 0.05, start: [2.3, 2.6], box: [-4, 4, -4, 4], minima: [[0, 0]],
    f: (x, y) => 20 + x * x - 10 * Math.cos(2 * Math.PI * x) + y * y - 10 * Math.cos(2 * Math.PI * y),
    g: (x, y) => [2 * x + 20 * Math.PI * Math.sin(2 * Math.PI * x), 2 * y + 20 * Math.PI * Math.sin(2 * Math.PI * y)],
    note: 'An egg-crate of local minima: gradient methods settle in the nearest dimple. Try a larger learning rate with momentum or gradient noise to hop between dimples.',
  },
  {
    id: 'saddle', name: 'Saddle point', log: false, lr: 0.05, alr: 0.05, start: [-3, 0.001], box: [-3.5, 3.5, -2, 2], minima: [[0, 1], [0, -1]],
    f: (x, y) => 0.5 * x * x + 0.25 * y ** 4 - 0.5 * y * y + 0.25,
    g: (x, y) => [x, y ** 3 - y],
    note: 'A saddle at the origin between two valleys. Starting almost on the ridge, SGD stalls near the saddle for a long time; Adam rescales the tiny sideways gradient and escapes fast.',
  },
]

export type OptId = 'sgd' | 'momentum' | 'nesterov' | 'rmsprop' | 'adam'
export const OPTIMISERS: { id: OptId; name: string; color: string }[] = [
  { id: 'sgd', name: 'SGD', color: '#f97316' },
  { id: 'momentum', name: 'Momentum', color: '#10b981' },
  { id: 'nesterov', name: 'Nesterov', color: '#0ea5e9' },
  { id: 'rmsprop', name: 'RMSProp', color: '#ec4899' },
  { id: 'adam', name: 'Adam', color: '#a855f7' },
]

export interface Hyper {
  lr: number
  beta: number // momentum coefficient
  beta1: number
  beta2: number
  rho: number // RMSProp decay
  eps: number
  noise: number // gradient noise std (fraction of |g|) to mimic minibatch SGD
}

export const DEF_HYPER: Hyper = { lr: 0.01, beta: 0.9, beta1: 0.9, beta2: 0.999, rho: 0.9, eps: 1e-8, noise: 0 }

/** Deterministic PRNG (mulberry32) so runs are reproducible. */
export function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Runs `steps` iterations of optimiser `opt` from `p0`; returns the path including the start. */
export function runPath(s: Surface, opt: OptId, p0: V2, h: Hyper, steps: number, seed = 1): V2[] {
  const rnd = mulberry(seed)
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd())
  const grad = (x: number, y: number): V2 => {
    const [gx, gy] = s.g(x, y)
    if (!h.noise) return [gx, gy]
    const m = Math.hypot(gx, gy) * h.noise
    return [gx + gauss() * m, gy + gauss() * m]
  }
  let [x, y] = p0
  let vx = 0, vy = 0, mx = 0, my = 0, sx = 0, sy = 0
  const path: V2[] = [[x, y]]
  const lim = 1e6
  for (let t = 1; t <= steps; t++) {
    if (opt === 'nesterov') {
      const [gx, gy] = grad(x + h.beta * vx, y + h.beta * vy)
      vx = h.beta * vx - h.lr * gx
      vy = h.beta * vy - h.lr * gy
      x += vx
      y += vy
    } else {
      const [gx, gy] = grad(x, y)
      if (opt === 'sgd') {
        x -= h.lr * gx
        y -= h.lr * gy
      } else if (opt === 'momentum') {
        vx = h.beta * vx - h.lr * gx
        vy = h.beta * vy - h.lr * gy
        x += vx
        y += vy
      } else if (opt === 'rmsprop') {
        sx = h.rho * sx + (1 - h.rho) * gx * gx
        sy = h.rho * sy + (1 - h.rho) * gy * gy
        x -= (h.lr * gx) / (Math.sqrt(sx) + h.eps)
        y -= (h.lr * gy) / (Math.sqrt(sy) + h.eps)
      } else {
        mx = h.beta1 * mx + (1 - h.beta1) * gx
        my = h.beta1 * my + (1 - h.beta1) * gy
        sx = h.beta2 * sx + (1 - h.beta2) * gx * gx
        sy = h.beta2 * sy + (1 - h.beta2) * gy * gy
        const c1 = 1 - h.beta1 ** t, c2 = 1 - h.beta2 ** t
        x -= (h.lr * (mx / c1)) / (Math.sqrt(sx / c2) + h.eps)
        y -= (h.lr * (my / c1)) / (Math.sqrt(sy / c2) + h.eps)
      }
    }
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > lim || Math.abs(y) > lim) break
    path.push([x, y])
  }
  return path
}

/** Distance from p to the nearest known minimum (Infinity if none). */
export function distToMin(s: Surface, p: V2): number {
  return s.minima.reduce((d, m) => Math.min(d, Math.hypot(p[0] - m[0], p[1] - m[1])), Infinity)
}

/** Height used for display: optionally log-compressed. */
export const height = (s: Surface, v: number) => (s.log ? Math.log1p(Math.max(0, v)) : v)
