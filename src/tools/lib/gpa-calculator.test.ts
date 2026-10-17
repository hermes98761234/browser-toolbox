import { describe, expect, it } from 'vitest'
import { cumulative, gpa, percentToLetter, requiredGpa, SCALES, type Course } from './gpa-calculator'

const c = (credits: number, grade: string, level: Course['level'] = 'regular', include = true): Course => ({ id: grade, name: '', credits, grade, level, include })

describe('gpa', () => {
  it('weights by credits', () => {
    const r = gpa([c(3, 'A'), c(4, 'B+'), c(1, 'C')], SCALES[0], false)
    expect(r.gpa).toBeCloseTo((12 + 13.2 + 2) / 8, 6)
    expect(r.credits).toBe(8)
  })
  it('applies honors/AP bonuses only when weighted, never to F', () => {
    expect(gpa([c(3, 'A', 'ap')], SCALES[0], true).gpa).toBe(5)
    expect(gpa([c(3, 'B', 'honors')], SCALES[0], true).gpa).toBe(3.5)
    expect(gpa([c(3, 'F', 'ap')], SCALES[0], true).gpa).toBe(0)
    expect(gpa([c(3, 'A', 'ap'), c(3, 'F', 'regular', false)], SCALES[0], false).gpa).toBe(4)
  })
  it('combines cumulative and target', () => {
    expect(cumulative(3.2, 60, 3.8 * 15, 15)).toBeCloseTo(3.32, 6)
    expect(requiredGpa(3.0, 60, 3.2, 30)).toBeCloseTo(3.6, 6)
    expect(percentToLetter(91)).toBe('A−')
    expect(percentToLetter(42)).toBe('F')
  })
})
