import { describe, expect, it } from 'vitest'
import { interviewerScore, recommendation, shares, summarize, type Criterion } from './interview-scorecard'

const C: Criterion[] = [
  { id: 'a', name: 'Skills', weight: 3 },
  { id: 'b', name: 'Communication', weight: 1 },
]

describe('interviewerScore', () => {
  it('maps 1..5 to 0..1 with weights', () => {
    expect(interviewerScore({ a: 5, b: 1 }, C, 5)).toBeCloseTo(0.75)
    expect(interviewerScore({ a: 3, b: 3 }, C, 5)).toBeCloseTo(0.5)
  })
  it('renormalises over rated criteria', () => {
    expect(interviewerScore({ b: 4 }, C, 5)).toBeCloseTo(0.75)
    expect(interviewerScore({}, C, 5)).toBeNull()
  })
})

describe('summarize', () => {
  const s = summarize({ x: { a: 5, b: 5 }, y: { a: 3, b: 3 } }, C, ['x', 'y', 'z'], 5)
  it('averages interviewers and measures spread', () => {
    expect(s.score).toBeCloseTo(0.75)
    expect(s.spread).toBeCloseTo(0.25)
    expect(s.perCriterion.a).toBe(4)
    expect(s.coverage).toBeCloseTo(4 / 6)
    expect(s.disagreement).toEqual(['a', 'b'])
    expect(s.perInterviewer.z).toBeNull()
  })
})

describe('helpers', () => {
  it('recommendation bands and shares', () => {
    expect(recommendation(0.82).label).toBe('Strong hire')
    expect(recommendation(0.7).label).toBe('Hire')
    expect(recommendation(0.55).label).toBe('Lean no')
    expect(recommendation(0.2).label).toBe('No hire')
    expect(shares(C)).toEqual([0.75, 0.25])
  })
})
