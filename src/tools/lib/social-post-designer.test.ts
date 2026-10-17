import { describe, expect, it } from 'vitest'
import { coverRect, ratio, unit, wrapLines } from './social-post-designer'

describe('social post designer math', () => {
  it('coverRect centre-crops', () => {
    expect(coverRect(2000, 1000, 1000, 1000)).toEqual({ x: -500, y: 0, w: 2000, h: 1000 })
    expect(coverRect(500, 1000, 1000, 1000)).toEqual({ x: 0, y: -500, w: 1000, h: 2000 })
  })
  it('wrapLines', () => {
    expect(wrapLines('one two three', 7, (s) => s.length)).toEqual(['one two', 'three'])
    expect(wrapLines('a\nb', 99, (s) => s.length)).toEqual(['a', 'b'])
    expect(wrapLines('extraordinary', 3, (s) => s.length)).toEqual(['extraordinary'])
  })
  it('ratio and unit', () => {
    expect(ratio(1080, 1350)).toBe('4:5')
    expect(ratio(1080, 1920)).toBe('9:16')
    expect(ratio(1200, 627)).toBe('1.91:1')
    expect(unit(1080, 1920)).toBe(1)
  })
})
