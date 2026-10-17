import { describe, expect, it } from 'vitest'
import { fitZoom, haversine, improve, matrix, nearestNeighbour, optimize, parseLine, routeLength } from './route-stop-optimizer'

describe('route-stop-optimizer', () => {
  it('haversine matches known distances', () => {
    // Paris–London ≈ 343.5 km
    expect(haversine({ lat: 48.8566, lon: 2.3522 }, { lat: 51.5074, lon: -0.1278 })).toBeCloseTo(343.5, 0)
    expect(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.19, 1)
  })
  it('solves a square optimally and keeps the start', () => {
    const ps = [{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }, { lat: 0, lon: 1 }, { lat: 1, lon: 0 }]
    const r = optimize(ps, 'loop')
    expect(r.order[0]).toBe(0)
    expect(r.km).toBeCloseTo(4 * 111.19, -1)
    expect(r.km).toBeLessThan(r.naiveKm)
  })
  it('2-opt never makes a random route longer and fixed end stays last', () => {
    let seed = 5
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const ps = Array.from({ length: 25 }, () => ({ lat: 50 + rnd(), lon: 4 + rnd() }))
    const D = matrix(ps)
    for (const mode of ['loop', 'open', 'fixed-end'] as const) {
      const nn = nearestNeighbour(D, mode)
      const imp = improve(nn, D, mode)
      expect(new Set(imp).size).toBe(25)
      expect(imp[0]).toBe(0)
      if (mode === 'fixed-end') expect(imp[24]).toBe(24)
      expect(routeLength(imp, D, mode === 'loop')).toBeLessThanOrEqual(routeLength(nn, D, mode === 'loop') + 1e-9)
    }
  })
  it('optimal on points along a line (open path)', () => {
    const ps = [0, 3, 1, 4, 2].map((x) => ({ lat: 0, lon: x * 0.01 }))
    const r = optimize(ps, 'open')
    expect(r.order).toEqual([0, 2, 4, 1, 3])
  })
  it('parses stop lines', () => {
    expect(parseLine('Depot | 52.37, 4.89 | gate B')).toEqual({ label: 'Depot', lat: 52.37, lon: 4.89, note: 'gate B' })
    expect(parseLine('52.1 5.2')).toMatchObject({ lat: 52.1, lon: 5.2 })
    expect(parseLine('10 Downing St, London')).toEqual({ label: '10 Downing St, London', note: '' })
    expect(parseLine('Kerkstraat 12, 1012 AB Amsterdam')?.lat).toBeUndefined()
    expect(parseLine('# comment')).toBeNull()
    expect(fitZoom([{ lat: 52, lon: 4 }, { lat: 52.1, lon: 4.1 }], 600, 400)).toBeGreaterThan(9)
  })
})
