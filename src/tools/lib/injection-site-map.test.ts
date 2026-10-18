import { describe, expect, it } from 'vitest'
import { daysBetween, lastUse, SITES, suggest, usage, type Entry } from './injection-site-map'

const log: Entry[] = [
  { id: '1', date: '2026-10-01', site: 'abd-up-L', note: '' },
  { id: '2', date: '2026-10-04', site: 'abd-up-R', note: '' },
  { id: '3', date: '2026-10-07', site: 'abd-lo-L', note: '' },
  { id: '4', date: '2026-10-10', site: 'abd-up-L', note: '' },
]

describe('injection-site-map', () => {
  it('has both routes and marks dorsogluteal less preferred', () => {
    expect(SITES.filter((s) => s.route === 'IM').length).toBe(8)
    expect(SITES.filter((s) => s.lessPreferred).every((s) => s.id.startsWith('dorso'))).toBe(true)
  })
  it('tracks last use and day gaps', () => {
    expect(lastUse(log)['abd-up-L']).toBe('2026-10-10')
    expect(daysBetween('2026-10-01', '2026-10-10')).toBe(9)
    expect(usage(log, '2026-10-10', 7)['abd-up-L']).toBe(1)
  })
  it('suggests never-used sites first, then the longest rested', () => {
    const s = suggest(log, 'SC')!
    expect(['abd-lo-R', 'thigh-L', 'thigh-R', 'arm-L', 'arm-R']).toContain(s.id)
    const all: Entry[] = SITES.filter((x) => x.route === 'SC').map((x, i) => ({ id: x.id, date: `2026-09-${String(10 + i).padStart(2, '0')}`, site: x.id, note: '' }))
    expect(suggest(all, 'SC')!.id).toBe(all[0].site)
    expect(suggest([], 'IM')!.lessPreferred).toBeFalsy()
  })
})
