// Size planning and Lanczos-3 resampling for the Batch Image Resizer.

export type Mode = 'exact' | 'fit' | 'width' | 'height' | 'percent'
export type Fit = 'stretch' | 'contain' | 'cover'

export interface SizeOpts {
  mode: Mode
  w: number
  h: number
  pct: number
  fit: Fit
  noUpscale: boolean
}

/** Where to read from the source (crop) and where to draw it on the output canvas. */
export interface Plan {
  outW: number
  outH: number
  sx: number
  sy: number
  sw: number
  sh: number
  dx: number
  dy: number
  dw: number
  dh: number
}

const R = (x: number) => Math.max(1, Math.round(x))

export function planSize(W: number, H: number, o: SizeOpts): Plan {
  const full = (outW: number, outH: number): Plan => ({ outW, outH, sx: 0, sy: 0, sw: W, sh: H, dx: 0, dy: 0, dw: outW, dh: outH })
  const cap = (s: number) => (o.noUpscale ? Math.min(1, s) : s)
  if (o.mode === 'percent') { const s = cap(o.pct / 100); return full(R(W * s), R(H * s)) }
  if (o.mode === 'width') { const s = cap(o.w / W); return full(R(W * s), R(H * s)) }
  if (o.mode === 'height') { const s = cap(o.h / H); return full(R(W * s), R(H * s)) }
  if (o.mode === 'fit') { const s = cap(Math.min(o.w / W, o.h / H)); return full(R(W * s), R(H * s)) }
  // exact output size
  const tw = R(o.w), th = R(o.h)
  if (o.fit === 'stretch') return full(tw, th)
  if (o.fit === 'contain') {
    const s = cap(Math.min(tw / W, th / H))
    const dw = R(W * s), dh = R(H * s)
    return { outW: tw, outH: th, sx: 0, sy: 0, sw: W, sh: H, dx: Math.floor((tw - dw) / 2), dy: Math.floor((th - dh) / 2), dw, dh }
  }
  // cover: crop the centre of the source to the target aspect ratio
  const ar = tw / th
  let sw = W, sh = H
  if (W / H > ar) sw = H * ar
  else sh = W / ar
  sw = R(sw); sh = R(sh)
  const s = cap(Math.min(tw / sw, th / sh))
  const dw = R(sw * s), dh = R(sh * s)
  return { outW: o.noUpscale ? dw : tw, outH: o.noUpscale ? dh : th, sx: Math.floor((W - sw) / 2), sy: Math.floor((H - sh) / 2), sw, sh, dx: 0, dy: 0, dw, dh }
}

const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x))
export const lanczos = (x: number, a = 3) => (Math.abs(x) < a ? sinc(x) * sinc(x / a) : 0)

interface Taps { idx: Int32Array; w: Float32Array; n: number }

/** Per-output-pixel filter taps (normalised) for a 1-D resize from `src` to `dst` samples. */
export function taps(src: number, dst: number, a = 3): Taps {
  const scale = src / dst
  const fs = Math.max(1, scale)
  const support = a * fs
  const n = Math.ceil(support) * 2 + 1
  const idx = new Int32Array(dst * n)
  const w = new Float32Array(dst * n)
  for (let i = 0; i < dst; i++) {
    const c = (i + 0.5) * scale - 0.5
    const lo = Math.floor(c - support) + 1
    let sum = 0
    for (let k = 0; k < n; k++) {
      const j = lo + k
      const v = lanczos((j - c) / fs, a)
      idx[i * n + k] = Math.min(src - 1, Math.max(0, j))
      w[i * n + k] = v
      sum += v
    }
    for (let k = 0; k < n; k++) w[i * n + k] /= sum || 1
  }
  return { idx, w, n }
}

/** High-quality Lanczos-3 resize of RGBA pixels (alpha-premultiplied internally). */
export function resampleRGBA(data: Uint8ClampedArray, W: number, H: number, dw: number, dh: number): Uint8ClampedArray {
  const src = new Float32Array(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    const a = data[i * 4 + 3] / 255
    src[i * 4] = data[i * 4] * a
    src[i * 4 + 1] = data[i * 4 + 1] * a
    src[i * 4 + 2] = data[i * 4 + 2] * a
    src[i * 4 + 3] = data[i * 4 + 3]
  }
  const tx = taps(W, dw)
  const tmp = new Float32Array(dw * H * 4)
  for (let y = 0; y < H; y++) {
    const row = y * W
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, al = 0
      for (let k = 0; k < tx.n; k++) {
        const wt = tx.w[x * tx.n + k]
        if (!wt) continue
        const p = (row + tx.idx[x * tx.n + k]) * 4
        r += src[p] * wt; g += src[p + 1] * wt; b += src[p + 2] * wt; al += src[p + 3] * wt
      }
      const o = (y * dw + x) * 4
      tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = al
    }
  }
  const ty = taps(H, dh)
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, al = 0
      for (let k = 0; k < ty.n; k++) {
        const wt = ty.w[y * ty.n + k]
        if (!wt) continue
        const p = (ty.idx[y * ty.n + k] * dw + x) * 4
        r += tmp[p] * wt; g += tmp[p + 1] * wt; b += tmp[p + 2] * wt; al += tmp[p + 3] * wt
      }
      const o = (y * dw + x) * 4
      const a = Math.min(255, Math.max(0, al)) / 255
      out[o] = a > 0 ? r / a : 0
      out[o + 1] = a > 0 ? g / a : 0
      out[o + 2] = a > 0 ? b / a : 0
      out[o + 3] = al
    }
  }
  return out
}

/** File name from a pattern with {name} {w} {h} {n} tokens. */
export function applyPattern(pattern: string, name: string, w: number, h: number, n: number, ext: string): string {
  const base = name.replace(/\.[^.]+$/, '')
  const out = (pattern.trim() || '{name}').replace(/\{name\}/g, base).replace(/\{w\}/g, String(w)).replace(/\{h\}/g, String(h)).replace(/\{n\}/g, String(n).padStart(2, '0'))
  return `${out.replace(/[\\/:*?"<>|]/g, '_')}.${ext}`
}
