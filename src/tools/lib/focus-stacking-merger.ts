// Focus stacking, written from scratch: frame alignment (phase correlation on a coarse pyramid level
// with a scale search for focus breathing, then coarse-to-fine NCC refinement on gradient images),
// Laplacian-energy focus maps, per-pixel best-focus selection and Laplacian-pyramid blending.
import { fft } from './noise-reducer'

export interface Img { w: number; h: number; d: Float32Array }
export interface Rgb { w: number; h: number; r: Float32Array; g: Float32Array; b: Float32Array }
export interface Xform { s: number; tx: number; ty: number }

export const toRgb = (px: Uint8ClampedArray, w: number, h: number): Rgb => {
  const n = w * h
  const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    r[i] = px[i * 4]
    g[i] = px[i * 4 + 1]
    b[i] = px[i * 4 + 2]
  }
  return { w, h, r, g, b }
}
export const luma = (c: Rgb): Img => {
  const d = new Float32Array(c.w * c.h)
  for (let i = 0; i < d.length; i++) d[i] = 0.299 * c.r[i] + 0.587 * c.g[i] + 0.114 * c.b[i]
  return { w: c.w, h: c.h, d }
}
export function toRgba(c: Rgb): Uint8ClampedArray {
  const out = new Uint8ClampedArray(c.w * c.h * 4)
  for (let i = 0; i < c.w * c.h; i++) {
    out[i * 4] = c.r[i]
    out[i * 4 + 1] = c.g[i]
    out[i * 4 + 2] = c.b[i]
    out[i * 4 + 3] = 255
  }
  return out
}

/** Separable box blur with clamped edges (running sums), radius r. */
export function boxBlur(a: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return a.slice()
  const tmp = new Float32Array(a.length)
  const out = new Float32Array(a.length)
  const k = 2 * r + 1
  for (let y = 0; y < h; y++) {
    const o = y * w
    let s = 0
    for (let i = -r; i <= r; i++) s += a[o + Math.min(w - 1, Math.max(0, i))]
    for (let x = 0; x < w; x++) {
      tmp[o + x] = s / k
      s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0
    for (let i = -r; i <= r; i++) s += tmp[Math.min(h - 1, Math.max(0, i)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / k
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}

/** 2× downsample with a 2×2 average. */
export function half(a: Img): Img {
  const w = a.w >> 1, h = a.h >> 1
  const d = new Float32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = 2 * y * a.w + 2 * x
      d[y * w + x] = (a.d[i] + a.d[i + 1] + a.d[i + a.w] + a.d[i + a.w + 1]) / 4
    }
  return { w, h, d }
}

/** Gradient magnitude (central differences): robust to the brightness/blur differences between frames. */
export function gradMag(a: Img): Img {
  const { w, h } = a
  const d = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      d[i] = Math.hypot(a.d[i + 1] - a.d[i - 1], a.d[i + w] - a.d[i - w])
    }
  return { w, h, d }
}

const bilinear = (a: Float32Array, w: number, h: number, x: number, y: number) => {
  x = Math.min(w - 1.001, Math.max(0, x))
  y = Math.min(h - 1.001, Math.max(0, y))
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0
  const i = y0 * w + x0
  return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + w] * (1 - fx) + a[i + w + 1] * fx) * fy
}

/** Resamples `src` so that out(p) = src(c + s·(p − c) + t), c = image centre. */
export function warp(src: Float32Array, w: number, h: number, t: Xform): Float32Array {
  const out = new Float32Array(w * h)
  const cx = (w - 1) / 2, cy = (h - 1) / 2
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out[y * w + x] = bilinear(src, w, h, cx + t.s * (x - cx) + t.tx, cy + t.s * (y - cy) + t.ty)
  return out
}
export const warpRgb = (c: Rgb, t: Xform): Rgb => ({ w: c.w, h: c.h, r: warp(c.r, c.w, c.h, t), g: warp(c.g, c.w, c.h, t), b: warp(c.b, c.w, c.h, t) })

/**
 * Phase correlation of two equally sized images (embedded, Hann-windowed, in an N×N power-of-two
 * frame). Returns the shift d such that b(p) ≈ a(p − d) and the normalized peak height.
 */
