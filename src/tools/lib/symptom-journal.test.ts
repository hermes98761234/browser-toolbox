import { describe, expect, it } from 'vitest'
import { addDays, dailyMax, daysBetween, filterEntries, fmtDuration, parseList, pdfSafe, sampleEntries, severityWord, slope, summarize, triggerStats, type Entry } from './symptom-journal'

const e = (at: string, symptom: string, severity: number, triggers: string[] = [], tags: string[] = []): Entry => ({ id: at + symptom, at, symptom, severity, minutes: 0, tags, triggers, meds: '', notes: '' })

describe('symptom-journal', () => {
  it('date helpers', () => {
    expect(daysBetween('2026-03-28', '2026-04-02')).toBe(5)
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01')
    expect(severityWord(0)).toBe('None')
    expect(severityWord(5)).toBe('Moderate')
    expect(severityWord(9)).toBe('Very severe')
    expect(fmtDuration(90)).toBe('1 h 30 min')
    expect(parseList(' A, b ,a,, ')).toEqual(['a', 'b'])
    expect(pdfSafe('Day 3 – ok ✓ −2')).toBe('Day 3 – ok ? -2')
  })
  it('slope is least squares', () => {
    expect(slope([[0, 1], [1, 3], [2, 5]])).toBeCloseTo(2, 10)
    expect(slope([[1, 4]])).toBe(0)
  })
  it('daily max and filters', () => {
    const l = [e('2026-01-01T08:00', 'Headache', 3), e('2026-01-01T18:00', 'Headache', 6, [], ['left']), e('2026-01-03T09:00', 'Headache', 2), e('2026-01-02T09:00', 'Fatigue', 4)]
    expect(dailyMax(l, 'Headache', '2026-01-01', '2026-01-03')).toEqual([6, null, 2])
    expect(filterEntries(l, { tags: ['left'] }).length).toBe(1)
    expect(filterEntries(l, { from: '2026-01-02' }).map((x) => x.symptom)).toEqual(['Headache', 'Fatigue'])
    const s = summarize(l, '2026-01-01', '2026-01-07')
    expect(s[0]).toMatchObject({ symptom: 'Headache', count: 3, days: 2, max: 6 })
    expect(s[0].avg).toBeCloseTo(11 / 3, 10)
    expect(s[0].perWeek).toBeCloseTo(3, 10)
  })
  it('trigger association', () => {
    const l = [e('2026-01-01T08:00', 'H', 8, ['sleep']), e('2026-01-02T08:00', 'H', 6, ['sleep']), e('2026-01-03T08:00', 'H', 2)]
    const [t] = triggerStats(l)
    expect(t).toMatchObject({ trigger: 'sleep', count: 2, avgWith: 7, avgWithout: 2, diff: 5 })
  })
  it('sample data is deterministic and plausible', () => {
    const a = sampleEntries('2026-05-31'), b = sampleEntries('2026-05-31')
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(20)
    expect(a.every((x) => x.severity >= 0 && x.severity <= 10)).toBe(true)
  })
})
