import { describe, expect, it } from 'vitest'
import { canvasH, cells, runtime, sampleBoard, starts, tc, winAnsi, wrap } from './storyboard-maker'

describe('storyboard', () => {
  it('canvas height follows aspect', () => {
    expect(canvasH('16:9')).toBe(540)
    expect(canvasH('1:1')).toBe(960)
  })
  it('lays out a 3x2 page inside the margins', () => {
    const c = cells(792, 612, 6, 16 / 9)
    expect(c).toHaveLength(6)
    for (const { img, text } of c) {
      expect(img.x).toBeGreaterThanOrEqual(36)
      expect(img.x + img.w).toBeLessThanOrEqual(792 - 36 + 1e-6)
      expect(text.y).toBeGreaterThanOrEqual(36 - 1e-6)
      expect(img.w / img.h).toBeCloseTo(16 / 9)
    }
  })
  it('wraps words by measured width', () => {
    const m = (s: string) => s.length
    expect(wrap('aa bb cc dd', 5, m)).toEqual(['aa bb', 'cc dd'])
    expect(wrap('abcdefghij', 4, m)).toEqual(['abcd', 'efgh', 'ij'])
    expect(wrap('one\ntwo', 10, m)).toEqual(['one', 'two'])
  })
  it('cleans text for standard fonts and totals running time', () => {
    expect(winAnsi('“Hi” — ok…')).toBe('"Hi" - ok...')
    expect(winAnsi('Привіт')).toBe('??????')
    const b = sampleBoard()
    expect(runtime(b.frames)).toBe(21)
    expect(starts(b.frames).slice(0, 3)).toEqual([0, 4, 7])
    expect(tc(75)).toBe('1:15')
  })
})