export function phaseCorrelate(a: Img, b: Img): { dx: number; dy: number; peak: number } {
  let N = 1
  while (N < Math.max(a.w, a.h)) N <<= 1
  const prep = (m: Img) => {
    let mean = 0
    for (const v of m.d) mean += v
    mean /= m.d.length
    const re = new Float64Array(N * N), im = new Float64Array(N * N)
    for (let y = 0; y < m.h; y++) {
      const wy = 0.5 - 0.5 * Math.cos((2 * Math.PI * (y + 0.5)) / m.h)
      for (let x = 0; x < m.w; x++) re[y * N + x] = (m.d[y * m.w + x] - mean) * wy * (0.5 - 0.5 * Math.cos((2 * Math.PI * (x + 0.5)) / m.w))
    }
    fft2(re, im, N, false)
    return [re, im] as const
  }
  const [ar, ai] = prep(a)
  const [br, bi] = prep(b)
  const re = new Float64Array(N * N), im = new Float64Array(N * N)
  for (let i = 0; i < N * N; i++) {
    // B · conj(A): peak lands at +d when b is a shifted by d
    const r = br[i] * ar[i] + bi[i] * ai[i]
    const q = bi[i] * ar[i] - br[i] * ai[i]
    const m = Math.hypot(r, q) || 1
    re[i] = r / m
    im[i] = q / m
  }
  fft2(re, im, N, true)
  let best = 0, bv = -Infinity
  for (let i = 0; i < N * N; i++) if (re[i] > bv) { bv = re[i]; best = i }
  let dx = best % N, dy = Math.floor(best / N)
  if (dx > N / 2) dx -= N
  if (dy > N / 2) dy -= N
  return { dx, dy, peak: bv }
}

function fft2(re: Float64Array, im: Float64Array, N: number, inv: boolean) {
  const r = new Float64Array(N), i = new Float64Array(N)
  for (let y = 0; y < N; y++) {
    r.set(re.subarray(y * N, y * N + N))
    i.set(im.subarray(y * N, y * N + N))
    fft(r, i, inv)
    re.set(r, y * N)
    im.set(i, y * N)
  }
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) { r[y] = re[y * N + x]; i[y] = im[y * N + x] }
    fft(r, i, inv)
    for (let y = 0; y < N; y++) { re[y * N + x] = r[y]; im[y * N + x] = i[y] }
  }
}

/** Normalized cross-correlation of ref and src warped by t, sampled on a grid with step `st`, inside a margin. */
export function ncc(ref: Img, src: Img, t: Xform, st = 2): number {
  const { w, h } = ref
  const cx = (w - 1) / 2, cy = (h - 1) / 2
  const m = Math.round(Math.min(w, h) * 0.06) + 2
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0
  for (let y = m; y < h - m; y += st)
    for (let x = m; x < w - m; x += st) {
      const a = ref.d[y * w + x]
      const b = bilinear(src.d, w, h, cx + t.s * (x - cx) + t.tx, cy + t.s * (y - cy) + t.ty)
      sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; n++
    }
  const va = saa - (sa * sa) / n, vb = sbb - (sb * sb) / n
  return (sab - (sa * sb) / n) / Math.sqrt(Math.max(1e-9, va * vb))
}

/** Estimates the transform aligning `img` to `ref` (scale about the centre + translation). */
export function align(ref: Img, img: Img, maxScale = 0.04): Xform {
  // pyramid of gradient images
  const pr: Img[] = [gradMag(ref)], pi: Img[] = [gradMag(img)]
  let a = ref, b = img
  while (Math.max(a.w, a.h) > 160) {
    a = half(a)
    b = half(b)
    pr.push(gradMag(a))
    pi.push(gradMag(b))
  }
  const L = pr.length - 1
  // coarse: scale search with phase correlation
  let best: Xform = { s: 1, tx: 0, ty: 0 }
  let bp = -Infinity
  const cr = pr[L], ci = pi[L]
  for (let s = 1 - maxScale; s <= 1 + maxScale + 1e-9; s += 0.005) {
    const ws: Img = { w: ci.w, h: ci.h, d: warp(ci.d, ci.w, ci.h, { s, tx: 0, ty: 0 }) }
    const pc = phaseCorrelate(cr, ws)
    const cand: Xform = { s, tx: s * pc.dx, ty: s * pc.dy }
    const score = ncc(cr, ci, cand, 1)
    if (score > bp) { bp = score; best = cand }
  }
  // coarse-to-fine refinement with local search
  for (let l = L; l >= 0; l--) {
    if (l < L) best = { s: best.s, tx: best.tx * 2, ty: best.ty * 2 }
    const R = pr[l], S = pi[l]
    const st = Math.max(1, Math.round(Math.max(R.w, R.h) / 400))
    let cur = ncc(R, S, best, st)
    const ds = l === 0 ? 0.001 : 0.002
    for (let it = 0; it < 8; it++) {
      let moved = false
      for (const [dx, dy, dsc] of NEIGH) {
        const c: Xform = { s: best.s + dsc * ds, tx: best.tx + dx, ty: best.ty + dy }
        const v = ncc(R, S, c, st)
        if (v > cur + 1e-7) { cur = v; best = c; moved = true }
      }
      if (!moved) break
    }
    if (l === 0) {
      // sub-pixel refinement by parabola fit on each axis
      for (const ax of ['tx', 'ty'] as const) {
        const m = ncc(R, S, { ...best, [ax]: best[ax] - 0.5 }, st)
        const p = ncc(R, S, { ...best, [ax]: best[ax] + 0.5 }, st)
        const den = m - 2 * cur + p
        if (den < 0) best = { ...best, [ax]: best[ax] + Math.max(-0.5, Math.min(0.5, (0.5 * 0.5 * (m - p)) / den)) }
      }
    }
  }
  return best
}
const NEIGH: [number, number, number][] = []
for (const dsc of [0, -1, 1]) for (const dy of [0, -1, 1]) for (const dx of [0, -1, 1]) if (dx || dy || dsc) NEIGH.push([dx, dy, dsc])

