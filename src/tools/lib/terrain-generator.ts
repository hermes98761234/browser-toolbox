// Terrain heightmaps: seeded 2D simplex noise, fBm / ridged fractals, island falloff, smoothing,
// thermal and hydraulic erosion, plus exporters (16-bit grayscale PNG, OBJ, binary STL).

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]
const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6

/** Seeded 2D simplex noise (Gustavson). Returns a function giving values in about [-1, 1]. */
export function simplex2(seed: number) {
  const rnd = mulberry32(seed)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const t = p[i]; p[i] = p[j]; p[j] = t
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  return (x: number, y: number) => {
    const s = (x + y) * F2
    const i = Math.floor(x + s), j = Math.floor(y + s)
    const t = (i + j) * G2
    const x0 = x - (i - t), y0 = y - (j - t)
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2
    const ii = i & 255, jj = j & 255
    let n = 0
    const corner = (gx: number, gy: number, g: number) => {
      const tt = 0.5 - gx * gx - gy * gy
      if (tt < 0) return 0
      const gr = GRAD[g & 7]
      return tt * tt * tt * tt * (gr[0] * gx + gr[1] * gy)
    }
    n += corner(x0, y0, perm[ii + perm[jj]])
    n += corner(x1, y1, perm[ii + i1 + perm[jj + j1]])
    n += corner(x2, y2, perm[ii + 1 + perm[jj + 1]])
    return 70 * n
  }
}

export type NoiseType = 'fbm' | 'ridged' | 'billow' | 'terraced'

export interface TerrainOpts {
  size: number // grid is size × size samples
  seed: number
  scale: number // features per map width
  octaves: number
  persistence: number
  lacunarity: number
  type: NoiseType
  island: number // 0..1 radial falloff strength
  warp: number // domain warp strength
  exponent: number // redistribution (valleys flatter when > 1)
}

/** Generates a heightmap normalised to [0, 1]. */
export function generate(o: TerrainOpts): Float32Array {
  const n = simplex2(o.seed)
  const wx = simplex2(o.seed + 101), wy = simplex2(o.seed + 202)
  const N = o.size
  const out = new Float32Array(N * N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let u = (x / N) * o.scale, v = (y / N) * o.scale
      if (o.warp > 0) {
        const du = wx(u * 0.5, v * 0.5), dv = wy(u * 0.5 + 5.2, v * 0.5 + 1.3)
        u += du * o.warp
        v += dv * o.warp
      }
      let amp = 1, freq = 1, sum = 0, norm = 0
      for (let k = 0; k < o.octaves; k++) {
        let s = n(u * freq + k * 17.1, v * freq - k * 9.7)
        if (o.type === 'ridged') s = 1 - Math.abs(s) * 2
        else if (o.type === 'billow') s = Math.abs(s) * 2 - 1
        sum += s * amp
        norm += amp
        amp *= o.persistence
        freq *= o.lacunarity
      }
      out[y * N + x] = sum / norm
    }
  }
  normalize(out)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x
      let h = Math.pow(out[i], o.exponent)
      if (o.type === 'terraced') h = Math.round(h * 8) / 8 * 0.7 + h * 0.3
      if (o.island > 0) {
        const dx = (x / (N - 1)) * 2 - 1, dy = (y / (N - 1)) * 2 - 1
        const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) / Math.SQRT2 * 1.25)
        h = h * (1 - o.island * d * d)
      }
      out[i] = h
    }
  }
  return normalize(out)
}

export function normalize(h: Float32Array): Float32Array {
  let lo = Infinity, hi = -Infinity
  for (const v of h) { if (v < lo) lo = v; if (v > hi) hi = v }
  const r = hi - lo || 1
  for (let i = 0; i < h.length; i++) h[i] = (h[i] - lo) / r
  return h
}

/** 3×3 box-blur passes (edges clamp). */
export function smooth(h: Float32Array, N: number, passes: number): Float32Array {
  let a = h
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(a.length)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let s = 0, c = 0
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= N) continue
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            if (xx < 0 || xx >= N) continue
            s += a[yy * N + xx]
            c++
          }
        }
        b[y * N + x] = s / c
      }
    }
    a = b
  }
  return a
}

/** Thermal erosion: material slides to lower neighbours where the slope exceeds the talus angle. */
export function thermalErode(h: Float32Array, N: number, iterations: number, talus = 4 / 256, rate = 0.5): Float32Array {
  const a = Float32Array.from(h)
  const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  for (let it = 0; it < iterations; it++) {
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const i = y * N + x
        let dmax = 0, j = -1
        for (const [dx, dy] of nb) {
          const k = (y + dy) * N + x + dx
          const d = a[i] - a[k]
          if (d > dmax) { dmax = d; j = k }
        }
        if (j >= 0 && dmax > talus) {
          const mv = rate * (dmax - talus) / 2
          a[i] -= mv
          a[j] += mv
        }
      }
    }
  }
  return a
}

