// .cube colour lookup tables: parser (1D/3D, DOMAIN_MIN/MAX, LUT_*_INPUT_RANGE), trilinear sampling,
// built-in LUT generators and a serializer. Values are RGB triplets in a Float32Array;
// for 3D tables red changes fastest, then green, then blue (Adobe/Resolve convention).

export type RGB = [number, number, number]

export interface Lut {
  title: string
  kind: '1D' | '3D'
  size: number
  min: RGB
  max: RGB
  data: Float32Array
}

export function parseCube(text: string): { lut: Lut; warnings: string[] } {
  const warnings: string[] = []
  let title = ''
  let size1 = 0
  let size3 = 0
  let min: RGB = [0, 0, 0]
  let max: RGB = [1, 1, 1]
  const vals: number[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].replace(/#.*$/, '').trim()
    if (!line) continue
    const parts = line.split(/\s+/)
    const key = parts[0].toUpperCase()
    if (key === 'TITLE') title = line.slice(5).trim().replace(/^"|"$/g, '')
    else if (key === 'LUT_1D_SIZE') size1 = parseInt(parts[1], 10)
    else if (key === 'LUT_3D_SIZE') size3 = parseInt(parts[1], 10)
    else if (key === 'DOMAIN_MIN') min = parts.slice(1, 4).map(Number) as RGB
    else if (key === 'DOMAIN_MAX') max = parts.slice(1, 4).map(Number) as RGB
    else if (key === 'LUT_1D_INPUT_RANGE' || key === 'LUT_3D_INPUT_RANGE') {
      const a = Number(parts[1]), b = Number(parts[2])
      min = [a, a, a]
      max = [b, b, b]
    } else if (/^[-+.\d]/.test(key)) {
      if (parts.length < 3) throw new Error(`Line ${n + 1}: expected three numbers`)
      for (let k = 0; k < 3; k++) {
        const v = Number(parts[k])
        if (!Number.isFinite(v)) throw new Error(`Line ${n + 1}: "${parts[k]}" is not a number`)
        vals.push(v)
      }
    } else warnings.push(`Line ${n + 1}: ignored keyword ${parts[0]}`)
  }
  if (!size1 && !size3) throw new Error('No LUT_3D_SIZE or LUT_1D_SIZE found — is this a .cube file?')
  if (size1 && size3) warnings.push('Both 1D and 3D sizes given; using the 3D table')
  const kind = size3 ? '3D' : '1D'
  const size = size3 || size1
  if (size < 2 || size > 256) throw new Error(`Unsupported LUT size ${size}`)
  const need = (kind === '3D' ? size ** 3 : size) * 3
  if (vals.length < need) throw new Error(`Expected ${need / 3} entries, found ${vals.length / 3}`)
  if (vals.length > need) warnings.push(`${(vals.length - need) / 3} extra entries ignored`)
  if (min.some((v) => !Number.isFinite(v)) || max.some((v) => !Number.isFinite(v)) || min.some((v, i) => v >= max[i])) throw new Error('Invalid DOMAIN_MIN / DOMAIN_MAX')
  return { lut: { title, kind, size, min, max, data: new Float32Array(vals.slice(0, need)) }, warnings }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Applies the LUT to one input colour; inputs are normalised by DOMAIN_MIN/MAX and clamped. */
export function sample(l: Lut, r: number, g: number, b: number): RGB {
  const N = l.size
  const norm = (v: number, k: number) => Math.min(1, Math.max(0, (v - l.min[k]) / (l.max[k] - l.min[k]))) * (N - 1)
  const d = l.data
  if (l.kind === '1D') {
    const out: RGB = [0, 0, 0]
    const inp = [r, g, b]
    for (let k = 0; k < 3; k++) {
      const x = norm(inp[k], k)
      const i = Math.min(N - 2, Math.floor(x))
      out[k] = lerp(d[i * 3 + k], d[(i + 1) * 3 + k], x - i)
    }
    return out
  }
  const x = norm(r, 0), y = norm(g, 1), z = norm(b, 2)
  const i = Math.min(N - 2, Math.floor(x)), j = Math.min(N - 2, Math.floor(y)), k = Math.min(N - 2, Math.floor(z))
  const fx = x - i, fy = y - j, fz = z - k
  const at = (a: number, b2: number, c: number, ch: number) => d[((a + b2 * N + c * N * N) * 3) + ch]
  const out: RGB = [0, 0, 0]
  for (let ch = 0; ch < 3; ch++) {
    const c00 = lerp(at(i, j, k, ch), at(i + 1, j, k, ch), fx)
    const c10 = lerp(at(i, j + 1, k, ch), at(i + 1, j + 1, k, ch), fx)
    const c01 = lerp(at(i, j, k + 1, ch), at(i + 1, j, k + 1, ch), fx)
    const c11 = lerp(at(i, j + 1, k + 1, ch), at(i + 1, j + 1, k + 1, ch), fx)
    out[ch] = lerp(lerp(c00, c10, fy), lerp(c01, c11, fy), fz)
  }
  return out
}

/** CPU grading of RGBA bytes; `intensity` mixes with the original. */
export function applyToPixels(l: Lut, src: Uint8ClampedArray, intensity = 1, dst: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(src.length)): Uint8ClampedArray<ArrayBuffer> {
  for (let p = 0; p < src.length; p += 4) {
    const r = src[p] / 255, g = src[p + 1] / 255, b = src[p + 2] / 255
    const o = sample(l, r, g, b)
    dst[p] = (r + (o[0] - r) * intensity) * 255
    dst[p + 1] = (g + (o[1] - g) * intensity) * 255
    dst[p + 2] = (b + (o[2] - b) * intensity) * 255
    dst[p + 3] = src[p + 3]
  }
  return dst
}

export function makeLut3D(size: number, f: (r: number, g: number, b: number) => RGB, title = ''): Lut {
  const data = new Float32Array(size ** 3 * 3)
  let o = 0
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        const v = f(r / (size - 1), g / (size - 1), b / (size - 1))
        data[o++] = v[0]
        data[o++] = v[1]
        data[o++] = v[2]
      }
  return { title, kind: '3D', size, min: [0, 0, 0], max: [1, 1, 1], data }
}

