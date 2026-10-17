// Classical background removal: border colour model + flood fill, GrabCut-like iterative
// colour-model refinement with smoothing, user keep/remove strokes, island cleanup and feathering.
// Works on RGBA pixel arrays so it runs (and is tested) without a DOM.

export interface BgOptions {
  mode: 'auto' | 'key'
  tolerance: number // ΔE (Lab distance) for the flood fill / colour key
  iterations: number // colour-model refinement passes (0 = flood fill only)
  smooth: number // smoothing radius for the refinement score (px)
  feather: number // alpha blur radius (px)
  holes: boolean // also remove background visible through enclosed gaps
  key: [number, number, number] // RGB key colour for 'key' mode
}

export const DEFAULT_BG: BgOptions = { mode: 'auto', tolerance: 18, iterations: 3, smooth: 1, feather: 1.5, holes: true, key: [0, 177, 64] }

/** Constraint map values: 0 = free, 1 = keep (foreground), 2 = remove (background). */
export type Hints = Uint8Array

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const R = lin(r), G = lin(g), B = lin(b)
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047)
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722)
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

export function toLab(px: Uint8ClampedArray | Uint8Array, n: number): Float32Array {
  const out = new Float32Array(n * 3)
  const cache = new Map<number, [number, number, number]>()
  for (let i = 0; i < n; i++) {
    // quantise to 5 bits/channel for the cache key; exact conversion is still used
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]
    const key = (r << 16) | (g << 8) | b
    let l = cache.get(key)
    if (!l) {
      l = rgbToLab(r, g, b)
      if (cache.size < 200000) cache.set(key, l)
    }
    out[i * 3] = l[0]
    out[i * 3 + 1] = l[1]
    out[i * 3 + 2] = l[2]
  }
  return out
}

const d2 = (a: Float32Array, i: number, c: number[], j: number) => {
  const x = a[i] - c[j], y = a[i + 1] - c[j + 1], z = a[i + 2] - c[j + 2]
  return x * x + y * y + z * z
}

/** k-means (k-means++ seeding with a fixed pseudo-random sequence) over the given pixel indices. */
export function kmeans(lab: Float32Array, idx: number[], k: number, iters = 8, minFrac = 0): number[] {
  if (!idx.length) return []
  const step = Math.max(1, Math.floor(idx.length / 6000))
  const s = idx.filter((_, i) => i % step === 0)
  let seed = 12345
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296)
  const c: number[] = [...lab.slice(s[0] * 3, s[0] * 3 + 3)]
  const dist = new Float64Array(s.length).fill(Infinity)
  while (c.length / 3 < Math.min(k, s.length)) {
    let sum = 0
    const last = c.length - 3
    for (let i = 0; i < s.length; i++) {
      dist[i] = Math.min(dist[i], d2(lab, s[i] * 3, c, last))
      sum += dist[i]
    }
    if (sum === 0) break
    const t = rnd() * sum
    let pick = 0
    for (let run = dist[0]; pick < s.length - 1 && run < t; run += dist[++pick]);
    c.push(lab[s[pick] * 3], lab[s[pick] * 3 + 1], lab[s[pick] * 3 + 2])
  }
  const kk = c.length / 3
  let acc = new Float64Array(kk * 4)
  for (let it = 0; it < iters; it++) {
    acc = new Float64Array(kk * 4)
    for (const p of s) {
      let best = 0, bd = Infinity
      for (let j = 0; j < kk; j++) {
        const dd = d2(lab, p * 3, c, j * 3)
        if (dd < bd) {
          bd = dd
          best = j
        }
      }
      acc[best * 4] += lab[p * 3]
      acc[best * 4 + 1] += lab[p * 3 + 1]
      acc[best * 4 + 2] += lab[p * 3 + 2]
      acc[best * 4 + 3]++
    }
    for (let j = 0; j < kk; j++) if (acc[j * 4 + 3]) for (let q = 0; q < 3; q++) c[j * 3 + q] = acc[j * 4 + q] / acc[j * 4 + 3]
  }
  if (!minFrac || !iters) return c
  // drop clusters that only explain a few outliers (keeps a stray pixel from poisoning the model)
  const keep = c.filter((_, i) => acc[Math.floor(i / 3) * 4 + 3] >= minFrac * s.length)
  return keep.length ? keep : c
}

export function nearest(lab: Float32Array, i: number, c: number[]): number {
  let bd = Infinity
  for (let j = 0; j < c.length; j += 3) bd = Math.min(bd, d2(lab, i * 3, c, j))
  return Math.sqrt(bd)
}

function borderIdx(w: number, h: number, band: number): number[] {
  const out: number[] = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < band || y < band || x >= w - band || y >= h - band) out.push(y * w + x)
  return out
}

/** Background mask (1 = background) by flood fill from the border through background-like pixels. */
export function floodFromEdges(lab: Float32Array, w: number, h: number, bg: number[], tol: number, hints?: Hints): Uint8Array {
  const m = new Uint8Array(w * h)
  const q = new Int32Array(w * h)
  let head = 0, tail = 0
  const ok = (i: number) => !m[i] && hints?.[i] !== 1 && (hints?.[i] === 2 || nearest(lab, i, bg) <= tol)
  for (const i of borderIdx(w, h, 1))
    if (ok(i)) {
      m[i] = 1
      q[tail++] = i
    }
  while (head < tail) {
    const i = q[head++]
    const x = i % w
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < w * h && ok(j)) {
        m[j] = 1
        q[tail++] = j
      }
  }
  if (hints) for (let i = 0; i < m.length; i++) if (hints[i] === 2) m[i] = 1
  return m
}

