import { describe, expect, it } from 'vitest'
import { answered, choiceCounts, csvRows, demoResponses, missing, nps, numStats, perDay, type Resp, type Survey } from './customer-survey-kiosk'

const S: Survey = {
  title: 't', intro: '', thanks: '',
  questions: [
    { id: 'r', type: 'rating', label: 'Rating', options: [], required: true },
    { id: 'c', type: 'choice', label: 'Visit', options: ['A', 'B'], required: false },
    { id: 'm', type: 'multi', label: 'Liked', options: ['x', 'y'], required: true },
    { id: 'e', type: 'emoji', label: 'Mood', options: [], required: false },
  ],
}

describe('validation', () => {
  it('answered / missing', () => {
    expect(answered(null)).toBe(false)
    expect(answered([])).toBe(false)
    expect(answered('  ')).toBe(false)
    expect(answered(0)).toBe(true)
    expect(missing(S, { r: 4, m: [] })).toEqual(['m'])
  })
})
describe('tallies', () => {
  it('numStats', () => {
    const s = numStats([5, 4, 4, null, 'x', 9], 1, 5)
    expect(s.n).toBe(3)
    expect(s.mean).toBeCloseTo(13 / 3)
    expect(s.dist).toEqual([0, 0, 0, 2, 1])
  })
  it('nps', () => {
    // 3 promoters, 1 passive, 2 detractors → (3-2)/6 = 17
    expect(nps([10, 9, 9, 8, 6, 0])).toEqual({ n: 6, score: 17, promoters: 3, passives: 1, detractors: 2 })
    expect(nps([]).score).toBeNaN()
  })
  it('choiceCounts', () => {
    expect(choiceCounts(['A', 'A', 'Z', ['B', 'A']], ['A', 'B'])).toEqual([{ label: 'A', value: 3 }, { label: 'B', value: 1 }, { label: 'Other', value: 1 }])
  })
  it('perDay and csv', () => {
    const at = new Date(2026, 4, 3, 12).getTime()
    const rs: Resp[] = [{ id: '1', at, answers: { r: 5, m: ['x', 'y'], e: 4 } }, { id: '2', at: at + 86400000, answers: {} }]
    expect(perDay(rs)).toEqual([['2026-05-03', 1], ['2026-05-04', 1]])
    const rows = csvRows(S, rs)
    expect(rows[0]).toEqual(['Response ID', 'Submitted', 'Rating', 'Visit', 'Liked', 'Mood'])
    expect(rows[1].slice(2)).toEqual(['5', '', 'x; y', '4 🙂'])
  })
  it('demo data is deterministic and valid', () => {
    const a = demoResponses(S, 30, 1_800_000_000_000), b = demoResponses(S, 30, 1_800_000_000_000)
    expect(a).toEqual(b)
    expect(a).toHaveLength(30)
    expect(a.every((r) => typeof r.answers.r === 'number' && (r.answers.r as number) >= 1 && (r.answers.r as number) <= 5)).toBe(true)
  })
})
