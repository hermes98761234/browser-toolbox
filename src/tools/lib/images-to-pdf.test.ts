import { describe, expect, it } from 'vitest'
import { effectiveDpi, move, pageSize, place } from './images-to-pdf'

describe('images to pdf geometry', () => {
  it('A4 in points and auto orientation', () => {
    const [w, h] = pageSize('a4', 'auto', 800, 600, 0)
    expect(w).toBeCloseTo(841.89, 1)
    expect(h).toBeCloseTo(595.28, 1)
    expect(pageSize('letter', 'portrait', 800, 600, 0)).toEqual([612, 792])
    expect(pageSize('fit', 'auto', 960, 480, 10)).toEqual([740, 380])
  })
  it('contain centres and keeps aspect', () => {
    const p = place(1000, 500, 612, 792, 36, 'contain')
    expect(p.w).toBeCloseTo(540)
    expect(p.h).toBeCloseTo(270)
    expect(p.x).toBeCloseTo(36)
    expect(p.y).toBeCloseTo(36 + (720 - 270) / 2)
  })
  it('cover fills the box and clips', () => {
    const p = place(1000, 500, 612, 792, 0, 'cover')
    expect(p.h).toBeCloseTo(792)
    expect(p.w).toBeCloseTo(1584)
    expect(p.clip).toBe(true)
  })
  it('dpi and reorder', () => {
    expect(effectiveDpi(3000, 720)).toBe(300)
    expect(move(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(move(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })
})
