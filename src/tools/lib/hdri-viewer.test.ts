import { describe, expect, it } from 'vitest'
import { azElToUv, dirFromAzEl, encodeHDR, fromRGBE, generateSky, hdrStats, toRGBE, uvToAzEl } from './hdri-viewer'

describe('hdri-viewer', () => {
  it('maps directions like three.js equirect', () => {
    const [x, y, z] = dirFromAzEl(0, 90)
    expect(y).toBeCloseTo(1)
    expect(Math.hypot(x, z)).toBeCloseTo(0)
    const d = dirFromAzEl(90, 0)
    expect(d[2]).toBeCloseTo(1)
    // three: u = atan2(z, x) / 2π + 0.5
    const [u, v] = azElToUv(90, 30)
    expect(u).toBeCloseTo(Math.atan2(d[2], d[0]) / (2 * Math.PI) + 0.5)
    expect(uvToAzEl(u, v)).toEqual([expect.closeTo(90), expect.closeTo(30)])
    expect(azElToUv(270, 0)[0]).toBeCloseTo(azElToUv(-90, 0)[0])
  })
  it('round-trips RGBE within 1%', () => {
    for (const c of [[1, 0.5, 0.25], [1234.5, 10, 0.01], [0.003, 0.002, 0.001]] as [number, number, number][]) {
      const back = fromRGBE(...toRGBE(...c))
      expect(back[0] / c[0]).toBeCloseTo(1, 1)
    }
    expect(toRGBE(0, 0, 0)).toEqual([0, 0, 0, 0])
    expect(toRGBE(1, 1, 1)[3]).toBe(129)
  })
  it('writes a valid Radiance header', () => {
    const f = encodeHDR(new Float32Array(4 * 2 * 3).fill(1), 4, 2)
    const txt = new TextDecoder().decode(f.slice(0, 80))
    expect(txt.startsWith('#?RADIANCE')).toBe(true)
    expect(txt).toContain('-Y 2 +X 4\n')
  })
  it('finds the sun in a generated sky', () => {
    const W = 256, H = 128
    const sky = generateSky({ sunAz: 40, sunEl: 25, turbidity: 3, clouds: 0, sunPower: 500 }, W, H)
    const st = hdrStats(sky, W, H, 3, true)
    expect(st.sunAz).toBeCloseTo(40, -1)
    expect(st.sunEl).toBeCloseTo(25, -1)
    expect(st.peak).toBeGreaterThan(100)
    expect(st.stops).toBeGreaterThan(8)
    const flipped = hdrStats(sky, W, H, 3, false)
    expect(flipped.sunEl).toBeCloseTo(-25, -1)
  })
})
