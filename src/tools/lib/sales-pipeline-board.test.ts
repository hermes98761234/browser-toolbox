import { describe, expect, it } from 'vitest'
import { columnStats, daysBetween, forecastByMonth, placeDeal, summary, type Deal, type Stage } from './sales-pipeline-board'

const S: Stage[] = [
  { id: 'lead', name: 'Lead', prob: 10, kind: 'open' },
  { id: 'prop', name: 'Proposal', prob: 50, kind: 'open' },
  { id: 'won', name: 'Won', prob: 100, kind: 'won' },
  { id: 'lost', name: 'Lost', prob: 0, kind: 'lost' },
]
const d = (id: string, stage: string, value: number, close = '2026-11-15'): Deal => ({ id, title: id, company: '', owner: '', value, stage, close, created: '2026-10-01', note: '' })
const D = [d('a', 'lead', 1000), d('b', 'prop', 4000, '2026-12-02'), d('c', 'prop', 2000), d('e', 'won', 3000), d('f', 'lost', 9000)]

describe('pipeline', () => {
  it('column stats', () => {
    expect(columnStats(D, S[1])).toEqual({ count: 2, total: 6000, weighted: 3000 })
  })
  it('summary', () => {
    const s = summary(D, S)
    expect(s.openValue).toBe(7000)
    expect(s.weighted).toBe(100 + 2000 + 1000)
    expect(s.winRate).toBe(0.5)
    expect(s.avgWon).toBe(3000)
  })
  it('forecast by month', () => {
    expect(forecastByMonth(D, S)).toEqual([
      { month: '2026-11', parts: [100, 1000] },
      { month: '2026-12', parts: [0, 2000] },
    ])
  })
  it('moves deals', () => {
    const m = placeDeal(D, 'a', 'prop', 'c')
    expect(m.map((x) => x.id).join('')).toBe('bacef')
    expect(m.find((x) => x.id === 'a')!.stage).toBe('prop')
    expect(placeDeal(D, 'a', 'won', null).map((x) => x.id).join('')).toBe('bcefa')
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30)
  })
})
