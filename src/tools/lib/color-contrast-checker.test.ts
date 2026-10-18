import { describe, expect, it } from 'vitest'
import { apca, apcaUse, deltaOk, fromOklch, matrix, parsePalette, passes, simulateHex, suggest, toOklch, wcag, wcagGrade } from './color-contrast-checker'

describe('WCAG', () => {
  it('matches reference ratios', () => {
    expect(wcag('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(wcag('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
    expect(wcag('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
    expect(wcagGrade(4.6)).toBe('AA')
    expect(wcagGrade(3.2)).toBe('AA Large')
  })
})

describe('APCA 0.0.98G-4g', () => {
  it('matches published reference values', () => {
    expect(apca('#000000', '#ffffff')).toBeCloseTo(106.04, 1)
    expect(apca('#ffffff', '#000000')).toBeCloseTo(-107.88, 1)
    expect(apca('#888888', '#ffffff')).toBeCloseTo(63.06, 1)
    expect(apca('#ffffff', '#888888')).toBeCloseTo(-68.54, 1)
    expect(apca('#000000', '#aaaaaa')).toBeCloseTo(58.15, 1)
    expect(apca('#123456', '#123456')).toBe(0)
    expect(apcaUse(80)).toMatch(/Body text/)
  })
})

describe('OKLCH suggestions', () => {
  it('round-trips colours', () => {
    expect(fromOklch(toOklch('#3366cc'))).toBe('#3366cc')
  })
  it('finds the nearest passing colour and keeps the hue', () => {
    const s = suggest('#7aa7ff', '#ffffff', 'wcag', 4.5)!
    expect(passes(s.hex, '#ffffff', 'wcag', 4.5)).toBe(true)
    expect(wcag(s.hex, '#ffffff')).toBeLessThan(4.8) // nearest, not overshooting
    expect(Math.abs(toOklch(s.hex)[2] - toOklch('#7aa7ff')[2])).toBeLessThan(4)
    const a = suggest('#888888', '#ffffff', 'apca', 75)!
    expect(Math.abs(apca(a.hex, '#ffffff'))).toBeGreaterThanOrEqual(75)
    expect(suggest('#000000', '#ffffff', 'wcag', 4.5)!.dL).toBe(0)
    expect(suggest('#808080', '#808080', 'wcag', 22)).toBeNull()
  })
})

describe('palette tools', () => {
  it('parses palettes and builds the matrix', () => {
    expect(parsePalette('--a: #FFF; --b:#123456; "#123456", #abc')).toEqual(['#ffffff', '#123456', '#aabbcc'])
    const m = matrix(['#000000', '#ffffff'])
    expect(m[0][1].ratio).toBeCloseTo(21)
    expect(m[0][0].ratio).toBe(1)
  })
  it('simulates colour-vision deficiency', () => {
    const red = simulateHex('#ff0000', 'deutan'), green = simulateHex('#00a000', 'deutan')
    expect(deltaOk(red, green)).toBeLessThan(deltaOk('#ff0000', '#00a000') / 2)
    expect(simulateHex('#808080', 'achroma')).toBe('#808080')
  })
})
