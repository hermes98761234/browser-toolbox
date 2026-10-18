import { describe, expect, it } from 'vitest'
import { fillTemplate, mirrorSpot, numbering, place, styled, toAlpha, toRoman, toUser, visualSize } from './pdf-page-numberer'

describe('pdf-page-numberer', () => {
  it('formats number styles', () => {
    expect(toRoman(1994)).toBe('MCMXCIV')
    expect(toRoman(4)).toBe('IV')
    expect(toAlpha(1)).toBe('A')
    expect(toAlpha(26)).toBe('Z')
    expect(toAlpha(27)).toBe('AA')
    expect(toAlpha(702)).toBe('ZZ')
    expect(styled(7, 'arabic', 4)).toBe('0007')
    expect(styled(9, 'roman')).toBe('ix')
  })
  it('fills templates', () => {
    const c = { n: 3, total: 12, page: 5, pages: 14, file: 'report.pdf', date: '2026-01-02' }
    expect(fillTemplate('Page {n} of {total}', c, 'arabic', 0)).toBe('Page 3 of 12')
    expect(fillTemplate('{file} · {date} · sheet {page}/{pages}', c, 'arabic', 0)).toBe('report · 2026-01-02 · sheet 5/14')
    expect(fillTemplate('ACME-{n}', c, 'arabic', 6)).toBe('ACME-000003')
  })
  it('numbers selected pages from a start value', () => {
    const r = numbering([2, 3, 4], 1)
    expect(r.map.get(2)).toBe(1)
    expect(r.map.get(4)).toBe(3)
    expect(r.total).toBe(3)
    expect(numbering([1, 2], 10).total).toBe(11)
  })
  it('mirrors on even pages', () => {
    expect(mirrorSpot('bottom-right', 2, true)).toBe('bottom-left')
    expect(mirrorSpot('bottom-right', 3, true)).toBe('bottom-right')
    expect(mirrorSpot('top-center', 2, true)).toBe('top-center')
    expect(mirrorSpot('top-left', 2, false)).toBe('top-left')
  })
  it('places text in page space', () => {
    const box = { x: 0, y: 0, w: 600, h: 800 }
    expect(place('bottom-center', box, 100, 10, 36, 30)).toEqual([250, 30])
    expect(place('bottom-right', box, 100, 10, 36, 30)).toEqual([464, 30])
    const [x, y] = place('top-left', { x: 10, y: 20, w: 600, h: 800 }, 50, 10, 36, 30)
    expect(x).toBe(46)
    expect(y).toBeCloseTo(782.8)
  })
})

describe('rotation', () => {
  const box = { x: 0, y: 0, w: 600, h: 800 }
  it('maps visual points to user space', () => {
    expect(toUser(10, 20, 0, box)).toEqual([10, 20, 0])
    // Rotate 90: visual is 800 wide × 600 tall; visual bottom-left (0,0) is user (600, 0)
    expect(toUser(0, 0, 90, box)).toEqual([600, 0, 90])
    expect(toUser(0, 0, 180, box)).toEqual([600, 800, 180])
    expect(toUser(0, 0, 270, box)).toEqual([0, 800, 270])
    expect(visualSize(600, 800, 90)).toEqual([800, 600])
  })
})
