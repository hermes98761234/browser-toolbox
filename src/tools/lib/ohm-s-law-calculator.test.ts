import { describe, expect, it } from 'vitest'
import { formatSI, nearestE, parseSI, powerRating, solve } from './ohm-s-law-calculator'

describe('ohm', () => {
  it('parses SI', () => {
    expect(parseSI('4.7k')).toBeCloseTo(4700)
    expect(parseSI('4k7')).toBeCloseTo(4700)
    expect(parseSI('2R2')).toBeCloseTo(2.2)
    expect(parseSI('220 mA')).toBeCloseTo(0.22)
    expect(parseSI('1.5MΩ')).toBeCloseTo(1.5e6)
    expect(parseSI('12V')).toBe(12)
    expect(parseSI('10 µA')).toBeCloseTo(1e-5)
    expect(parseSI('abc')).toBeNull()
  })
  it('formats SI', () => {
    expect(formatSI(0.022, 'A')).toBe('22 mA')
    expect(formatSI(4700, 'Ω')).toBe('4.7 kΩ')
  })
  it('solves all pairs consistently', () => {
    const ref = { V: 12, I: 0.5, R: 24, P: 6 }
    const pairs: [keyof typeof ref, keyof typeof ref][] = [['V', 'I'], ['V', 'R'], ['V', 'P'], ['I', 'R'], ['I', 'P'], ['R', 'P']]
    for (const [a, b] of pairs) {
      const r = solve({ [a]: ref[a], [b]: ref[b] })
      if (typeof r === 'string') throw new Error(r)
      for (const q of ['V', 'I', 'R', 'P'] as const) expect(r.vals[q]).toBeCloseTo(ref[q])
    }
    expect(typeof solve({ V: 1 })).toBe('string')
  })
  it('standard values', () => {
    expect(nearestE(150)).toBe(150)
    expect(nearestE(4600, 12)).toBe(4700)
    expect(powerRating(0.2)).toBe(0.5)
  })
})
