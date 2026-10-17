import { describe, expect, it } from 'vitest'
import { cycleStage, freeAmmoniaFraction, status } from './aquarium-water-log'

describe('aquarium chemistry', () => {
  it('free ammonia fraction matches Emerson tables', () => {
    // Emerson 1975: 25 °C, pH 7.0 → 0.566 %; pH 8.0 → 5.38 %
    expect(freeAmmoniaFraction(7, 25) * 100).toBeCloseTo(0.566, 2)
    expect(freeAmmoniaFraction(8, 25) * 100).toBeCloseTo(5.38, 1)
  })
  it('classifies ranges', () => {
    expect(status('fresh', 'nh3', 0)).toBe('ok')
    expect(status('fresh', 'nh3', 0.5)).toBe('warn')
    expect(status('fresh', 'nh3', 2)).toBe('bad')
    expect(status('reef', 'ph', 8.2)).toBe('ok')
    expect(status('fresh', 'ph', undefined)).toBe('none')
  })
  it('detects cycle stages', () => {
    const d = (n: number) => `2026-01-${String(n).padStart(2, '0')}`
    expect(cycleStage([]).stage).toBe(0)
    expect(cycleStage([{ id: '1', date: d(1), nh3: 2, no2: 0, no3: 0 }]).stage).toBe(1)
    expect(cycleStage([{ id: '1', date: d(1), nh3: 2, no2: 0 }, { id: '2', date: d(8), nh3: 1, no2: 2, no3: 5 }]).stage).toBe(2)
    expect(cycleStage([{ id: '1', date: d(8), nh3: 1, no2: 4, no3: 5 }, { id: '2', date: d(20), nh3: 0, no2: 0.5, no3: 20 }]).stage).toBe(3)
    const done = [1, 2, 3].map((n) => ({ id: String(n), date: d(20 + n), nh3: 0, no2: 0, no3: 30 }))
    expect(cycleStage(done).stage).toBe(4)
  })
})
