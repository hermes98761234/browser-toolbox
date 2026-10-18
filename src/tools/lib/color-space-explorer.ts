// Colour conversions written for this tool: sRGB ↔ linear ↔ XYZ (D65) ↔ CIELAB / OKLab / OKLCH,
// plus HSL and HSV, Display-P3 and gamut tests. OKLab matrices follow Björn Ottosson's published
// definition of the space (2020).

export type V3 = [number, number, number]

const mul = (m: number[][], v: V3): V3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
]

export const toLinear = (c: number) => (Math.abs(c) <= 0.04045 ? c / 12.92 : Math.sign(c) * ((Math.abs(c) + 0.055) / 1.055) ** 2.4)
export const toGamma = (c: number) => (Math.abs(c) <= 0.0031308 ? c * 12.92 : Math.sign(c) * (1.055 * Math.abs(c) ** (1 / 2.4) - 0.055))

const SRGB_TO_XYZ = [
  [0.4123907992659595, 0.357584339383878, 0.1804807884018343],
  [0.21263900587151036, 0.715168678767756, 0.07219231536073371],
  [0.01933081871559185, 0.11919477979462598, 0.9505321522496606],
]
const XYZ_TO_SRGB = [
  [3.2409699419045213, -1.5373831775700935, -0.4986107602930033],
  [-0.9692436362808798, 1.8759675015077206, 0.04155505740717561],
  [0.05563007969699361, -0.20397695888897657, 1.0569715142428786],
]
const P3_TO_XYZ = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0, 0.04511338185890264, 1.043944368900976],
]
const XYZ_TO_P3 = [
  [2.493496911941425, -0.9313836179191239, -0.40271078445071684],
  [-0.8294889695615747, 1.7626640603183463, 0.023624685841943577],
  [0.03584583024378447, -0.07617238926804182, 0.9568845240076872],
]

export const srgbToLinear = (c: V3): V3 => [toLinear(c[0]), toLinear(c[1]), toLinear(c[2])]
export const linearToSrgb = (c: V3): V3 => [toGamma(c[0]), toGamma(c[1]), toGamma(c[2])]
export const linearToXyz = (c: V3) => mul(SRGB_TO_XYZ, c)
export const xyzToLinear = (c: V3) => mul(XYZ_TO_SRGB, c)
export const p3LinearToXyz = (c: V3) => mul(P3_TO_XYZ, c)
export const xyzToP3Linear = (c: V3) => mul(XYZ_TO_P3, c)

// CIELAB relative to D65 (white point taken from the matrix so neutrals map exactly to a = b = 0)
export const WHITE_D65: V3 = mul(SRGB_TO_XYZ, [1, 1, 1])
const EPS = 216 / 24389, KAPPA = 24389 / 27
export function xyzToLab([x, y, z]: V3): V3 {
  const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116)
  const fx = f(x / WHITE_D65[0]), fy = f(y / WHITE_D65[1]), fz = f(z / WHITE_D65[2])
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
export function labToXyz([L, a, b]: V3): V3 {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200
  const inv = (f: number) => (f ** 3 > EPS ? f ** 3 : (116 * f - 16) / KAPPA)
  return [inv(fx) * WHITE_D65[0], (L > KAPPA * EPS ? fy ** 3 : L / KAPPA) * WHITE_D65[1], inv(fz) * WHITE_D65[2]]
}

// OKLab (from linear sRGB)
const LMS = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
]
const LMS_TO_LAB = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
]
const LAB_TO_LMS = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
]
const LMS_TO_LIN = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
]
export function linearToOklab(c: V3): V3 {
  const l = mul(LMS, c).map(Math.cbrt) as V3
  return mul(LMS_TO_LAB, l)
}
export function oklabToLinear(c: V3): V3 {
  const l = mul(LAB_TO_LMS, c).map((v) => v * v * v) as V3
  return mul(LMS_TO_LIN, l)
}
export function labToLch([L, a, b]: V3): V3 {
  const C = Math.hypot(a, b)
  let h = (Math.atan2(b, a) * 180) / Math.PI
  if (h < 0) h += 360
  return [L, C, C < 1e-9 ? 0 : h]
}
export const lchToLab = ([L, C, h]: V3): V3 => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)]

