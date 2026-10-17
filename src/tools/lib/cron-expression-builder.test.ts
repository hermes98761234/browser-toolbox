import { describe as d, expect, it } from 'vitest'
import { describe, nextRuns, parseCron, parseField, FIELDS } from './cron-expression-builder'

const iso = (t: Date) => t.toISOString().slice(0, 16)

d('cron parser', () => {
  it('expands fields', () => {
    expect([...parseField('*/15', FIELDS[0])]).toEqual([0, 15, 30, 45])
    expect([...parseField('1-5', FIELDS[4])]).toEqual([1, 2, 3, 4, 5])
    expect([...parseField('MON-FRI', FIELDS[4])]).toEqual([1, 2, 3, 4, 5])
    expect([...parseField('7', FIELDS[4])]).toEqual([0])
    expect([...parseField('jan,jul', FIELDS[3])]).toEqual([1, 7])
    expect([...parseField('5/20', FIELDS[0])]).toEqual([5, 25, 45])
  })
  it('rejects bad input', () => {
    expect(() => parseCron('* * *')).toThrow()
    expect(() => parseCron('60 * * * *')).toThrow()
    expect(() => parseCron('* * * 13 *')).toThrow()
    expect(() => parseCron('5-1 * * * *')).toThrow()
  })
  it('computes next runs (UTC)', () => {
    const from = new Date('2026-01-01T10:07:00Z')
    expect(nextRuns(parseCron('*/15 * * * *'), from, 3, true).map(iso)).toEqual(['2026-01-01T10:15', '2026-01-01T10:30', '2026-01-01T10:45'])
    expect(nextRuns(parseCron('0 9 * * 1-5'), from, 3, true).map(iso)).toEqual(['2026-01-02T09:00', '2026-01-05T09:00', '2026-01-06T09:00'])
    expect(nextRuns(parseCron('0 0 29 2 *'), from, 2, true).map(iso)).toEqual(['2028-02-29T00:00', '2032-02-29T00:00'])
    expect(nextRuns(parseCron('@monthly'), from, 2, true).map(iso)).toEqual(['2026-02-01T00:00', '2026-03-01T00:00'])
    // dom OR dow when both restricted: 13th or any Friday
    expect(nextRuns(parseCron('0 0 13 * 5'), from, 3, true).map(iso)).toEqual(['2026-01-02T00:00', '2026-01-09T00:00', '2026-01-13T00:00'])
    expect(nextRuns(parseCron('0 0 31 * *'), from, 3, true).map(iso)).toEqual(['2026-01-31T00:00', '2026-03-31T00:00', '2026-05-31T00:00'])
  })
  it('describes', () => {
    expect(describe('* * * * *')).toBe('Every minute')
    expect(describe('*/5 * * * *')).toBe('Every 5 minutes')
    expect(describe('30 9 * * 1-5')).toBe('At 09:30, on Monday through Friday')
    expect(describe('0 0 1 * *')).toBe('At 00:00, on the 1st of the month')
    expect(describe('0 */2 * * *')).toBe('At minute 0, every 2 hours')
    expect(describe('*/10 9-17 * * *')).toBe('Every 10 minutes, between 09:00 and 17:59')
    expect(describe('0 12 * 1,7 *')).toBe('At 12:00, in January and July')
  })
})