/** Particle-based hydraulic erosion (simplified droplet model). */
export function hydraulicErode(h: Float32Array, N: number, droplets: number, seed = 1): Float32Array {
  const a = Float32Array.from(h)
  const rnd = mulberry32(seed)
  const inertia = 0.05, capacity = 4, deposit = 0.3, erode = 0.3, evap = 0.02, gravity = 4, minSlope = 0.01
  const heightGrad = (px: number, py: number) => {
    const x = Math.floor(px), y = Math.floor(py)
    const u = px - x, v = py - y
    const i = y * N + x
    const h00 = a[i], h10 = a[i + 1], h01 = a[i + N], h11 = a[i + N + 1]
    return {
      h: h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v,
      gx: (h10 - h00) * (1 - v) + (h11 - h01) * v,
      gy: (h01 - h00) * (1 - u) + (h11 - h10) * u,
    }
  }
  for (let d = 0; d < droplets; d++) {
    let px = rnd() * (N - 2), py = rnd() * (N - 2)
    let dx = 0, dy = 0, speed = 1, water = 1, sed = 0
    for (let life = 0; life < 40; life++) {
      const x = Math.floor(px), y = Math.floor(py)
      const u = px - x, v = py - y
      const g = heightGrad(px, py)
      dx = dx * inertia - g.gx * (1 - inertia)
      dy = dy * inertia - g.gy * (1 - inertia)
      const len = Math.hypot(dx, dy)
      if (len < 1e-9) break
      dx /= len; dy /= len
      px += dx; py += dy
      if (px < 0 || py < 0 || px >= N - 1 || py >= N - 1) break
      const dh = heightGrad(px, py).h - g.h
      const cap = Math.max(-dh, minSlope) * speed * water * capacity
      const i = y * N + x
      const w = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v]
      const idx = [i, i + 1, i + N, i + N + 1]
      if (sed > cap || dh > 0) {
        const amt = dh > 0 ? Math.min(dh, sed) : (sed - cap) * deposit
        sed -= amt
        for (let k = 0; k < 4; k++) a[idx[k]] += amt * w[k]
      } else {
        const amt = Math.min((cap - sed) * erode, -dh)
        for (let k = 0; k < 4; k++) a[idx[k]] -= amt * w[k]
        sed += amt
      }
      speed = Math.sqrt(Math.max(0, speed * speed + dh * gravity * -1))
      water *= 1 - evap
    }
  }
  return a
}

/** Converts RGBA pixels (already resampled to N × N) into a [0, 1] luminance heightmap. */
export function fromImage(rgba: Uint8ClampedArray, N: number): Float32Array {
  const h = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) h[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255
  return h
}

// ---------- exporters ----------

const CRC_T = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
export function crc32(b: Uint8Array, c = 0xffffffff): number {
  for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function adler32(b: Uint8Array) {
  let a = 1, s = 0
  for (let i = 0; i < b.length; i++) { a = (a + b[i]) % 65521; s = (s + a) % 65521 }
  return ((s << 16) | a) >>> 0
}

/** zlib stream with uncompressed (stored) deflate blocks: always valid, used when CompressionStream is missing. */
export function zlibStored(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / 65535))
  const out = new Uint8Array(2 + data.length + blocks * 5 + 4)
  out[0] = 0x78; out[1] = 0x01
  let o = 2
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535, len = Math.min(65535, data.length - start)
    out[o++] = b === blocks - 1 ? 1 : 0
    out[o++] = len & 255; out[o++] = len >>> 8
    out[o++] = ~len & 255; out[o++] = (~len >>> 8) & 255
    out.set(data.subarray(start, start + len), o)
    o += len
  }
  const ad = adler32(data)
  out[o++] = ad >>> 24; out[o++] = (ad >>> 16) & 255; out[o++] = (ad >>> 8) & 255; out[o++] = ad & 255
  return out
}

/** Raw scanlines (filter byte 0) for a 16-bit (big-endian) or 8-bit grayscale image. */
export function pngScanlines(h: Float32Array, N: number, bits: 8 | 16): Uint8Array {
  const bpp = bits / 8
  const raw = new Uint8Array(N * (1 + N * bpp))
  for (let y = 0; y < N; y++) {
    const row = y * (1 + N * bpp)
    raw[row] = 0
    for (let x = 0; x < N; x++) {
      const v = Math.max(0, Math.min(1, h[y * N + x]))
      if (bits === 16) {
        const q = Math.round(v * 65535)
        raw[row + 1 + x * 2] = q >>> 8
        raw[row + 2 + x * 2] = q & 255
      } else raw[row + 1 + x] = Math.round(v * 255)
    }
  }
  return raw
}

