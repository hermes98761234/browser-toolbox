import { describe, expect, it } from 'vitest'
import { clampRange, fmtTime, parseTime, pickMime } from './video-trimmer'

describe('video trimmer time helpers', () => {
  it('fmtTime', () => {
    expect(fmtTime(0)).toBe('0:00.000')
    expect(fmtTime(75.5)).toBe('1:15.500')
    expect(fmtTime(3725.25, 1)).toBe('1:02:05.3')
    expect(fmtTime(59.9996)).toBe('1:00.000')
  })
  it('parseTime', () => {
    expect(parseTime('75')).toBe(75)
    expect(parseTime('1:15.5')).toBe(75.5)
    expect(parseTime('1:02:05')).toBe(3725)
    expect(parseTime('abc')).toBeNaN()
    expect(parseTime('1:-2')).toBeNaN()
    expect(parseTime(fmtTime(123.456))).toBeCloseTo(123.456)
  })
  it('clampRange', () => {
    expect(clampRange(-1, 5, 10)).toEqual([0, 5])
    expect(clampRange(4, 3, 10)).toEqual([4, 4.1])
    expect(clampRange(9.99, 12, 10)).toEqual([9.9, 10])
  })
  it('pickMime', () => {
    expect(pickMime((m) => m === 'video/webm')).toBe('video/webm')
    expect(pickMime(() => false)).toBe('')
  })
})
