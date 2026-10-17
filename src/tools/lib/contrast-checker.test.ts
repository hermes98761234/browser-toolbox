import { describe, expect, it } from 'vitest'
import { apca, contrast, fromOklch, parseColor, suggest, toHex, toOklch, verdict } from './contrast-checker'

const c = (s: string) => parseColor(s)!

describe('contrast-checker', () => {
  it('parses colours', () => {
    expect(c('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(c('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(toHex(c('hsl(120, 100%, 25%)'))).toBe('#008000')
    expect(c('rgba(0,0,0,0.5)')!.a).toBe(0.5)
    expect(toHex(c('rebeccapurple'))).toBe('#663399')
    expect(parseColor('nope')).toBeNull()
  })
  it('computes WCAG ratios', () => {
    expect(contrast(c('#000'), c('#fff'))).toBeCloseTo(21, 9)
    expect(contrast(c('#767676'), c('#fff'))).toBeCloseTo(4.54, 2)
    expect(contrast(c('#777'), c('#fff'))).toBeCloseTo(4.48, 2)
    expect(contrast(c('#fff'), c('#fff'))).toBe(1)
    expect(verdict(4.6)).toEqual({ normalAA: true, normalAAA: false, largeAA: true, largeAAA: true, ui: true })
    // 50 % black over white = #808080-ish
    expect(contrast(c('rgba(0,0,0,0.5)'), c('#fff'))).toBeCloseTo(contrast(c('#808080'), c('#fff')), 1)
  })
  it('computes APCA Lc', () => {
    expect(apca(c('#000'), c('#fff'))).toBeCloseTo(106.04, 1)
    expect(apca(c('#fff'), c('#000'))).toBeCloseTo(-107.88, 1)
    expect(apca(c('#888'), c('#fff'))).toBeCloseTo(63.06, 0)
  })
  it('round-trips OKLCH', () => {
    const x = c('#3b82f6')
    const [L, C, H] = toOklch(x)
    expect(toHex(fromOklch(L, C, H))).toBe('#3b82f6')
  })
  it('suggests accessible colours', () => {
    const s = suggest(c('#88aaff'), c('#ffffff'), 4.5)!
    expect(s.ratio).toBeGreaterThanOrEqual(4.5)
    expect(s.ratio).toBeLessThan(5)
    const bg = suggest(c('#ffcc00'), c('#ffffff'), 3, true)!
    expect(bg.ratio).toBeGreaterThanOrEqual(3)
  })
})
