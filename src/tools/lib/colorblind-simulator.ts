// Color vision deficiency simulation: Machado et al. 2009 and Brettel et al. 1997 (DaltonLens constants), in linear RGB.

export type Cvd = 'protan' | 'deutan' | 'tritan' | 'achroma'
export type Algo = 'machado' | 'brettel'
type M3 = number[] // row-major 3×3

export const CVD_INFO: Record<Cvd, [string, string, string]> = {
  protan: ['Protan', 'red cones (L)', '≈1% of men'],
  deutan: ['Deutan', 'green cones (M)', '≈5% of men'],
  tritan: ['Tritan', 'blue cones (S)', '≈0.01%'],
  achroma: ['Achromatopsia', 'no cone colour vision', '≈0.003%'],
}

// Machado 2009, severity 1.0 (dichromacy)
const MACHADO: Record<'protan' | 'deutan' | 'tritan', M3> = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
}

// Brettel 1997: two half-plane projections chosen by the sign of dot(rgb, normal)
export const BRETTEL: Record<'protan' | 'deutan' | 'tritan', { m1: M3; m2: M3; n: [number, number, number] }> = {
  protan: { m1: [0.1498, 1.19548, -0.34528, 0.10764, 0.84864, 0.04372, 0.00384, -0.0054, 1.00156], m2: [0.1457, 1.16172, -0.30742, 0.10816, 0.85291, 0.03892, 0.00386, -0.00524, 1.00139], n: [0.00048, 0.00393, -0.00441] },
  deutan: { m1: [0.36477, 0.86381, -0.22858, 0.26294, 0.64245, 0.09462, -0.02006, 0.02728, 0.99278], m2: [0.37298, 0.88166, -0.25464, 0.25954, 0.63506, 0.1054, -0.0198, 0.02784, 0.99196], n: [-0.00281, -0.00611, 0.00892] },
  tritan: { m1: [1.01277, 0.13548, -0.14826, -0.01243, 0.86812, 0.14431, 0.07589, 0.805, 0.11911], m2: [0.93678, 0.18979, -0.12657, 0.06154, 0.81526, 0.1232, -0.37562, 1.12767, 0.24796], n: [0.03901, -0.02788, -0.01113] },
}

const LUMA: M3 = [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722]
const I: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

/** Blend identity → full-deficiency matrix by severity (0..1). */
export const blend = (m: M3, sev: number): M3 => m.map((x, i) => I[i] + (x - I[i]) * sev)

/** Matrix (or pair for Brettel) used for a deficiency. */
export function matrices(cvd: Cvd, algo: Algo, sev: number): { m1: M3; m2: M3; n: [number, number, number] } {
  if (cvd === 'achroma') return { m1: blend(LUMA, sev), m2: blend(LUMA, sev), n: [0, 0, 0] }
  if (algo === 'machado') {
    const m = blend(MACHADO[cvd], sev)
    return { m1: m, m2: m, n: [0, 0, 0] }
  }
  const b = BRETTEL[cvd]
  return { m1: blend(b.m1, sev), m2: blend(b.m2, sev), n: b.n }
}

export const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
export const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Simulate one sRGB color (0–255 channels). */
export function simulate(rgb: [number, number, number], cvd: Cvd, algo: Algo, sev = 1): [number, number, number] {
  const { m1, m2, n } = matrices(cvd, algo, sev)
  const l = rgb.map((c) => toLin(c / 255))
  const m = l[0] * n[0] + l[1] * n[1] + l[2] * n[2] >= 0 ? m1 : m2
  return [0, 1, 2].map((r) => Math.round(255 * toSrgb(clamp01(m[3 * r] * l[0] + m[3 * r + 1] * l[1] + m[3 * r + 2] * l[2])))) as [number, number, number]
}

/** Apply to RGBA pixel data in place (CPU fallback). */
export function simulatePixels(d: Uint8ClampedArray, cvd: Cvd, algo: Algo, sev: number) {
  const { m1, m2, n } = matrices(cvd, algo, sev)
  const lut = new Float32Array(256).map((_, i) => toLin(i / 255))
  for (let i = 0; i < d.length; i += 4) {
    const r = lut[d[i]], g = lut[d[i + 1]], b = lut[d[i + 2]]
    const m = r * n[0] + g * n[1] + b * n[2] >= 0 ? m1 : m2
    d[i] = 255 * toSrgb(clamp01(m[0] * r + m[1] * g + m[2] * b))
    d[i + 1] = 255 * toSrgb(clamp01(m[3] * r + m[4] * g + m[5] * b))
    d[i + 2] = 255 * toSrgb(clamp01(m[6] * r + m[7] * g + m[8] * b))
  }
}

export function hexToRgb(h: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim())
  if (!m) return null
  const s = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number]
}
export const rgbToHex = (c: number[]) => `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`

/** CIELAB (D65) of an sRGB color. */
export function lab(rgb: [number, number, number]): [number, number, number] {
  const [r, g, b] = rgb.map((c) => toLin(c / 255))
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
}

/** CIE76 colour difference. ~2.3 is a just-noticeable difference; < 10 is hard to tell apart in charts. */
export const deltaE = (a: [number, number, number], b: [number, number, number]) => {
  const p = lab(a), q = lab(b)
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

/** Closest pair in a palette (indices and ΔE). */
export function closestPair(colors: [number, number, number][]): [number, number, number] {
  let best: [number, number, number] = [-1, -1, Infinity]
  for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
    const d = deltaE(colors[i], colors[j])
    if (d < best[2]) best = [i, j, d]
  }
  return best
}