/** Separable box blur of a float field (in place copy returned). */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const R = Math.round(r)
  if (R < 1) return src.slice()
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    let acc = 0
    for (let x = -R; x <= R; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / (2 * R + 1)
      acc += src[y * w + Math.min(w - 1, x + R + 1)] - src[y * w + Math.max(0, x - R)]
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = -R; y <= R; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * R + 1)
      acc += tmp[Math.min(h - 1, y + R + 1) * w + x] - tmp[Math.max(0, y - R) * w + x]
    }
  }
  return out
}

/** Connected components of value `v` in mask (4-neighbour); returns label array and sizes, plus whether each touches the border. */
export function components(m: Uint8Array, w: number, h: number, v: number): { lab: Int32Array; size: number[]; border: boolean[] } {
  const lab = new Int32Array(w * h).fill(-1)
  const size: number[] = [], border: boolean[] = []
  const q = new Int32Array(w * h)
  for (let s = 0; s < m.length; s++) {
    if (m[s] !== v || lab[s] >= 0) continue
    const id = size.length
    let head = 0, tail = 0, n = 0, b = false
    q[tail++] = s
    lab[s] = id
    while (head < tail) {
      const i = q[head++]
      n++
      const x = i % w, y = (i / w) | 0
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) b = true
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && m[j] === v && lab[j] < 0) {
          lab[j] = id
          q[tail++] = j
        }
    }
    size.push(n)
    border.push(b)
  }
  return { lab, size, border }
}

/** Returns the background mask (1 = background) after all steps, before feathering. */
export function segment(px: Uint8ClampedArray | Uint8Array, w: number, h: number, o: BgOptions, hints?: Hints): Uint8Array {
  const n = w * h
  const lab = toLab(px, n)
  let bg: Uint8Array
  if (o.mode === 'key') {
    const k = rgbToLab(...o.key)
    bg = new Uint8Array(n)
    for (let i = 0; i < n; i++) bg[i] = hints?.[i] === 1 ? 0 : hints?.[i] === 2 ? 1 : nearest(lab, i, k) <= o.tolerance * 2 ? 1 : 0
    return bg
  }
  const bgModel = kmeans(lab, borderIdx(w, h, Math.max(2, Math.round(Math.min(w, h) * 0.02))), 6)
  bg = floodFromEdges(lab, w, h, bgModel, o.tolerance, hints)
  for (let it = 0; it < o.iterations; it++) {
    const fgIdx: number[] = [], bgIdx: number[] = []
    for (let i = 0; i < n; i++) (bg[i] ? bgIdx : fgIdx).push(i)
    if (fgIdx.length < 20 || bgIdx.length < 20) break
    const F = kmeans(lab, fgIdx, 6, 5, 0.04), B = kmeans(lab, bgIdx, 6, 5, 0.04)
    const score = new Float32Array(n)
    for (let i = 0; i < n; i++) score[i] = Math.max(-30, Math.min(30, nearest(lab, i, B) - nearest(lab, i, F)))
    const sm = boxBlur(score, w, h, o.smooth)
    for (let i = 0; i < n; i++) bg[i] = hints?.[i] === 1 ? 0 : hints?.[i] === 2 ? 1 : sm[i] > 0 ? 0 : 1
  }
  // keep foreground blobs of meaningful size
  const fc = components(bg, w, h, 0)
  const big = Math.max(0, ...fc.size)
  for (let i = 0; i < n; i++) if (fc.lab[i] >= 0 && fc.size[fc.lab[i]] < Math.max(16, big * 0.02) && hints?.[i] !== 1) bg[i] = 1
  // background regions not touching the border: holes. Small ones are filled; large ones only removed when `holes`.
  const bc = components(bg, w, h, 1)
  for (let i = 0; i < n; i++) {
    const id = bc.lab[i]
    if (id >= 0 && !bc.border[id] && hints?.[i] !== 2 && (!o.holes || bc.size[id] < n * 0.002)) bg[i] = 0
  }
  return bg
}

/** Alpha (0..255) from a background mask, with feathered edges. */
export function alphaFrom(bg: Uint8Array, w: number, h: number, feather: number): Uint8ClampedArray {
  const f = new Float32Array(bg.length)
  for (let i = 0; i < bg.length; i++) f[i] = bg[i] ? 0 : 1
  const b = boxBlur(f, w, h, feather)
  const out = new Uint8ClampedArray(bg.length)
  for (let i = 0; i < bg.length; i++) out[i] = Math.round(b[i] * 255)
  return out
}

/** Remove background colour spill from semi-transparent edge pixels: F = (C − (1−α)B) / α. */
export function decontaminate(px: Uint8ClampedArray, alpha: Uint8ClampedArray, bgRgb: [number, number, number]): void {
  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i] / 255
    if (a <= 0.05 || a >= 0.98) continue
    for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.max(0, Math.min(255, (px[i * 4 + c] - (1 - a) * bgRgb[c]) / a))
  }
}

/** Mean colour of the border band (used as the spill colour). */
export function borderColour(px: Uint8ClampedArray | Uint8Array, w: number, h: number): [number, number, number] {
  const s = [0, 0, 0]
  const idx = borderIdx(w, h, 2)
  for (const i of idx) for (let c = 0; c < 3; c++) s[c] += px[i * 4 + c]
  return s.map((v) => Math.round(v / idx.length)) as [number, number, number]
}
