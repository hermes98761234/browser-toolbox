import { describe as d, expect, it } from 'vitest'
import { describe, hslToRgb, hsvToRgb, inGamut, labToXyz, linearToOklab, linearToXyz, oklabToLinear, p3LinearToXyz, parseHex, rgbToHsl, rgbToHsv, srgbToLinear, toHex, xyzToLab, xyzToLinear, xyzToP3Linear, type V3 } from './color-space-explorer'

const close = (a: number[], b: number[], dp = 3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], dp))

d('reference values', () => {
  it('sRGB transfer and XYZ', () => {
    expect(srgbToLinear([0.5, 0.5, 0.5])[0]).toBeCloseTo(0.21404, 4)
    close(linearToXyz([1, 1, 1]), [0.95047, 1, 1.08883], 3)
    close(linearToXyz([1, 0, 0]), [0.41239, 0.21264, 0.01933], 4)
  })
  it('CIELAB (D65)', () => {
    close(describe([1, 0, 0]).lab, [53.2408, 80.0925, 67.2032], 2)
    close(describe([0, 0, 1]).lab, [32.2970, 79.1875, -107.8602], 1)
    close(describe([1, 1, 1]).lab, [100, 0, 0], 3)
    close(describe(parseHex('#808080')!).lab, [53.585, 0, 0], 2)
  })
  it('OKLab / OKLCH', () => {
    close(describe([1, 1, 1]).oklab, [1, 0, 0], 3)
    close(describe([1, 0, 0]).oklab, [0.62796, 0.22486, 0.12585], 3)
    close(describe([0, 1, 0]).oklab, [0.86644, -0.23389, 0.1795], 3)
    close(describe([0, 0, 1]).oklab, [0.45201, -0.03246, -0.31153], 3)
    close(describe([1, 0, 0]).oklch, [0.62796, 0.25768, 29.2339], 2)
  })
  it('HSL / HSV', () => {
    close(rgbToHsl(parseHex('#ff8000')!), [30.1176, 1, 0.5], 3)
    close(rgbToHsv(parseHex('#336699')!), [210, 0.6667, 0.6], 3)
    expect(toHex(hslToRgb([210, 0.5, 0.4]))).toBe('#336699')
    expect(toHex(hsvToRgb([0, 1, 1]))).toBe('#ff0000')
  })
})

d('round trips and gamut', () => {
  const samples: V3[] = [[0.2, 0.7, 0.4], [0.95, 0.1, 0.6], [0, 0, 0], [0.5, 0.5, 0.5]]
  it('Lab, OKLab, HSL, HSV invert', () => {
    for (const c of samples) {
      const lin = srgbToLinear(c)
      close(xyzToLinear(labToXyz(xyzToLab(linearToXyz(lin)))), lin, 6)
      close(oklabToLinear(linearToOklab(lin)), lin, 5)
      close(hslToRgb(rgbToHsl(c)), c, 9)
      close(hsvToRgb(rgbToHsv(c)), c, 9)
    }
  })
  it('Display-P3 is wider than sRGB', () => {
    close(p3LinearToXyz([1, 1, 1]), [0.95047, 1, 1.08883], 3)
    expect(inGamut(xyzToLinear(p3LinearToXyz([0, 1, 0])))).toBe(false)
    expect(inGamut(xyzToP3Linear(linearToXyz([0, 1, 0])))).toBe(true)
  })
})