/** Laplacian energy (squared 4-neighbour Laplacian), smoothed twice with a box of radius r. */
export function focusMap(g: Img, r: number): Float32Array {
  const { w, h } = g
  const e = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const l = 4 * g.d[i] - g.d[i - 1] - g.d[i + 1] - g.d[i - w] - g.d[i + w]
      e[i] = l * l
    }
  return boxBlur(boxBlur(e, w, h, r), w, h, r)
}

/** Index of the sharpest frame per pixel, and a 0..1 confidence (best vs. second best). */
export function selectSharpest(maps: Float32Array[]): { idx: Uint8Array; conf: Float32Array } {
  const n = maps[0].length
  const idx = new Uint8Array(n)
  const conf = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let b = 0, bv = -1, sv = -1
    for (let k = 0; k < maps.length; k++) {
      const v = maps[k][i]
      if (v > bv) { sv = bv; bv = v; b = k } else if (v > sv) sv = v
    }
    idx[i] = b
    conf[i] = bv > 0 ? 1 - Math.max(0, sv) / bv : 0
  }
  return { idx, conf }
}

// ---------- Laplacian pyramid blending ----------
function down(a: Img): Img {
  const s = blur5(a)
  const w = Math.ceil(a.w / 2), h = Math.ceil(a.h / 2)
  const d = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = s.d[2 * y * a.w + 2 * x]
  return { w, h, d }
}
function up(a: Img, w: number, h: number): Img {
  const d = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = bilinear(a.d, a.w, a.h, (x - 0.5) / 2 + 0.25, (y - 0.5) / 2 + 0.25)
  return { w, h, d }
}
function blur5(a: Img): Img {
  const k = [1, 4, 6, 4, 1]
  const { w, h } = a
  const t = new Float32Array(w * h), d = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0
    for (let j = -2; j <= 2; j++) s += k[j + 2] * a.d[y * w + Math.min(w - 1, Math.max(0, x + j))]
    t[y * w + x] = s / 16
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0
    for (let j = -2; j <= 2; j++) s += k[j + 2] * t[Math.min(h - 1, Math.max(0, y + j)) * w + x]
    d[y * w + x] = s / 16
  }
  return { w, h, d }
}
function gaussPyr(a: Img, levels: number): Img[] {
  const p = [a]
  for (let i = 1; i < levels; i++) p.push(down(p[i - 1]))
  return p
}
function lapPyr(a: Img, levels: number): Img[] {
  const g = gaussPyr(a, levels)
  return g.map((gi, i) => {
    if (i === levels - 1) return gi
    const u = up(g[i + 1], gi.w, gi.h)
    const d = new Float32Array(gi.d.length)
    for (let k = 0; k < d.length; k++) d[k] = gi.d[k] - u.d[k]
    return { w: gi.w, h: gi.h, d }
  })
}

/** Blends channels of frames with per-frame weight maps (normalized per pixel) in a Laplacian pyramid. */
export function pyramidBlend(chans: Float32Array[], weights: Float32Array[], w: number, h: number, levels = 5): Float32Array {
  levels = Math.max(1, Math.min(levels, Math.floor(Math.log2(Math.min(w, h))) - 2))
  const wp = weights.map((x) => gaussPyr({ w, h, d: x }, levels))
  const lp = chans.map((c) => lapPyr({ w, h, d: c }, levels))
  const out: Img[] = []
  for (let l = 0; l < levels; l++) {
    const { w: lw, h: lh } = lp[0][l]
    const d = new Float32Array(lw * lh)
    for (let i = 0; i < d.length; i++) {
      let s = 0, ws = 0
      for (let k = 0; k < chans.length; k++) {
        const wv = wp[k][l].d[i]
        s += wv * lp[k][l].d[i]
        ws += wv
      }
      d[i] = ws > 1e-9 ? s / ws : lp[0][l].d[i]
    }
    out.push({ w: lw, h: lh, d })
  }
  let cur = out[levels - 1]
  for (let l = levels - 2; l >= 0; l--) {
    const u = up(cur, out[l].w, out[l].h)
    for (let i = 0; i < u.d.length; i++) u.d[i] += out[l].d[i]
    cur = u
  }
  return cur.d
}

/** One-hot masks from the index map (optionally softened). */
export function masks(idx: Uint8Array, n: number, w: number, h: number, soften: number): Float32Array[] {
  return Array.from({ length: n }, (_, k) => {
    const m = new Float32Array(idx.length)
    for (let i = 0; i < idx.length; i++) m[i] = idx[i] === k ? 1 : 0
    return soften > 0 ? boxBlur(m, w, h, soften) : m
  })
}
