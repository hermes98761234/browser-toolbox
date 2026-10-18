import { describe, expect, it } from 'vitest'
import { completion, emptyEntry, isoWeek, reviewStreak, shiftWeek, STEPS, toMarkdown, weekStart, type Entry } from './weekly-review-guide'

describe('weekly review', () => {
  it('ISO week numbers incl. year boundaries', () => {
    expect(isoWeek('2026-10-18')).toBe('2026-W42')
    expect(isoWeek('2026-10-19')).toBe('2026-W43')
    expect(isoWeek('2021-01-03')).toBe('2020-W53')
    expect(isoWeek('2024-12-30')).toBe('2025-W01')
    expect(isoWeek('2026-01-01')).toBe('2026-W01')
  })
  it('week start and shifting', () => {
    expect(weekStart('2026-W42')).toBe('2026-10-12')
    expect(weekStart('2025-W01')).toBe('2024-12-30')
    expect(shiftWeek('2026-W01', -1)).toBe('2025-W52')
    expect(shiftWeek('2020-W53', 1)).toBe('2021-W01')
  })
  it('completion and streak', () => {
    const e = emptyEntry('2026-W42')
    expect(completion(e)).toBe(0)
    const full: Entry = { ...e, checks: {}, answers: {}, ratings: {} }
    for (const s of STEPS) {
      for (const [id] of s.checks ?? []) full.checks[id] = true
      for (const [id] of s.questions ?? []) full.answers[id] = 'x'
    }
    for (const id of ['energy', 'focus', 'mood', 'health', 'people', 'growth']) full.ratings[id] = 3
    full.priorities = [{ text: 'a', done: false }]
    expect(completion(full)).toBe(1)
    const entries = { '2026-W41': { ...full, week: '2026-W41' }, '2026-W40': { ...full, week: '2026-W40' }, '2026-W38': { ...full, week: '2026-W38' } }
    expect(reviewStreak(entries, '2026-W42')).toBe(2)
  })
  it('markdown export', () => {
    const e = { ...emptyEntry('2026-W42'), answers: { wins: 'Finished it' }, ratings: { mood: 4 } }
    const prev = { ...emptyEntry('2026-W41'), ratings: { mood: 2 }, priorities: [{ text: 'Ship it', done: true }] }
    const md = toMarkdown(e, prev)
    expect(md).toContain('# Weekly review — 2026-W42 (week of 2026-10-12)')
    expect(md).toContain('- [x] Ship it')
    expect(md).toContain('Finished it')
    expect(md).toContain('| Mood | ★★★★☆ | +2 |')
  })
})
