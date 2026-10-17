import { describe, expect, it } from 'vitest'
import { addUnique, buildRegex, findBoxes, normRect, pagesToRaster, PRESETS, type TRun } from './pdf-redactor'

const runs: TRun[] = [{ str: 'SSN: 123-45-6789 ok', x: 100, y: 200, w: 190, h: 10 }]

describe('pdf-redactor', () => {
  it('builds safe regexes', () => {
    expect(buildRegex('', { regex: false, caseSens: false, word: false })).toBeNull()
    expect(buildRegex('a*', { regex: true, caseSens: false, word: false })).toBeNull()
    expect(buildRegex('(', { regex: true, caseSens: false, word: false })).toBeNull()
    expect(buildRegex('a.b', { regex: false, caseSens: true, word: false })!.source).toBe('a\\.b')
  })
  it('places a box over the matched characters', () => {
    const re = new RegExp(PRESETS.find((p) => p.key === 'ssn')!.re, 'g')
    const [b] = findBoxes(runs, re, 0, 'ssn', 0)
    // 19 chars over 190pt → 10pt per char; match at index 5, length 11
    expect(b.x).toBeCloseTo(150)
    expect(b.w).toBeCloseTo(110)
    expect(b.y).toBeLessThan(200)
    expect(b.y + b.h).toBeGreaterThan(200)
  })
  it('finds every occurrence and dedupes', () => {
    const re = buildRegex('o', { regex: false, caseSens: false, word: false })!
    const bs = findBoxes([{ str: 'foo boo', x: 0, y: 10, w: 70, h: 10 }], re, 1, 't')
    expect(bs).toHaveLength(4)
    expect(addUnique(bs, bs)).toHaveLength(4)
  })
  it('matches preset patterns', () => {
    const t = (k: string, s: string) => new RegExp(PRESETS.find((p) => p.key === k)!.re).test(s)
    expect(t('email', 'mail jane.doe+x@example.co.uk now')).toBe(true)
    expect(t('phone', 'Call (555) 010-4477')).toBe(true)
    expect(t('card', '4111 1111 1111 1111')).toBe(true)
    expect(t('iban', 'DE89 3704 0044 0532 0130 00')).toBe(true)
  })
  it('normalizes rects and lists raster pages', () => {
    expect(normRect(50, 40, 10, 10, 30, 100)).toEqual({ x: 10, y: 10, w: 20, h: 30 })
    expect(pagesToRaster([{ id: 'a', page: 2, x: 0, y: 0, w: 1, h: 1, src: '' }, { id: 'b', page: 0, x: 0, y: 0, w: 1, h: 1, src: '' }], 3, false)).toEqual([0, 2])
    expect(pagesToRaster([], 3, true)).toEqual([0, 1, 2])
  })
})
