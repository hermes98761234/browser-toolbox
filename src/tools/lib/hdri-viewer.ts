// HDRI helpers: direction math for equirectangular maps, a procedural HDR sky / studio,
// Radiance (.hdr, RGBE) encoding and luminance statistics. Row 0 of every buffer is the TOP (y = +1).

export type Vec3 = [number, number, number]
const D = Math.PI / 180

/** Unit direction (y up) for azimuth/elevation in degrees, matching three.js equirect mapping. */
export function dirFromAzEl(az: number, el: number): Vec3 {
  const a = az * D, e = el * D
  return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)]
}

/** Equirect uv (u → right, v → up) to azimuth/elevation in degrees. */
export function uvToAzEl(u: number, v: number): [number, number] {
  return [(u - 0.5) * 360, (v - 0.5) * 180]
}

export function azElToUv(az: number, el: number): [number, number] {
  let a = az % 360
  if (a < -180) a += 360
  if (a >= 180) a -= 360
  return [a / 360 + 0.5, el / 180 + 0.5]
}

export const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

export interface SkyParams {
  sunAz: number
  sunEl: number
  turbidity: number // 1 = crystal clear, 10 = hazy
  clouds: number // 0..1 coverage
  sunPower: number // radiance multiplier of the sun disk
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
  return mix(mix(a, b, ux), mix(c, d, ux), uy)
}
function fbm(x: number, y: number) {
  let v = 0, amp = 0.5
  for (let i = 0; i < 5; i++) {
    v += amp * vnoise(x, y)
    x *= 2.03
    y *= 2.03
    amp *= 0.5
  }
  return v
}

/** Analytic daylight sky (gradient + Mie glow + sun disk + optional fbm clouds), linear RGB floats. */
export function generateSky(p: SkyParams, W = 1024, H = 512): Float32Array {
  const out = new Float32Array(W * H * 3)
  const sun = dirFromAzEl(p.sunAz, p.sunEl)
  const elev = Math.max(-0.2, Math.sin(p.sunEl * D))
  const low = 1 - smooth(0.0, 0.45, elev) // 1 near horizon → warm light
  const day = smooth(-0.12, 0.15, elev) // 0 at night
  const haze = (p.turbidity - 1) / 9
  const sunCol: Vec3 = [1, mix(0.95, 0.55, low), mix(0.88, 0.25, low)]
  const zen: Vec3 = [mix(0.12, 0.35, haze), mix(0.32, 0.45, haze), mix(0.85, 0.6, haze)]
  const hor: Vec3 = [mix(0.75, 1.0, low), mix(0.82, 0.62, low), mix(0.95, 0.45, low)]
  const skyLevel = 0.15 + 1.6 * day
  const sunRad = 1.4 * D
  const cosSun = Math.cos(sunRad)
  for (let row = 0; row < H; row++) {
    const v = 1 - (row + 0.5) / H
    const lat = (v - 0.5) * Math.PI
    const cl = Math.cos(lat), y = Math.sin(lat)
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W - 0.5) * 2 * Math.PI
      const dx = cl * Math.cos(lon), dz = cl * Math.sin(lon)
      const cosT = dx * sun[0] + y * sun[1] + dz * sun[2]
      const yy = Math.max(y, 0)
      const g = Math.pow(yy, 0.45)
      let r = mix(hor[0], zen[0], g), gg = mix(hor[1], zen[1], g), b = mix(hor[2], zen[2], g)
      r *= skyLevel; gg *= skyLevel; b *= skyLevel
      const c = Math.max(cosT, 0)
      const glow = day * ((0.35 + haze) * Math.pow(c, 6) + (1.5 + 3 * haze) * Math.pow(c, 64))
      r += sunCol[0] * glow; gg += sunCol[1] * glow; b += sunCol[2] * glow
      if (p.clouds > 0 && y > 0.01) {
        const k = 1 / (y + 0.06)
        const n = fbm(dx * k * 2.2 + 7, dz * k * 2.2 + 3)
        const cov = smooth(1 - p.clouds, 1 - p.clouds + 0.25, n) * smooth(0.0, 0.12, y)
        const lit = skyLevel * (0.85 + 0.6 * Math.pow(c, 4) * day)
        r = mix(r, lit * mix(1, sunCol[0], 0.4), cov)
        gg = mix(gg, lit * mix(1, sunCol[1], 0.4), cov)
        b = mix(b, lit * mix(1, sunCol[2], 0.4), cov)
      }
      if (y < 0) {
        const t = smooth(0, 0.08, -y)
        const gl = skyLevel * 0.35 + day * 0.4 * Math.max(sun[1], 0)
        r = mix(r, 0.32 * gl, t); gg = mix(gg, 0.28 * gl, t); b = mix(b, 0.22 * gl, t)
      } else if (cosT > cosSun && p.sunEl > -1) {
        const edge = 1 - 0.4 * (1 - (cosT - cosSun) / (1 - cosSun)) // limb darkening
        const s = p.sunPower * edge * mix(0.25, 1, day)
        r += sunCol[0] * s; gg += sunCol[1] * s; b += sunCol[2] * s
      }
      const i = (row * W + x) * 3
      out[i] = r; out[i + 1] = gg; out[i + 2] = b
    }
  }
  return out
}

