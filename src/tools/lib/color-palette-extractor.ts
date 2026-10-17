// Color Palette Extractor: MMCQ (modified median-cut quantization, the algorithm behind
// Color Thief) plus Vibrant-style role swatches. Pure functions over RGBA pixel arrays.
import { hsl, type RGB } from './image-palette-extractor'

const SIG = 5
const SHIFT = 8 - SIG
const idx = (r: number, g: number, b: number) => (r << (2 * SIG)) + (g << SIG) + b

interface VBox { r1: number; r2: number; g1: number; g2: number; b1: number; b2: number; n: number; vol: number }
export interface Swatch { rgb: RGB; count: number; share: number }

function boxStats(b: Omit<VBox, 'n' | 'vol'>, hist: Uint32Array): VBox {
  let n = 0
  for (let r = b.r1; r <= b.r2; r++) for (let g = b.g1; g <= b.g2; g++) for (let bb = b.b1; bb <= b.b2; bb++) n += hist[idx(r, g, bb)]
  return { ...b, n, vol: (b.r2 - b.r1 + 1) * (b.g2 - b.g1 + 1) * (b.b2 - b.b1 + 1) }
}

function avg(b: VBox, hist: Uint32Array): RGB {
  let t = 0, rs = 0, gs = 0, bs = 0
  const m = 1 << SHIFT
  for (let r = b.r1; r <= b.r2; r++)
    for (let g = b.g1; g <= b.g2; g++)
      for (let bb = b.b1; bb <= b.b2; bb++) {
        const h = hist[idx(r, g, bb)]
        t += h
        rs += h * (r + 0.5) * m
        gs += h * (g + 0.5) * m
        bs += h * (bb + 0.5) * m
      }
  if (!t) return [Math.round((m * (b.r1 + b.r2 + 1)) / 2), Math.round((m * (b.g1 + b.g2 + 1)) / 2), Math.round((m * (b.b1 + b.b2 + 1)) / 2)]
  return [Math.min(255, Math.round(rs / t)), Math.min(255, Math.round(gs / t)), Math.min(255, Math.round(bs / t))]
}

/** Splits a box at the weighted median of its longest axis. */
function split(b: VBox, hist: Uint32Array): [VBox, VBox] | null {
  if (b.n <= 1) return null
  const rw = b.r2 - b.r1, gw = b.g2 - b.g1, bw = b.b2 - b.b1
  const mx = Math.max(rw, gw, bw)
  if (mx === 0) return null
  const axis = mx === rw ? 'r' : mx === gw ? 'g' : 'b'
  const lo = b[`${axis}1` as 'r1'], hi = b[`${axis}2` as 'r2']
  const partial: number[] = []
  let total = 0
  for (let i = lo; i <= hi; i++) {
    let s = 0
    for (let x = axis === 'r' ? i : b.r1; x <= (axis === 'r' ? i : b.r2); x++)
      for (let y = axis === 'g' ? i : b.g1; y <= (axis === 'g' ? i : b.g2); y++)
        for (let z = axis === 'b' ? i : b.b1; z <= (axis === 'b' ? i : b.b2); z++) s += hist[idx(x, y, z)]
    total += s
    partial[i] = total
  }
  for (let i = lo; i <= hi; i++) {
    if (partial[i] > total / 2) {
      const left = i - lo, right = hi - i
      let cut = left <= right ? Math.min(hi - 1, ~~(i + right / 2)) : Math.max(lo, ~~(i - 1 - left / 2))
      while (cut > lo && !partial[cut]) cut--
      cut = Math.max(lo, Math.min(hi - 1, cut))
      const a = { ...b, [`${axis}2`]: cut }, c = { ...b, [`${axis}1`]: cut + 1 }
      return [boxStats(a, hist), boxStats(c, hist)]
    }
  }
  return null
}

export interface Opts { step?: number; ignoreWhite?: boolean; ignoreBlack?: boolean; minAlpha?: number }

