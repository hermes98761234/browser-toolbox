// Procedural PBR texture sets (height → albedo / roughness / normal) for the Material Previewer.

export type TexKind = 'bricks' | 'tiles' | 'brushed' | 'wood' | 'hammered'

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Tileable value noise in [0,1) with integer period `p`. */
export function vnoise(x: number, y: number, p: number, seed = 1): number {
  const xi = Math.floor(x), yi = Math.floor(y)
  const fx = x - xi, fy = y - yi
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const m = (v: number) => ((v % p) + p) % p
  const a = hash(m(xi), m(yi), seed), b = hash(m(xi + 1), m(yi), seed)
  const c = hash(m(xi), m(yi + 1), seed), d = hash(m(xi + 1), m(yi + 1), seed)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

export function fbm(u: number, v: number, base: number, oct = 4, seed = 1): number {
  let s = 0, amp = 0.5, f = base, norm = 0
  for (let o = 0; o < oct; o++) {
    s += amp * vnoise(u * f, v * f, f, seed + o)
    norm += amp
    amp *= 0.5
    f *= 2
  }
  return s / norm
}

export interface TexSet {
  size: number
  height: Float32Array // 0..1
  albedo: Uint8ClampedArray // RGBA
  rough: Uint8ClampedArray // single channel 0..255
  metal: number // suggested metalness
  roughBase: number
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t

export function generate(kind: TexKind, size = 256): TexSet {
  const N = size
  const height = new Float32Array(N * N)
  const albedo = new Uint8ClampedArray(N * N * 4)
  const rough = new Uint8ClampedArray(N * N)
  let metal = 0, roughBase = 1
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, k = y * N + x
    const n = fbm(u, v, 8, 4, 3)
    let h = 0.5, r = 0, g = 0, b = 0, ro = 0.5
    if (kind === 'bricks') {
      const rows = 8, cols = 4
      const ry = v * rows, row = Math.floor(ry)
      const rx = u * cols + (row % 2 ? 0.5 : 0), col = Math.floor(rx)
      const fx = rx - col, fy = ry - row
      const edge = Math.min(fx * 2, (1 - fx) * 2, fy, 1 - fy) // distance to mortar (in brick-height units)
      const mortar = 0.06
      const tone = hash(((col % cols) + cols) % cols, row, 7)
      if (edge < mortar) { h = 0.15 + n * 0.1; r = 170; g = 165; b = 155; ro = 0.95 }
      else {
        h = 0.75 + Math.min(1, (edge - mortar) * 8) * 0.15 + (n - 0.5) * 0.15
        r = mix(150, 190, tone) * (0.8 + n * 0.4); g = mix(60, 85, tone) * (0.8 + n * 0.4); b = mix(45, 60, tone) * (0.8 + n * 0.4); ro = 0.8
      }
      roughBase = 1
    } else if (kind === 'tiles') {
      const t = 4, fx = (u * t) % 1, fy = (v * t) % 1
      const edge = Math.min(fx, 1 - fx, fy, 1 - fy)
      if (edge < 0.03) { h = 0.1; r = 120; g = 118; b = 112; ro = 0.9 }
      else {
        const bevel = Math.min(1, (edge - 0.03) * 25)
        const tone = hash(Math.floor(u * t), Math.floor(v * t), 11)
        h = 0.5 + 0.4 * bevel; r = mix(220, 240, tone); g = mix(225, 242, tone); b = mix(230, 248, tone); ro = 0.12 + n * 0.08
      }
    } else if (kind === 'brushed') {
      const streak = fbm(u * 0.02, v, 64, 3, 5)
      const scratch = vnoise(u * 3 + v * 40, v * 3, 3, 9) > 0.93 ? 1 : 0
      h = 0.5 + (streak - 0.5) * 0.3 - scratch * 0.2
      const c = 175 + (streak - 0.5) * 60
      r = c; g = c + 2; b = c + 6; ro = 0.28 + (streak - 0.5) * 0.25 + scratch * 0.2
      metal = 1
    } else if (kind === 'wood') {
      const w = fbm(u, v * 0.25, 4, 3, 2)
      const ring = (Math.sin((u * 18 + w * 6) * Math.PI * 2) + 1) / 2
      const grain = fbm(u * 1, v * 0.05, 64, 2, 4)
      const t = Math.pow(ring, 3) * 0.7 + grain * 0.3
      h = 0.5 + t * 0.15
      r = mix(196, 120, t); g = mix(142, 74, t); b = mix(88, 40, t); ro = 0.55 + t * 0.2
    } else {
      // hammered: distance to nearest cell point (tileable Worley)
      const cells = 8, cx = u * cells, cy = v * cells
      let d = 9
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const gx = Math.floor(cx) + i, gy = Math.floor(cy) + j
        const wx = ((gx % cells) + cells) % cells, wy = ((gy % cells) + cells) % cells
        const px = gx + hash(wx, wy, 21), py = gy + hash(wx, wy, 22)
        d = Math.min(d, Math.hypot(px - cx, py - cy))
      }
      h = 1 - Math.min(1, d * d * 1.6)
      const c = 200 + n * 30
      r = c; g = c * 0.78; b = c * 0.45; ro = 0.22 + n * 0.15
      metal = 1
    }
    height[k] = Math.max(0, Math.min(1, h))
    albedo[k * 4] = r; albedo[k * 4 + 1] = g; albedo[k * 4 + 2] = b; albedo[k * 4 + 3] = 255
    rough[k] = Math.max(0, Math.min(1, ro)) * 255
  }
  return { size: N, height, albedo, rough, metal, roughBase }
}

/** Tangent-space normal map (RGBA, OpenGL +Y) from a tileable height field via central differences. */
export function heightToNormal(h: Float32Array, N: number, strength = 4): Uint8ClampedArray {
  const out = new Uint8ClampedArray(N * N * 4)
  const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)]
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength
    // image y grows downwards, OpenGL normal maps have +Y up → flip dy
    let nx = -dx, ny = dy, nz = 1
    const l = Math.hypot(nx, ny, nz)
    nx /= l; ny /= l; nz /= l
    const k = (y * N + x) * 4
    out[k] = (nx * 0.5 + 0.5) * 255; out[k + 1] = (ny * 0.5 + 0.5) * 255; out[k + 2] = (nz * 0.5 + 0.5) * 255; out[k + 3] = 255
  }
  return out
}

/** Schlick Fresnel reflectance at normal incidence for an index of refraction. */
export const f0FromIor = (ior: number) => ((ior - 1) / (ior + 1)) ** 2
