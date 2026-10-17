import { describe, expect, it } from 'vitest'
import { addDays, bucket, daysBetween, pipeline, relDay, type Deal } from './mini-crm'

describe('mini-crm', () => {
  it('date helpers', () => {
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01')
    expect(daysBetween('2024-03-30', '2024-04-02')).toBe(3)
    expect(relDay('2024-01-01', '2024-01-03')).toBe('2 days ago')
  })
  it('pipeline maths', () => {
    const d = (stage: Deal['stage'], value: number): Deal => ({ id: stage + value, contactId: 'c', title: '', value, stage, close: '' })
    const p = pipeline([d('Lead', 1000), d('Proposal', 2000), d('Won', 500), d('Lost', 300), d('Won', 100)])
    expect(p.openValue).toBe(3000)
    expect(p.weighted).toBe(100 + 1000)
    expect(p.wonValue).toBe(600)
    expect(p.winRate).toBeCloseTo(2 / 3)
  })
  it('follow-up buckets', () => {
    const f = (due: string, done = false) => ({ id: '', contactId: '', text: '', due, done })
    const t = '2024-05-10'
    expect([bucket(f('2024-05-09'), t), bucket(f(t), t), bucket(f('2024-05-15'), t), bucket(f('2024-06-15'), t), bucket(f('2024-05-01', true), t)]).toEqual(['overdue', 'today', 'week', 'later', 'done'])
  })
})
