// Region selection (tolerance flood fill, smart brush) and lighting-preserving recolouring in OKLab.
import { linearToOklab, oklabToLinear, toGamma, toLinear, type V3 } from './color-space-explorer'

const LIN = new Float32Array(256).map((_, i) => toLinear(i / 255))

/** Converts RGBA pixels to an interleaved OKLab array (L, a, b per pixel). */
export function toLab(rgba: Uint8ClampedArray): Float32Array {
  const n = rgba.length / 4
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const [L, a, b] = linearToOklab([LIN[rgba[i * 4]], LIN[rgba[i * 4 + 1]], LIN[rgba[i * 4 + 2]]])
    out[i * 3] = L
    out[i * 3 + 1] = a
    out[i * 3 + 2] = b
  }
  return out
}

/** OKLab distance between pixel i and a reference colour, in OKLab units ×100 (≈ ΔE). */
export function dist(lab: Float32Array, i: number, ref: V3): number {
  const dL = lab[i * 3] - ref[0], da = lab[i * 3 + 1] - ref[1], db = lab[i * 3 + 2] - ref[2]
  return Math.sqrt(dL * dL + da * da + db * db) * 100
}

/**
 * 4-connected flood fill from (x, y). A pixel joins when its colour is within `tol` of the seed colour
 * and within `tol` × `stepFactor` of the neighbour it was reached from (stops leaking through soft edges
 * while following gentle lighting gradients). Writes `value` into `mask`; returns the number of pixels set.
 */
export function floodFill(lab: Float32Array, w: number, h: number, x: number, y: number, tol: number, mask: Uint8Array, value: number, stepFactor = 0.6): number {
  if (x < 0 || y < 0 || x >= w || y >= h) return 0
  const s = y * w + x
  const seed: V3 = [lab[s * 3], lab[s * 3 + 1], lab[s * 3 + 2]]
  const seen = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  let sp = 0, count = 0
  stack[sp++] = s
  seen[s] = 1
  const step = tol * stepFactor
  while (sp) {
    const p = stack[--sp]
    mask[p] = value
    count++
    const px = p % w
    const ref: V3 = [lab[p * 3], lab[p * 3 + 1], lab[p * 3 + 2]]
    const tryAdd = (q: number) => {
      if (seen[q]) return
      if (dist(lab, q, seed) <= tol && dist(lab, q, ref) <= step) {
        seen[q] = 1
        stack[sp++] = q
      }
    }
    if (px > 0) tryAdd(p - 1)
    if (px < w - 1) tryAdd(p + 1)
    if (p >= w) tryAdd(p - w)
    if (p < w * (h - 1)) tryAdd(p + w)
  }
  return count
}

/**
 * Paints a disc into the mask. With `smartTol` > 0 only pixels similar to the colour at the centre are
 * affected (edge-aware brush). `value` 0 erases.
 */
export function brush(lab: Float32Array, w: number, h: number, cx: number, cy: number, r: number, mask: Uint8Array, value: number, smartTol = 0) {
  const c = Math.round(cy) * w + Math.round(cx)
  const ref: V3 = [lab[c * 3], lab[c * 3 + 1], lab[c * 3 + 2]]
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue
      const i = y * w + x
      if (smartTol > 0 && value > 0 && dist(lab, i, ref) > smartTol) continue
      mask[i] = value
    }
}

/** Mean OKLab lightness of pixels with mask value `v`. */
export function meanL(lab: Float32Array, mask: Uint8Array, v: number): number {
  let s = 0, n = 0
  for (let i = 0; i < mask.length; i++) if (mask[i] === v) {
    s += lab[i * 3]
    n++
  }
  return n ? s / n : NaN
}

export interface Layer { color: string; strength: number }

export function hexToLab(hex: string): V3 {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0
  return linearToOklab([LIN[(n >> 16) & 255], LIN[(n >> 8) & 255], LIN[n & 255]])
}

/**
 * Recolours masked pixels. Each pixel keeps its lighting relative to the region's mean
 * (L' = L_paint × L / L_mean), takes the paint's hue and chroma (chroma scaled with the shading so shadows
 * don't glow) and blends with the original by the layer strength. `layers[k-1]` applies to mask value k.
 */
export function recolor(src: Uint8ClampedArray, lab: Float32Array, mask: Uint8Array, layers: Layer[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src)
  const info = layers.map((ly, k) => ({ paint: hexToLab(ly.color), mean: meanL(lab, mask, k + 1), s: Math.min(1, Math.max(0, ly.strength)) }))
  for (let i = 0; i < mask.length; i++) {
    const k = mask[i]
    if (!k || k > info.length) continue
    const { paint, mean, s } = info[k - 1]
    if (!(mean > 0)) continue
    const rel = lab[i * 3] / mean
    const L = Math.min(1, paint[0] * rel)
    const cs = Math.min(1.3, rel)
    const lin = oklabToLinear([L, paint[1] * cs, paint[2] * cs])
    for (let c = 0; c < 3; c++) {
      const v = Math.round(Math.min(1, Math.max(0, toGamma(lin[c]))) * 255)
      out[i * 4 + c] = src[i * 4 + c] + (v - src[i * 4 + c]) * s
    }
  }
  return out
}

/** Light reflectance value estimate (0–100): CIE relative luminance Y of the paint colour. */
export function lrv(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0
  return 100 * (0.2126 * LIN[(n >> 16) & 255] + 0.7152 * LIN[(n >> 8) & 255] + 0.0722 * LIN[n & 255])
}
