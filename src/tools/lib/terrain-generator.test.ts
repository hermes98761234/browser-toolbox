import { describe, expect, it } from 'vitest'
import { crc32, generate, hydraulicErode, pngFile, pngScanlines, simplex2, smooth, thermalErode, toObj, toStl, zlibStored } from './terrain-generator'
import { inflateSync } from 'node:zlib'

const OPTS = { size: 33, seed: 7, scale: 3, octaves: 4, persistence: 0.5, lacunarity: 2, type: 'fbm' as const, island: 0.5, warp: 0.3, exponent: 1.2 }
const variance = (a: Float32Array) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length }

describe('terrain generator', () => {
  it('simplex noise is deterministic, bounded and seed-dependent', () => {
    const a = simplex2(1), b = simplex2(1), c = simplex2(2)
    let diff = 0
    for (let i = 0; i < 500; i++) {
      const x = i * 0.137, y = i * 0.291
      expect(a(x, y)).toBe(b(x, y))
      expect(Math.abs(a(x, y))).toBeLessThanOrEqual(1.0001)
      diff += Math.abs(a(x, y) - c(x, y))
    }
    expect(diff).toBeGreaterThan(10)
    expect(a(0, 0)).toBeCloseTo(0, 6) // lattice points are zero
  })
  it('generate normalises to [0,1]', () => {
    const h = generate(OPTS)
    expect(h.length).toBe(33 * 33)
    expect(Math.min(...h)).toBeCloseTo(0, 6)
    expect(Math.max(...h)).toBeCloseTo(1, 6)
    expect(generate(OPTS)).toEqual(h)
  })
  it('smoothing and erosion reduce roughness', () => {
    const h = generate({ ...OPTS, type: 'ridged', island: 0 })
    const rough = (a: Float32Array) => { let s = 0; for (let i = 1; i < a.length; i++) s += Math.abs(a[i] - a[i - 1]); return s }
    expect(rough(smooth(h, 33, 2))).toBeLessThan(rough(h))
    expect(variance(smooth(h, 33, 3))).toBeLessThan(variance(h))
    expect(rough(thermalErode(h, 33, 20, 0.01))).toBeLessThan(rough(h))
    const e = hydraulicErode(h, 33, 200, 3)
    expect(e.some((v, i) => v !== h[i])).toBe(true)
  })
  it('crc32 matches reference', () => {
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082)
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('writes a decodable 16-bit PNG', () => {
    const h = new Float32Array([0, 0.5, 1, 0.25])
    const raw = pngScanlines(h, 2, 16)
    expect([...raw]).toEqual([0, 0, 0, 0x80, 0x00, 0, 0xff, 0xff, 0x40, 0x00])
    const z = zlibStored(raw)
    expect([...inflateSync(z)]).toEqual([...raw])
    const png = pngFile(2, 16, z)
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(png[24]).toBe(16) // bit depth
    const big = new Uint8Array(70000).map((_, i) => i & 255)
    expect(inflateSync(zlibStored(big)).length).toBe(70000)
  })
  it('exports OBJ and closed STL', () => {
    const h = new Float32Array(9).fill(0.5)
    const obj = toObj(h, 3, 10, 2)
    expect(obj.split('\n').filter((l) => l.startsWith('v ')).length).toBe(9)
    expect(obj.split('\n').filter((l) => l.startsWith('f ')).length).toBe(8)
    const stl = toStl(h, 3, 10, 2, 1)
    const n = new DataView(stl.buffer).getUint32(80, true)
    expect(n).toBe(8 + 8 + 4 * 2 * 2)
    expect(stl.length).toBe(84 + 50 * n)
    // outward winding: signed volume equals the solid's volume (10 × 10 × (1 + 0.5·2))
    const dv = new DataView(stl.buffer)
    let vol = 0
    for (let t = 0; t < n; t++) {
      const f = (k: number) => dv.getFloat32(84 + t * 50 + 12 + k * 4, true)
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from({ length: 9 }, (_, k) => f(k))
      vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
    }
    expect(vol).toBeCloseTo(200, 3)
  })
})
