// Dominant colours by k-means (k-means++ seeding) in CIELAB, plus palette export formats.

export type RGB = [number, number, number]

const lin = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
export function rgbToLab([r, g, b]: RGB): RGB {
  const R = lin(r), G = lin(g), B = lin(b)
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const fx = f(x), fy = f(y), fz = f(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export interface Cluster {
  rgb: RGB
  count: number
  share: number
}

/** Deterministic PRNG so the same image always yields the same palette. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Clusters RGBA pixel data. Pixels with alpha < 128 are skipped; at most `maxSamples` pixels are used.
 * `space` picks the distance: perceptual Lab or plain RGB.
 */
export function kmeans(data: Uint8ClampedArray | Uint8Array, k: number, opts: { space?: 'lab' | 'rgb'; maxSamples?: number; iterations?: number; seed?: number } = {}): Cluster[] {
  const { space = 'lab', maxSamples = 40000, iterations = 24, seed = 1 } = opts
  const total = data.length / 4
  const step = Math.max(1, Math.floor(total / maxSamples))
  const px: RGB[] = []
  for (let i = 0; i < total; i += step) if (data[i * 4 + 3] >= 128) px.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]])
  if (!px.length) return []
  const pts = space === 'lab' ? px.map(rgbToLab) : px.map((p) => [...p] as RGB)
  const n = pts.length
  const K = Math.min(k, n)
  const rand = rng(seed)
  const d2 = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  // k-means++
  const cent: RGB[] = [[...pts[Math.floor(rand() * n)]] as RGB]
  const dist = new Float64Array(n).fill(Infinity)
  while (cent.length < K) {
    let sum = 0
    const c = cent[cent.length - 1]
    for (let i = 0; i < n; i++) {
      dist[i] = Math.min(dist[i], d2(pts[i], c))
      sum += dist[i]
    }
    if (sum === 0) break
    let r = rand() * sum
    let pick = 0
    for (; pick < n - 1; pick++) {
      r -= dist[pick]
      if (r <= 0) break
    }
    cent.push([...pts[pick]] as RGB)
  }
  const assign = new Int32Array(n).fill(-1)
  for (let it = 0; it < iterations; it++) {
    let changed = 0
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity
      for (let c = 0; c < cent.length; c++) {
        const d = d2(pts[i], cent[c])
        if (d < bd) {
          bd = d
          best = c
        }
      }
      if (assign[i] !== best) {
        assign[i] = best
        changed++
      }
    }
    const acc = cent.map(() => [0, 0, 0, 0])
    for (let i = 0; i < n; i++) {
      const a = acc[assign[i]]
      a[0] += pts[i][0]
      a[1] += pts[i][1]
      a[2] += pts[i][2]
      a[3]++
    }
    acc.forEach((a, c) => {
      if (a[3]) cent[c] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]
    })
    if (!changed) break
  }
  const out = cent.map(() => [0, 0, 0, 0])
  for (let i = 0; i < n; i++) {
    const a = out[assign[i]]
    a[0] += px[i][0]
    a[1] += px[i][1]
    a[2] += px[i][2]
    a[3]++
  }
  return out
    .filter((a) => a[3] > 0)
    .map((a) => ({ rgb: [Math.round(a[0] / a[3]), Math.round(a[1] / a[3]), Math.round(a[2] / a[3])] as RGB, count: a[3], share: a[3] / n }))
    .sort((a, b) => b.count - a.count)
}

export const hex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

export function hsl([r, g, b]: RGB): RGB {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)]
}

/** WCAG relative luminance → pick black or white text. */
export function luminance([r, g, b]: RGB) {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
export const textOn = (c: RGB) => (luminance(c) > 0.179 ? '#000000' : '#ffffff')

/** Adobe Swatch Exchange (.ase) file with RGB global colours. */
export function aseBytes(colors: RGB[], names: string[]): Uint8Array {
  const blocks = colors.map((c, i) => {
    const name = (names[i] ?? hex(c)) + '\0'
    const len = 2 + name.length * 2 + 4 + 12 + 2
    const b = new DataView(new ArrayBuffer(6 + len))
    let o = 0
    b.setUint16(o, 0x0001); o += 2
    b.setUint32(o, len); o += 4
    b.setUint16(o, name.length); o += 2
    for (const ch of name) { b.setUint16(o, ch.charCodeAt(0)); o += 2 }
    for (const ch of 'RGB ') { b.setUint8(o, ch.charCodeAt(0)); o += 1 }
    for (const v of c) { b.setFloat32(o, v / 255); o += 4 }
    b.setUint16(o, 0)
    return new Uint8Array(b.buffer)
  })
  const head = new DataView(new ArrayBuffer(12))
  ;[0x41, 0x53, 0x45, 0x46].forEach((v, i) => head.setUint8(i, v))
  head.setUint16(4, 1)
  head.setUint16(6, 0)
  head.setUint32(8, colors.length)
  const out = new Uint8Array(12 + blocks.reduce((a, b) => a + b.length, 0))
  out.set(new Uint8Array(head.buffer), 0)
  let o = 12
  for (const b of blocks) {
    out.set(b, o)
    o += b.length
  }
  return out
}

export function gpl(colors: RGB[], names: string[], title = 'Extracted palette'): string {
  return [`GIMP Palette`, `Name: ${title}`, `Columns: ${Math.min(colors.length, 8)}`, '#', ...colors.map((c, i) => `${String(c[0]).padStart(3)} ${String(c[1]).padStart(3)} ${String(c[2]).padStart(3)}\t${names[i] ?? hex(c)}`)].join('\n') + '\n'
}

export function cssVars(colors: RGB[], prefix = 'color'): string {
  return `:root {\n${colors.map((c, i) => `  --${prefix}-${i + 1}: ${hex(c)};`).join('\n')}\n}\n`
}
