import { describe, expect, it } from 'vitest'
import { clock, estimateLegs, parseOsrm, pathKm, pointAlong, simulate, summary, type Rules } from './road-trip-planner'

const R: Rules = { dayStart: 480, dayEnd: 1200, maxDayH: 8, breakEveryH: 2, breakMin: 15, rangeKm: 10000, fuelMin: 10 }
const S = (name: string, stayMin = 0, night = false) => ({ name, stayMin, night })

describe('road trip simulation', () => {
  it('inserts a break every 2 h of driving', () => {
    // 300 km at 100 km/h = 3 h → one break after 2 h
    const ev = simulate([{ km: 300, hours: 3 }], [S('A'), S('B')], R)
    const k = ev.map((e) => e.kind)
    expect(k).toEqual(['start', 'drive', 'break', 'drive', 'end'])
    expect(ev[2].t).toBe(480 + 120)
    expect(ev.at(-1)!.t).toBe(480 + 180 + 15)
    expect(summary(ev).km).toBeCloseTo(300, 9)
  })
  it('skips a break right before arriving', () => {
    const ev = simulate([{ km: 210, hours: 2.1 }], [S('A'), S('B')], R)
    expect(ev.some((e) => e.kind === 'break')).toBe(false)
  })
  it('splits days at the daily driving limit', () => {
    const ev = simulate([{ km: 1000, hours: 10 }], [S('A'), S('B')], { ...R, breakEveryH: 100 })
    const night = ev.find((e) => e.kind === 'overnight')!
    expect(night.km).toBeCloseTo(800, 6)
    expect(ev.at(-1)!.t).toBe(1440 + 480 + 120)
    expect(summary(ev).days).toBe(2)
  })
  it('stops driving at the evening limit', () => {
    const ev = simulate([{ km: 600, hours: 6 }], [S('A'), S('B')], { ...R, dayStart: 900, breakEveryH: 100 })
    expect(ev.find((e) => e.kind === 'overnight')!.t).toBe(1200)
  })
  it('fuel stops by usable range and stays at stops', () => {
    const ev = simulate([{ km: 250, hours: 2.5 }, { km: 250, hours: 2.5 }], [S('A'), S('B', 60), S('C')], { ...R, rangeKm: 400, breakEveryH: 100 })
    const fuel = ev.filter((e) => e.kind === 'fuel')
    expect(fuel.length).toBe(1)
    expect(fuel[0].km).toBeCloseTo(400, 6)
    expect(ev.find((e) => e.kind === 'stay')!.dur).toBe(60)
    expect(ev.at(-1)!.t).toBe(480 + 300 + 60 + 10)
  })
  it('overnight at a stop', () => {
    const ev = simulate([{ km: 100, hours: 1 }, { km: 100, hours: 1 }], [S('A'), S('B', 0, true), S('C')], R)
    expect(ev.find((e) => e.kind === 'overnight')!.label).toBe('Overnight in B')
    expect(ev.filter((e) => e.kind === 'start')[1]).toMatchObject({ t: 1440 + 480, label: 'Set off from B' })
    expect(ev.at(-1)!.t).toBe(1440 + 480 + 60)
  })
})

describe('geometry helpers', () => {
  it('estimates, interpolates and parses OSRM', () => {
    const a = { lat: 0, lon: 0 }, b = { lat: 0, lon: 1 }
    const legs = estimateLegs([a, b], 1.25, 100)
    expect(legs[0].km).toBeCloseTo(111.19 * 1.25, 1)
    const mid = pointAlong([a, b], pathKm([a, b]) / 2)
    expect(mid.lon).toBeCloseTo(0.5, 6)
    const o = parseOsrm({ code: 'Ok', routes: [{ legs: [{ distance: 12000, duration: 900 }], geometry: { coordinates: [[1, 2], [3, 4]] } }] })!
    expect(o.legs[0]).toEqual({ km: 12, hours: 0.25 })
    expect(o.path[1]).toEqual({ lat: 4, lon: 3 })
    expect(parseOsrm({ code: 'NoRoute' })).toBeNull()
    expect(clock(1440 + 485)).toBe('08:05')
  })
})
