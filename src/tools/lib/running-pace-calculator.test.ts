import { describe, expect, it } from 'vitest'
import { fmtTime, parseTime, riegel, splits } from './running-pace-calculator'

describe('running pace', () => {
  it('parses and formats times', () => {
    expect(parseTime('1:23:45')).toBe(5025)
    expect(parseTime('23:45')).toBe(1425)
    expect(parseTime('3h20m')).toBe(12000)
    expect(parseTime('5:75')).toBeNaN()
    expect(fmtTime(5025)).toBe('1:23:45')
    expect(fmtTime(299.6)).toBe('5:00')
  })
  it('predicts with Riegel', () => {
    // 20:00 5K → 10K ≈ 41:42
    expect(riegel(1200, 5, 10)).toBeCloseTo(2501.92, 1)
  })
  it('splits sum to total and honour negative split', () => {
    const sp = splits(10, 3000, 1, 0)
    expect(sp).toHaveLength(10)
    expect(sp[9].cum).toBeCloseTo(3000)
    expect(sp[0].pace).toBeCloseTo(300)
    const ng = splits(10, 3000, 1, 0.04)
    expect(ng[9].cum).toBeCloseTo(3000)
    const first = ng[4].cum, second = 3000 - ng[4].cum
    expect(first / second).toBeCloseTo(1.04, 6)
    expect(splits(21.0975, 6000, 1)).toHaveLength(22)
  })
})
