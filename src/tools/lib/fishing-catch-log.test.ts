import { describe, expect, it } from 'vitest'
import { project } from './dog-walk-tracker'
import { byDayPart, fitWithin, kgToLb, moonPhase, speciesSummary, tally, unproject, type Catch } from './fishing-catch-log'

const c = (p: Partial<Catch>): Catch => ({ id: 'x', at: '2026-06-01T06:30', species: 'Pike', length: 0, weight: 0, method: '', bait: '', released: false, lat: null, lon: null, spot: '', weather: '', airT: null, waterT: null, wind: '', notes: '', photo: false, ...p })

describe('fishing catch log', () => {
  it('moon phase near known dates', () => {
    expect(moonPhase(Date.UTC(2000, 0, 6, 18, 14)).name).toBe('New moon')
    // full moon 2024-01-25 17:54 UTC
    const f = moonPhase(Date.UTC(2024, 0, 25, 17, 54))
    expect(f.name).toBe('Full moon')
    expect(f.illum).toBeGreaterThan(0.99)
  })
  it('summarises species', () => {
    const s = speciesSummary([c({ length: 60, weight: 1.5, released: true }), c({ length: 80, weight: 3 }), c({ species: 'Perch', length: 25 })])
    expect(s[0]).toEqual({ species: 'Pike', count: 2, released: 1, maxLen: 80, maxWt: 3, avgLen: 70 })
    expect(s[1].species).toBe('Perch')
  })
  it('bins by time of day and tallies', () => {
    expect(byDayPart([c({}), c({ at: '2026-06-01T23:10' }), c({ at: '2026-06-01T07:59' })])).toEqual([0, 0, 2, 0, 0, 0, 0, 1])
    expect(tally([c({ bait: 'Spinner' }), c({ bait: 'Worm' }), c({ bait: 'Spinner' }), c({ bait: '' })], (x) => x.bait)).toEqual([['Spinner', 2], ['Worm', 1]])
  })
  it('units, photo sizing and projection round trip', () => {
    expect(kgToLb(1)).toBeCloseTo(2.20462, 4)
    expect(fitWithin(4000, 3000, 1024)).toEqual([1024, 768])
    expect(fitWithin(500, 300, 1024)).toEqual([500, 300])
    const [x, y] = project([44.5, -73.3], 12)
    const [lat, lon] = unproject(x, y, 12)
    expect(lat).toBeCloseTo(44.5, 6)
    expect(lon).toBeCloseTo(-73.3, 6)
  })
})
