import { describe, expect, it } from 'vitest'
import { asWrittenSize, bestSize, convertCount, gaugeDiff, widthOf } from './gauge-converter'

describe('gauge converter', () => {
  it('rescales counts', () => {
    expect(convertCount(100, 20, 22).exact).toBeCloseTo(110)
    expect(convertCount(101, 20, 22).rounded).toBe(111)
    // snap to multiple of 4 + 2
    expect(convertCount(100, 20, 22, 4, 2).rounded).toBe(110)
    expect(convertCount(100, 20, 23, 4, 2).rounded).toBe(114)
  })
  it('computes sizes', () => {
    expect(widthOf(110, 22, 10)).toBeCloseTo(50)
    expect(asWrittenSize(100, 20, 18)).toBeCloseTo(111.11, 2)
    expect(bestSize([86, 96, 106, 116], 20, 18, 100)).toBe(0) // 86 * 20/18 = 95.6, 96 → 106.7
    expect(gaugeDiff(20, 22)).toBeCloseTo(0.1)
  })
})
