import { describe, expect, it } from 'vitest'
import { arrowAngle, guidance, identify, projector, skyNow, type Thing } from './sky-pointer'

describe('sky-pointer', () => {
  it('projects the look direction to the centre and east to the right when facing north', () => {
    const p = projector({ az: 0, alt: 20 })
    const c = p(0, 20)!
    expect(c[0]).toBeCloseTo(0)
    expect(c[1]).toBeCloseTo(0)
    const right = p(10, 20)!
    expect(right[0]).toBeGreaterThan(0)
    const up = p(0, 30)!
    expect(up[1]).toBeGreaterThan(0)
    expect(p(180, 20)).toBeNull()
    // still well-defined at the zenith
    expect(projector({ az: 90, alt: 90 })(90, 80)).not.toBeNull()
  })
  it('gives turn/tilt guidance with wrap-around', () => {
    expect(guidance({ az: 350, alt: 10 }, { az: 20, alt: 40 }).text).toBe('turn right 30° and tilt up 30°')
    expect(guidance({ az: 10, alt: 50 }, { az: 300, alt: 45 }).text).toBe('turn left 70° and tilt down 5°')
    expect(guidance({ az: 10, alt: 50 }, { az: 11, alt: 51 }).text).toBe('you are on it')
    expect(arrowAngle({ az: 0, alt: 0 }, { az: 0, alt: 30 })).toBeCloseTo(Math.PI / 2)
  })
  it('identifies the brightest nearby object', () => {
    const T = (name: string, az: number, alt: number, mag: number): Thing => ({ key: name, name, kind: 'star', mag, az, alt, eq: { ra: 0, dec: 0 }, color: '#fff' })
    const list = [T('dim', 100, 30, 2), T('Jupiter', 104, 31, -2.3), T('far', 150, 30, -1)]
    expect(identify(list, { az: 101, alt: 30 })!.name).toBe('Jupiter')
    expect(identify(list, { az: 200, alt: 30 })).toBeNull()
  })
  it('computes a plausible sky: Polaris altitude ≈ latitude', () => {
    const lat = 50
    const pol = skyNow(Date.UTC(2026, 0, 15, 22), lat, 30, 2.5).find((t) => t.name === 'Polaris')
    expect(pol).toBeTruthy()
    expect(Math.abs(pol!.alt - lat)).toBeLessThan(1.5)
    expect(Math.abs(((pol!.az + 180) % 360) - 180)).toBeLessThan(2)
  })
})
