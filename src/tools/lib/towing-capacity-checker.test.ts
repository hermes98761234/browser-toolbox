import { describe, expect, it } from 'vitest'
import { checks, derive, worst, type Inputs } from './towing-capacity-checker'

const base: Inputs = {
  gvwr: 7000, gcwr: 14000, towBraked: 8000, towUnbraked: 2000, maxTongue: 800, curb: 5000, payload: 0, rearGawr: 4000, frontGawr: 3800,
  people: 400, cargo: 200, hitch: 50, trailerEmpty: 4500, trailerCargo: 1000, trailerGvwr: 6000, tonguePct: 12, braked: true, fifth: false,
  axleOn: true, frontUnhitched: 3000, rearUnhitched: 2650, wheelbase: 145, overhang: 50,
}

describe('towing checks', () => {
  it('derives weights', () => {
    const d = derive(base)
    expect(d.trailer).toBe(5500)
    expect(d.tongue).toBeCloseTo(660, 9)
    expect(d.payloadCap).toBe(2000) // GVWR − curb when payload not given
    expect(d.payloadUsed).toBeCloseTo(1310, 9)
    expect(d.vehicleGross).toBeCloseTo(6310, 9)
    expect(d.combined).toBe(11150)
    expect(d.rearAxle).toBeCloseTo(2650 + (660 * 195) / 145, 9)
    expect(d.frontAxle).toBeCloseTo(3000 - (660 * 50) / 145, 9)
  })
  it('statuses', () => {
    const c = checks(base)
    expect(c.find((x) => x.name.startsWith('Trailer weight'))!.status).toBe('ok')
    expect(c.find((x) => x.name.startsWith('Tongue weight vs'))!.status).toBe('ok')
    const heavy = checks({ ...base, trailerCargo: 3000 })
    expect(heavy.find((x) => x.name.startsWith('Tongue weight vs'))!.status).toBe('fail') // 900 > 800
    expect(heavy.find((x) => x.name.startsWith('Loaded trailer'))!.status).toBe('fail')
    expect(worst(heavy)).toBe('fail')
    expect(checks({ ...base, tonguePct: 7 }).find((x) => x.name.startsWith('Tongue weight share'))!.status).toBe('fail')
    expect(checks({ ...base, braked: false }).find((x) => x.name.includes('unbraked'))!.status).toBe('fail')
  })
})