export function makeLut1D(size: number, f: (v: number) => RGB, title = ''): Lut {
  const data = new Float32Array(size * 3)
  for (let i = 0; i < size; i++) data.set(f(i / (size - 1)), i * 3)
  return { title, kind: '1D', size, min: [0, 0, 0], max: [1, 1, 1], data }
}

/** Mixes a LUT with the identity (for exporting at a reduced intensity). */
export function blendLut(l: Lut, k: number): Lut {
  if (k >= 1) return l
  const data = new Float32Array(l.data.length)
  const N = l.size
  for (let e = 0; e < l.data.length / 3; e++) {
    const idx = l.kind === '3D' ? [e % N, Math.floor(e / N) % N, Math.floor(e / (N * N))] : [e, e, e]
    for (let ch = 0; ch < 3; ch++) {
      const id = l.min[ch] + (idx[ch] / (N - 1)) * (l.max[ch] - l.min[ch])
      data[e * 3 + ch] = id + (l.data[e * 3 + ch] - id) * k
    }
  }
  return { ...l, data }
}

export function toCube(l: Lut): string {
  const lines = [`TITLE "${l.title || 'Browser Toolbox LUT'}"`, `LUT_${l.kind}_SIZE ${l.size}`, `DOMAIN_MIN ${l.min.join(' ')}`, `DOMAIN_MAX ${l.max.join(' ')}`]
  for (let i = 0; i < l.data.length; i += 3) lines.push(`${l.data[i].toFixed(6)} ${l.data[i + 1].toFixed(6)} ${l.data[i + 2].toFixed(6)}`)
  return lines.join('\n') + '\n'
}

// ---------- built-in looks ----------

const cl = (v: number) => Math.min(1, Math.max(0, v))
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b
/** Smooth contrast curve around mid-grey: k=0 identity, k>0 more contrast. */
export const contrast = (v: number, k: number) => cl(v + k * (v - 0.5) * (1 - Math.abs(2 * v - 1)))

function satAdjust(r: number, g: number, b: number, s: number): RGB {
  const y = luma(r, g, b)
  return [cl(y + (r - y) * s), cl(y + (g - y) * s), cl(y + (b - y) * s)]
}

export const PRESETS: { name: string; make: () => Lut; note: string }[] = [
  { name: 'Identity (no change)', note: 'Reference – output equals input.', make: () => makeLut3D(17, (r, g, b) => [r, g, b], 'Identity') },
  {
    name: 'Teal & orange', note: 'Blockbuster look: cool shadows, warm skin and highlights.',
    make: () => makeLut3D(33, (r, g, b) => {
      const y = luma(r, g, b)
      const w = cl((y - 0.15) / 0.7)
      const tint: RGB = [lerp(-0.06, 0.08, w), lerp(0.03, 0.01, w), lerp(0.08, -0.08, w)]
      const [sr, sg, sb] = satAdjust(r, g, b, 1.15)
      return [cl(contrast(sr, 0.25) + tint[0]), cl(contrast(sg, 0.25) + tint[1]), cl(contrast(sb, 0.25) + tint[2])]
    }, 'Teal and orange'),
  },
  {
    name: 'Warm film', note: 'Lifted blacks, soft roll-off and a golden cast.',
    make: () => makeLut3D(33, (r, g, b) => {
      const f = (v: number) => 0.04 + 0.92 * contrast(v, 0.3)
      return [cl(f(r) * 1.06 + 0.01), cl(f(g) * 1.0), cl(f(b) * 0.88)]
    }, 'Warm film'),
  },
  {
    name: 'Bleach bypass', note: 'Silver retained: low saturation, punchy contrast.',
    make: () => makeLut3D(33, (r, g, b) => {
      const [sr, sg, sb] = satAdjust(r, g, b, 0.45)
      return [contrast(sr, 0.6), contrast(sg, 0.6), contrast(sb, 0.6)]
    }, 'Bleach bypass'),
  },
  {
    name: 'Cross process', note: 'Per-channel curves like slide film in C-41 chemistry.',
    make: () => makeLut3D(33, (r, g, b) => [contrast(r, 0.55), cl(contrast(g, 0.3) * 1.04), cl(0.12 + b * 0.72)], 'Cross process'),
  },
  {
    name: 'Noir B&W', note: 'Red-filter black and white with deep blacks.',
    make: () => makeLut3D(33, (r, g, b) => {
      const y = contrast(cl(0.5 * r + 0.4 * g + 0.1 * b), 0.7)
      return [y, y, y]
    }, 'Noir'),
  },
  {
    name: 'Faded vintage', note: 'Matte blacks, creamy highlights, muted greens.',
    make: () => makeLut3D(33, (r, g, b) => {
      const [sr, sg, sb] = satAdjust(r, g, b, 0.7)
      return [cl(0.1 + sr * 0.85 + 0.03), cl(0.08 + sg * 0.82), cl(0.12 + sb * 0.7)]
    }, 'Faded vintage'),
  },
  {
    name: 'Cool night (1D)', note: 'A 1D per-channel curve: blue shadows, darker mids.',
    make: () => makeLut1D(64, (v) => [cl(Math.pow(v, 1.35) * 0.9), cl(Math.pow(v, 1.2) * 0.95), cl(0.06 + Math.pow(v, 0.95) * 0.94)], 'Cool night 1D'),
  },
]
