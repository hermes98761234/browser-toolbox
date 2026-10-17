import { describe, expect, it } from 'vitest'
import { counts, deskewAngle, otsu, reflow, tidy } from './note-ocr'

describe('note-ocr', () => {
  it('otsu splits a bimodal histogram', () => {
    const g = [...new Array(500).fill(30), ...new Array(500).fill(220)]
    const t = otsu(g)
    expect(t).toBeGreaterThanOrEqual(30)
    expect(t).toBeLessThan(220)
  })
  it('finds the tilt of synthetic text lines', () => {
    const xs: number[] = [], ys: number[] = []
    const tilt = (4 * Math.PI) / 180
    for (let line = 0; line < 6; line++) for (let x = 0; x < 400; x += 2) { xs.push(x); ys.push(40 + line * 30 + x * Math.tan(tilt)) }
    expect((deskewAngle(xs, ys) * 180) / Math.PI).toBeCloseTo(4, 0)
    expect(deskewAngle([1], [1])).toBe(0)
  })
  it('reflows wrapped lines but keeps bullets', () => {
    expect(reflow('This is a long\nsentence that wraps.\n- item one\n- item two')).toBe('This is a long sentence that wraps.\n- item one\n- item two')
    expect(reflow('hyphen-\nated word')).toBe('hyphenated word')
    expect(reflow('Title:\nbody')).toBe('Title:\nbody')
  })
  it('tidies', () => {
    expect(tidy('• one ,  two\n“q”')).toBe('- one, two\n"q"')
    expect(counts('a b\nc')).toEqual({ words: 3, chars: 5, lines: 2 })
  })
})
