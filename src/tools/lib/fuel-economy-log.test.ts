import { describe, expect, it } from 'vitest'
import { economy, segments, type Fill } from './fuel-economy-log'

const F = (odo: number, vol: number, full = true, missed = false): Fill => ({ id: String(odo), date: `2024-01-${String(Math.floor(odo / 100)).padStart(2, '0')}`, odo, vol, cost: vol * 2, full, missed })

describe('fuel-economy-log', () => {
  it('uses full-to-full segments including partials', () => {
    const s = segments([F(1000, 40), F(1300, 10, false), F(1600, 30)])
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ distance: 600, fuel: 40, cost: 80 })
  })
  it('skips segments with a missed fill-up and starts at the first full tank', () => {
    const s = segments([F(900, 5, false), F(1000, 40), F(1500, 30, true, true), F(2000, 35)])
    expect(s.map((x) => x.to)).toEqual([2000])
  })
  it('converts economy units', () => {
    expect(economy(100, 6, 'l100')).toBeCloseTo(6)
    expect(economy(100, 5, 'kml')).toBeCloseTo(20)
    expect(economy(100, 6, 'mpg')).toBeCloseTo(39.2, 1)
    expect(economy(100, 6, 'mpguk')).toBeCloseTo(47.08, 1)
    expect(economy(0, 6, 'mpg')).toBeNaN()
  })
})
