import { describe, expect, it } from 'vitest'
import { bounds, gear, gearDims, gearOutline, signedVolume, spring, springLength, toStl, vase, type VaseParams } from './procedural-shape-maker'

const cyl: VaseParams = { height: 100, baseR: 30, bellyR: 30, bellyAt: 0.4, neckR: 30, neckAt: 0.8, lipR: 30, sides: 0, twist: 0, ripples: 0, rippleAmp: 0, wall: 0, segments: 128, rows: 20 }

describe('procedural shapes', () => {
  it('solid cylinder volume ≈ πr²h', () => {
    const f = vase(cyl)
    expect(signedVolume(f) / (Math.PI * 30 * 30 * 100)).toBeCloseTo(1, 2)
  })
  it('hollow cylinder subtracts the cavity', () => {
    const f = vase({ ...cyl, wall: 2 })
    const floor = 2.4
    const expected = Math.PI * 30 * 30 * 100 - Math.PI * 28 * 28 * (100 - floor)
    expect(signedVolume(f) / expected).toBeCloseTo(1, 1)
  })
  it('square cross-section has area ≈ 2r²', () => {
    const f = vase({ ...cyl, sides: 4, segments: 256 })
    expect(signedVolume(f) / (2 * 30 * 30 * 100)).toBeCloseTo(1, 2)
  })
  it('gear dimensions follow the module', () => {
    const d = gearDims({ teeth: 20, module: 2, pressureAngle: 20, thickness: 5, bore: 5 })
    expect(d.pitchD).toBe(40)
    expect(d.tipD).toBe(44)
    expect(d.rootD).toBe(35)
    expect(d.baseD).toBeCloseTo(37.588, 2)
  })
  it('gear outline angles are increasing and volume is between root and tip discs', () => {
    const g = { teeth: 20, module: 2, pressureAngle: 20, thickness: 5, bore: 0 }
    const o = gearOutline(g)
    for (let i = 1; i < o.length; i++) expect(o[i][0]).toBeGreaterThan(o[i - 1][0])
    const v = signedVolume(gear(g))
    expect(v).toBeGreaterThan(Math.PI * 17.5 ** 2 * 5)
    expect(v).toBeLessThan(Math.PI * 22 ** 2 * 5)
    // roughly the pitch disc
    expect(v / (Math.PI * 20 ** 2 * 5)).toBeCloseTo(1, 1)
  })
  it('bore removes its volume', () => {
    const g = { teeth: 20, module: 2, pressureAngle: 20, thickness: 5, bore: 0 }
    const a = signedVolume(gear(g))
    const b = signedVolume(gear({ ...g, bore: 8 }))
    expect((a - b) / (Math.PI * 16 * 5)).toBeCloseTo(1, 1)
  })
  it('spring volume ≈ wire area × length', () => {
    const s = { coilR: 15, wireR: 2, pitch: 8, turns: 5, segments: 24 }
    expect(signedVolume(spring(s)) / (Math.PI * 4 * springLength(s))).toBeCloseTo(1, 1)
    const b = bounds(spring(s))
    expect(b.max[1] - b.min[1]).toBeCloseTo(5 * 8 + 4, 0)
  })
  it('binary STL has the right size and header count', () => {
    const f = vase({ ...cyl, segments: 16, rows: 4 })
    const buf = toStl(f)
    expect(buf.byteLength).toBe(84 + (f.length / 9) * 50)
    expect(new DataView(buf).getUint32(80, true)).toBe(f.length / 9)
  })
})