// HSL / HSV (h in degrees, s/l/v in 0..1)
export function rgbToHsl([r, g, b]: V3): V3 {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  const l = (mx + mn) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return [hue(r, g, b, mx, d), s, l]
}
export function rgbToHsv([r, g, b]: V3): V3 {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  return [hue(r, g, b, mx, d), mx === 0 ? 0 : d / mx, mx]
}
function hue(r: number, g: number, b: number, mx: number, d: number) {
  if (d === 0) return 0
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}
export function hslToRgb([h, s, l]: V3): V3 {
  const c = (1 - Math.abs(2 * l - 1)) * s
  return fromChroma(h, c, l - c / 2)
}
export function hsvToRgb([h, s, v]: V3): V3 {
  const c = v * s
  return fromChroma(h, c, v - c)
}
function fromChroma(h: number, c: number, m: number): V3 {
  const hp = (((h % 360) + 360) % 360) / 60, x = c * (1 - Math.abs((hp % 2) - 1))
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  return [r + m, g + m, b + m]
}

// hex helpers
export function parseHex(s: string): V3 | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim())
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as V3
}
export const toHex = (c: V3) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')

export const inGamut = (lin: V3, eps = 1e-4) => lin.every((v) => v >= -eps && v <= 1 + eps)

/** All representations of an sRGB colour (components 0..1). */
export function describe(rgb: V3) {
  const lin = srgbToLinear(rgb)
  const xyz = linearToXyz(lin)
  const lab = xyzToLab(xyz)
  const ok = linearToOklab(lin)
  return { rgb, lin, xyz, lab, lch: labToLch(lab), oklab: ok, oklch: labToLch(ok), hsl: rgbToHsl(rgb), hsv: rgbToHsv(rgb) }
}

export type Space = 'rgb' | 'hsl' | 'hsv' | 'oklab' | 'lab'

/** 3-D scene position (y = lightness/value) for a linear-sRGB-or-XYZ colour in the chosen space. */
export function position(space: Space, xyz: V3): V3 {
  const lin = xyzToLinear(xyz)
  switch (space) {
    case 'rgb': {
      const s = linearToSrgb(lin)
      return [(s[0] - 0.5) * 4, (s[1] - 0.5) * 4, (s[2] - 0.5) * 4]
    }
    case 'hsl': {
      const [h, sat, l] = rgbToHsl(linearToSrgb(lin))
      const a = (h * Math.PI) / 180
      return [2 * sat * Math.cos(a), (l - 0.5) * 4, -2 * sat * Math.sin(a)]
    }
    case 'hsv': {
      const [h, sat, v] = rgbToHsv(linearToSrgb(lin))
      const a = (h * Math.PI) / 180
      return [2 * sat * v * Math.cos(a), (v - 0.5) * 4, -2 * sat * v * Math.sin(a)]
    }
    case 'oklab': {
      const [L, A, B] = linearToOklab(lin)
      return [A * 6, (L - 0.5) * 4, -B * 6]
    }
    case 'lab': {
      const [L, A, B] = xyzToLab(xyz)
      return [A / 40, (L / 100 - 0.5) * 4, -B / 40]
    }
  }
}

/** Grid lines over the six faces of a gamut cube given a linear → XYZ matrix function. */
export function gamutLines(toXyz: (lin: V3) => V3, n = 8, steps = 24): V3[][] {
  const lines: V3[][] = []
  for (let axis = 0; axis < 3; axis++)
    for (const side of [0, 1]) {
      for (let i = 0; i <= n; i++) {
        const u = i / n
        for (const dir of [0, 1]) {
          const line: V3[] = []
          for (let k = 0; k <= steps; k++) {
            const t = k / steps
            const c: V3 = [0, 0, 0]
            c[axis] = side
            c[(axis + 1) % 3] = dir ? u : t
            c[(axis + 2) % 3] = dir ? t : u
            line.push(toXyz(srgbToLinear(c)))
          }
          lines.push(line)
        }
      }
    }
  return lines
}