/** MMCQ palette: up to `k` colors sorted by pixel population. */
export function mmcq(px: Uint8ClampedArray | Uint8Array, k: number, o: Opts = {}): Swatch[] {
  const step = Math.max(1, Math.floor(o.step ?? 1))
  const hist = new Uint32Array(1 << (3 * SIG))
  let rmin = 31, rmax = 0, gmin = 31, gmax = 0, bmin = 31, bmax = 0, used = 0
  for (let i = 0; i < px.length; i += 4 * step) {
    const r = px[i], g = px[i + 1], b = px[i + 2], a = px[i + 3]
    if (a < (o.minAlpha ?? 125)) continue
    if (o.ignoreWhite && r > 245 && g > 245 && b > 245) continue
    if (o.ignoreBlack && r < 10 && g < 10 && b < 10) continue
    const R = r >> SHIFT, G = g >> SHIFT, B = b >> SHIFT
    hist[idx(R, G, B)]++
    used++
    rmin = Math.min(rmin, R); rmax = Math.max(rmax, R)
    gmin = Math.min(gmin, G); gmax = Math.max(gmax, G)
    bmin = Math.min(bmin, B); bmax = Math.max(bmax, B)
  }
  if (!used) return []
  let boxes: VBox[] = [boxStats({ r1: rmin, r2: rmax, g1: gmin, g2: gmax, b1: bmin, b2: bmax }, hist)]
  const iterate = (target: number, key: (b: VBox) => number) => {
    let guard = 0
    while (boxes.length < target && guard++ < 1000) {
      boxes.sort((a, b) => key(b) - key(a))
      const i = boxes.findIndex((b) => split(b, hist) !== null)
      if (i < 0) break
      const parts = split(boxes[i], hist)!
      boxes.splice(i, 1, ...parts.filter((p) => p.n > 0))
    }
  }
  const K = Math.max(1, Math.min(64, Math.round(k)))
  iterate(Math.ceil(K * 0.75), (b) => b.n)
  iterate(K, (b) => b.n * b.vol)
  return boxes
    .filter((b) => b.n > 0)
    .map((b) => ({ rgb: avg(b, hist), count: b.n, share: b.n / used }))
    .sort((a, b) => b.count - a.count)
}

export type Role = 'Vibrant' | 'Light Vibrant' | 'Dark Vibrant' | 'Muted' | 'Light Muted' | 'Dark Muted'
const TARGETS: [Role, number, number, number, number, number][] = [
  // role, target sat, min sat, target luma, min luma, max luma
  ['Vibrant', 1, 0.35, 0.5, 0.3, 0.7],
  ['Light Vibrant', 1, 0.35, 0.74, 0.55, 1],
  ['Dark Vibrant', 1, 0.35, 0.26, 0, 0.45],
  ['Muted', 0.3, 0, 0.5, 0.3, 0.7],
  ['Light Muted', 0.3, 0, 0.74, 0.55, 1],
  ['Dark Muted', 0.3, 0, 0.26, 0, 0.45],
]

/** Picks the best swatch for each Vibrant-style role (each swatch used at most once). */
export function roles(sw: Swatch[]): { role: Role; swatch: Swatch | null }[] {
  const maxPop = Math.max(1, ...sw.map((s) => s.count))
  const taken = new Set<Swatch>()
  return TARGETS.map(([role, ts, minS, tl, minL, maxL]) => {
    let best: Swatch | null = null, bestScore = -Infinity
    for (const s of sw) {
      if (taken.has(s)) continue
      const [, S, L] = hsl(s.rgb).map((v, i) => (i ? v / 100 : v))
      const isVib = ts === 1
      if (L < minL || L > maxL || S < minS || (!isVib && S > 0.4)) continue
      const score = 3 * (1 - Math.abs(S - ts)) + 6 * (1 - Math.abs(L - tl)) + 1 * (s.count / maxPop)
      if (score > bestScore) {
        bestScore = score
        best = s
      }
    }
    if (best) taken.add(best)
    return { role, swatch: best }
  })
}

/** Lightens (t>0, toward white) or darkens (t<0, toward black) a colour. */
export function mix(c: RGB, t: number): RGB {
  const to = t >= 0 ? 255 : 0
  const a = Math.abs(t)
  return c.map((v) => Math.round(v + (to - v) * a)) as RGB
}
