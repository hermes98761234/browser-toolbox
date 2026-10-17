import { describe, expect, it } from 'vitest'
import { collateDuplex, finalRot, move, moveBlock, norm, paperLabel, parsePageSet, shownSize } from './pdf-page-organizer'

describe('pdf page organizer', () => {
  it('normalises rotation', () => {
    expect(norm(-90)).toBe(270)
    expect(norm(450)).toBe(90)
    expect(finalRot({ baseRot: 270, rot: 180 })).toBe(90)
    expect(shownSize({ w: 595, h: 842, baseRot: 0, rot: 90 })).toEqual([842, 595])
  })
  it('moves items', () => {
    expect(move([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4])
    expect(move([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3])
    const l = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }))
    expect(moveBlock(l, new Set(['b', 'd']), 'a').map((x) => x.id).join('')).toBe('bdace')
    expect(moveBlock(l, new Set(['a', 'b']), null).map((x) => x.id).join('')).toBe('cdeab')
    expect(moveBlock(l, new Set(['b', 'c']), 'c').map((x) => x.id).join('')).toBe('abcde')
  })
  it('collates duplex scans', () => {
    // fronts 1,3,5 then backs 6,4,2
    expect(collateDuplex([1, 3, 5, 6, 4, 2])).toEqual([1, 2, 3, 4, 5, 6])
    expect(collateDuplex([1, 3, 5, 2, 4], false)).toEqual([1, 2, 3, 4, 5])
  })
  it('parses page sets', () => {
    expect(parsePageSet('1, 3-4, 9-', 10).idx).toEqual([0, 2, 3, 8, 9])
    expect(parsePageSet('12', 10).error).toMatch(/outside/)
    expect(parsePageSet('x', 10).error).toMatch(/Cannot/)
  })
  it('names paper', () => {
    expect(paperLabel(842, 595)).toBe('A4')
    expect(paperLabel(612, 792)).toBe('Letter')
    expect(paperLabel(283.46, 283.46)).toBe('100×100 mm')
  })
})