/** Assembles a grayscale PNG from zlib-compressed scanline data. */
export function pngFile(N: number, bits: 8 | 16, zdata: Uint8Array): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const c = new Uint8Array(12 + data.length)
    const dv = new DataView(c.buffer)
    dv.setUint32(0, data.length)
    for (let i = 0; i < 4; i++) c[4 + i] = type.charCodeAt(i)
    c.set(data, 8)
    dv.setUint32(8 + data.length, crc32(c.subarray(4, 8 + data.length)))
    return c
  }
  const ihdr = new Uint8Array(13)
  const dv = new DataView(ihdr.buffer)
  dv.setUint32(0, N); dv.setUint32(4, N)
  ihdr[8] = bits; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zdata), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

/** Wavefront OBJ of the grid: `width` world units across, heights scaled by `height`. */
export function toObj(h: Float32Array, N: number, width: number, height: number): string {
  const L: string[] = ['# Terrain Generator heightmap mesh', `# ${N}x${N} vertices`, 'o terrain']
  const c = (N - 1) / 2
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) L.push(`v ${(((x - c) / (N - 1)) * width).toFixed(4)} ${(h[y * N + x] * height).toFixed(4)} ${(((y - c) / (N - 1)) * width).toFixed(4)}`)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) L.push(`vt ${(x / (N - 1)).toFixed(5)} ${(1 - y / (N - 1)).toFixed(5)}`)
  for (let y = 0; y < N - 1; y++) {
    for (let x = 0; x < N - 1; x++) {
      const a = y * N + x + 1, b = a + 1, d = a + N, e = d + 1
      L.push(`f ${a}/${a} ${d}/${d} ${b}/${b}`, `f ${b}/${b} ${d}/${d} ${e}/${e}`)
    }
  }
  return L.join('\n') + '\n'
}

/** Binary STL of a closed solid (top surface, four skirt walls and a flat base) for 3D printing. */
export function toStl(h: Float32Array, N: number, width: number, height: number, base: number): Uint8Array {
  const tris: number[][] = []
  const c = (N - 1) / 2
  const P = (x: number, y: number, z: number) => [((x - c) / (N - 1)) * width, ((y - c) / (N - 1)) * width, z]
  const top = (x: number, y: number) => P(x, y, base + h[y * N + x] * height)
  const bot = (x: number, y: number) => P(x, y, 0)
  for (let y = 0; y < N - 1; y++) {
    for (let x = 0; x < N - 1; x++) {
      tris.push([...top(x, y), ...top(x + 1, y), ...top(x, y + 1)], [...top(x + 1, y), ...top(x + 1, y + 1), ...top(x, y + 1)])
      // base (facing down)
      tris.push([...bot(x, y), ...bot(x, y + 1), ...bot(x + 1, y)], [...bot(x + 1, y), ...bot(x, y + 1), ...bot(x + 1, y + 1)])
    }
  }
  for (let i = 0; i < N - 1; i++) {
    // y = 0 wall, y = N-1 wall, x = 0 wall, x = N-1 wall (outward winding)
    tris.push([...bot(i, 0), ...bot(i + 1, 0), ...top(i, 0)], [...bot(i + 1, 0), ...top(i + 1, 0), ...top(i, 0)])
    tris.push([...bot(i, N - 1), ...top(i, N - 1), ...bot(i + 1, N - 1)], [...bot(i + 1, N - 1), ...top(i, N - 1), ...top(i + 1, N - 1)])
    tris.push([...bot(0, i), ...top(0, i), ...bot(0, i + 1)], [...bot(0, i + 1), ...top(0, i), ...top(0, i + 1)])
    tris.push([...bot(N - 1, i), ...bot(N - 1, i + 1), ...top(N - 1, i)], [...bot(N - 1, i + 1), ...top(N - 1, i + 1), ...top(N - 1, i)])
  }
  const buf = new ArrayBuffer(84 + tris.length * 50)
  const dv = new DataView(buf)
  const head = 'Terrain Generator STL'
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i))
  dv.setUint32(80, tris.length, true)
  let o = 84
  for (const t of tris) {
    const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2]
    const vx = t[6] - t[0], vy = t[7] - t[1], vz = t[8] - t[2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l; ny /= l; nz /= l
    for (const v of [nx, ny, nz, ...t]) { dv.setFloat32(o, v, true); o += 4 }
    dv.setUint16(o, 0, true)
    o += 2
  }
  return new Uint8Array(buf)
}

/** Terrain colour ramp for a normalised height and water level. */
export function biome(h: number, sea: number): [number, number, number] {
  if (h < sea) { const t = h / (sea || 1); return [0.05 + 0.1 * t, 0.2 + 0.25 * t, 0.45 + 0.25 * t] }
  const t = (h - sea) / (1 - sea || 1)
  if (t < 0.04) return [0.86, 0.8, 0.58]
  if (t < 0.35) return [0.25 + 0.1 * t, 0.55 - 0.2 * t, 0.2]
  if (t < 0.6) return [0.33, 0.42, 0.22]
  if (t < 0.8) return [0.47, 0.42, 0.38]
  return [0.93, 0.94, 0.97]
}
