import { describe, expect, it } from 'vitest'
import { compass, constellations, gmst, moonEcl, moonPhase, nightEvents, planetEq, stars, sunEq, toHorizontal } from './night-sky-planner'

const utc = (s: string) => Date.parse(s)

describe('time and coordinates', () => {
  it('GMST (Meeus 12.a)', () => {
    expect(gmst(utc('1987-04-10T00:00:00Z'))).toBeCloseTo(197.693195, 3)
  })
  it('horizontal coordinates (Meeus 13.b)', () => {
    const h = toHorizontal({ ra: 347.3193375, dec: -6.719892 }, utc('1987-04-10T19:21:00Z'), 38.921389, -77.065556)
    expect(h.alt).toBeCloseTo(15.1249, 2)
    expect(h.az).toBeCloseTo(68.0337 + 180, 2)
    expect(compass(h.az)).toBe('WSW')
  })
})

describe('bodies', () => {
  it('Moon (Meeus 47.a)', () => {
    const m = moonEcl(utc('1992-04-12T00:00:00Z'))
    expect(Math.abs(m.lon - 133.162655)).toBeLessThan(0.3)
    expect(Math.abs(m.lat - -3.229126)).toBeLessThan(0.2)
    expect(Math.abs(m.dist - 368409.7)).toBeLessThan(1500)
  })
  it('Venus (Meeus 33.a) within precession tolerance', () => {
    const v = planetEq('Venus', utc('1992-12-20T00:00:00Z'))
    expect(Math.abs(v.ra - 316.1727)).toBeLessThan(0.3)
    expect(Math.abs(v.dec - -18.8880)).toBeLessThan(0.3)
  })
  it('Sun at the June 2026 solstice and a full moon', () => {
    const s = sunEq(utc('2026-06-21T08:24:00Z'))
    expect(s.dec).toBeCloseTo(23.44, 1)
    expect(s.ra).toBeCloseTo(90, 0)
    const p = moonPhase(utc('2026-03-03T11:38:00Z')) // full moon + total lunar eclipse
    expect(p.frac).toBeGreaterThan(0.99)
    expect(p.name).toBe('Full Moon')
  })
  it('moon phase instants match published new/full moon times within 10 min', () => {
    // Root of (Moon − Sun longitude − target) found by bisection inside ±1 day of the published instant.
    const instant = (approx: number, target: number) => {
      const f = (t: number) => ((((moonPhase(t).ang - target + 180) % 360) + 360) % 360) - 180
      let a = approx - 86400000, b = approx + 86400000
      for (let i = 0; i < 50; i++) {
        const m = (a + b) / 2
        if (f(a) * f(m) <= 0) b = m
        else a = m
      }
      return (a + b) / 2
    }
    const cases: [string, number][] = [
      ['2026-02-17T12:01:00Z', 0], // new moon (annular solar eclipse)
      ['2026-03-03T11:38:00Z', 180], // full moon (total lunar eclipse)
      ['2026-01-18T19:52:00Z', 0], // new moon
      ['2024-04-08T18:21:00Z', 0], // new moon (total solar eclipse)
    ]
    for (const [iso, target] of cases) expect(Math.abs(instant(utc(iso), target) - utc(iso)) / 60000).toBeLessThan(10)
  })
  it('sunset in London on the solstice ≈ 20:21 UT', () => {
    const ev = nightEvents(utc('2026-06-21T12:00:00Z'), 51.5074, -0.1278)
    expect(Math.abs(ev.sun.set! - utc('2026-06-21T20:21:00Z'))).toBeLessThan(4 * 60000)
    expect(ev.astro.set).toBeNull() // no astronomical darkness in London in June
  })
})

describe('catalogue', () => {
  it('decodes stars and constellations', () => {
    const s = stars()
    expect(s.length).toBeGreaterThan(800)
    expect(s[0].name).toBe('Sirius')
    expect(s[0].ra).toBeCloseTo(101.29, 1)
    expect(s[0].dec).toBeCloseTo(-16.72, 1)
    const c = constellations()
    expect(c.length).toBe(89) // 88 IAU constellations, Serpens in two parts
    expect(c.find((x) => x.id === 'Ori')?.name).toBe('Orion')
  })
})
