import { describe, expect, it } from 'vitest'
import { applyToPixels, blendLut, makeLut3D, parseCube, PRESETS, sample, toCube } from './lut-previewer'

describe('cube parser', () => {
  it('parses a 2³ identity with comments and title', () => {
    const txt = `# test\nTITLE "Id"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n`
    const { lut, warnings } = parseCube(txt)
    expect(lut.title).toBe('Id')
    expect(lut.kind).toBe('3D')
    expect(warnings).toEqual([])
    const v = sample(lut, 0.3, 0.6, 0.9)
    expect(v[0]).toBeCloseTo(0.3)
    expect(v[1]).toBeCloseTo(0.6)
    expect(v[2]).toBeCloseTo(0.9)
  })
  it('trilinear is exact for affine LUTs', () => {
    const l = makeLut3D(5, (r, g, b) => [0.5 * r + 0.2 * b, g * 0.8 + 0.1, 1 - b])
    const v = sample(l, 0.37, 0.71, 0.13)
    expect(v[0]).toBeCloseTo(0.5 * 0.37 + 0.2 * 0.13, 6)
    expect(v[1]).toBeCloseTo(0.71 * 0.8 + 0.1, 6)
    expect(v[2]).toBeCloseTo(0.87, 6)
  })
  it('handles 1D tables and DOMAIN_MAX', () => {
    const { lut } = parseCube('LUT_1D_SIZE 3\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2\n0 0 0\n0.25 0.5 1\n1 1 1\n')
    expect(lut.kind).toBe('1D')
    const v = sample(lut, 1.5, 1.5, 0.5)
    expect(v[0]).toBeCloseTo(0.625)
    expect(v[1]).toBeCloseTo(0.75)
    expect(v[2]).toBeCloseTo(0.5)
  })
  it('reports errors', () => {
    expect(() => parseCube('hello')).toThrow(/LUT_3D_SIZE/)
    expect(() => parseCube('LUT_3D_SIZE 2\n0 0 0\n')).toThrow(/Expected 8/)
  })
  it('round-trips through toCube', () => {
    const l = PRESETS[1].make()
    const back = parseCube(toCube(l)).lut
    expect(back.size).toBe(l.size)
    expect(back.data[1234]).toBeCloseTo(l.data[1234], 5)
  })
  it('identity preset leaves pixels unchanged and intensity 0 is a no-op', () => {
    const px = new Uint8ClampedArray([10, 200, 77, 255, 255, 0, 128, 128])
    expect([...applyToPixels(PRESETS[0].make(), px)]).toEqual([...px])
    expect([...applyToPixels(PRESETS[5].make(), px, 0)]).toEqual([...px])
  })
  it('blend at 0 gives identity', () => {
    const b = blendLut(PRESETS[3].make(), 0)
    const v = sample(b, 0.2, 0.4, 0.6)
    expect(v[0]).toBeCloseTo(0.2)
    expect(v[2]).toBeCloseTo(0.6)
  })
})