/** Photo-studio environment: dark cyclorama with three rectangular softboxes. */
export function generateStudio(W = 1024, H = 512): Float32Array {
  const out = new Float32Array(W * H * 3)
  const boxes = [
    { az: -50, el: 35, w: 28, h: 18, i: 14, c: [1, 0.97, 0.92] }, // key
    { az: 60, el: 20, w: 22, h: 30, i: 5, c: [0.9, 0.95, 1] }, // fill
    { az: 170, el: 40, w: 40, h: 8, i: 9, c: [1, 1, 1] }, // rim strip
  ]
  for (let row = 0; row < H; row++) {
    const el = (0.5 - (row + 0.5) / H) * 180
    for (let x = 0; x < W; x++) {
      const az = ((x + 0.5) / W - 0.5) * 360
      let v = 0.06 + 0.05 * smooth(-30, 40, el)
      let r = v, g = v, b = v * 1.05
      for (const bx of boxes) {
        let da = Math.abs(az - bx.az)
        if (da > 180) da = 360 - da
        const f = smooth(bx.w / 2 + 2, bx.w / 2, da) * smooth(bx.h / 2 + 2, bx.h / 2, Math.abs(el - bx.el))
        r += f * bx.i * bx.c[0]; g += f * bx.i * bx.c[1]; b += f * bx.i * bx.c[2]
      }
      if (el < 0) {
        v = 0.12
        r = mix(r, v, 0.85)
        g = mix(g, v, 0.85)
        b = mix(b, v, 0.85)
      }
      const i = (row * W + x) * 3
      out[i] = r; out[i + 1] = g; out[i + 2] = b
    }
  }
  return out
}

/** One RGBE pixel (Greg Ward's shared-exponent format). */
export function toRGBE(r: number, g: number, b: number): [number, number, number, number] {
  const m = Math.max(r, g, b)
  if (!(m > 1e-32)) return [0, 0, 0, 0]
  const e = Math.floor(Math.log2(m)) + 1 // m = f · 2^e, f ∈ [0.5, 1)
  const sc = 256 / Math.pow(2, e)
  return [Math.min(255, Math.floor(r * sc)), Math.min(255, Math.floor(g * sc)), Math.min(255, Math.floor(b * sc)), e + 128]
}

export function fromRGBE(r: number, g: number, b: number, e: number): Vec3 {
  if (!e) return [0, 0, 0]
  const f = Math.pow(2, e - 136) // 2^(e-128) / 256
  return [(r + 0.5) * f, (g + 0.5) * f, (b + 0.5) * f]
}

/** Complete Radiance .hdr file (flat, uncompressed scanlines) from RGB floats, top row first. */
export function encodeHDR(rgb: Float32Array, W: number, H: number): Uint8Array {
  const head = new TextEncoder().encode(`#?RADIANCE\n# Browser Toolbox HDRI Viewer\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`)
  const out = new Uint8Array(head.length + W * H * 4)
  out.set(head)
  let o = head.length
  for (let i = 0; i < W * H; i++) {
    const p = toRGBE(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])
    out[o++] = p[0]; out[o++] = p[1]; out[o++] = p[2]; out[o++] = p[3]
  }
  return out
}

export interface HdrStats {
  peak: number
  mean: number // solid-angle weighted mean luminance
  stops: number // log2(peak / 1st percentile)
  sunAz: number
  sunEl: number
  clipped: number // fraction of the sphere above 1.0 (would clip in LDR)
}

/** Stats over an image with `ch` channels per pixel; `topFirst` says whether row 0 is the top. */
export function hdrStats(data: ArrayLike<number>, W: number, H: number, ch: number, topFirst = true): HdrStats {
  let peak = 0, pi = 0, sum = 0, wsum = 0, over = 0
  const step = Math.max(1, Math.floor((W * H) / 60000))
  const sample: number[] = []
  for (let row = 0; row < H; row++) {
    const lat = (0.5 - (row + 0.5) / H) * Math.PI
    const w = Math.cos(lat)
    for (let x = 0; x < W; x++) {
      const i = (row * W + x) * ch
      const L = luminance(data[i], data[i + 1], data[i + 2])
      if (!Number.isFinite(L)) continue
      sum += L * w
      wsum += w
      if (L > 1) over += w
      if (L > peak) {
        peak = L
        pi = row * W + x
      }
      if ((row * W + x) % step === 0 && L > 0) sample.push(L)
    }
  }
  sample.sort((a, b) => a - b)
  const p1 = sample.length ? sample[Math.floor(sample.length * 0.01)] : 0
  const row = Math.floor(pi / W), x = pi % W
  const v = topFirst ? 1 - (row + 0.5) / H : (row + 0.5) / H
  const [sunAz, sunEl] = uvToAzEl((x + 0.5) / W, v)
  return { peak, mean: wsum ? sum / wsum : 0, stops: p1 > 0 ? Math.log2(peak / p1) : 0, sunAz, sunEl, clipped: wsum ? over / wsum : 0 }
}

/** ACES filmic approximation (Narkowicz) + sRGB encoding, for 2D previews. */
export function toneMap8(x: number, exposure: number): number {
  const v = x * exposure * 0.6
  const t = Math.min(1, Math.max(0, (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14)))
  const s = t <= 0.0031308 ? 12.92 * t : 1.055 * Math.pow(t, 1 / 2.4) - 0.055
  return Math.round(s * 255)
}
