import { describe, expect, it } from 'vitest'
import { angleOfView, cropFactor, defaultCoc, dof, SENSORS } from './depth-of-field-calculator'

describe('depth of field', () => {
  it('50 mm f/8 full frame focus 3 m (c=0.03)', () => {
    const r = dof(50, 8, 0.03, 3000)
    expect(r.hyperfocal).toBeCloseTo(10466.67, 1)
    expect(r.near).toBeCloseTo(2337.9, 0)
    expect(r.far).toBeCloseTo(4185.3, 0)
  })
  it('far is infinite beyond hyperfocal; near ≈ H/2 at H', () => {
    const r = dof(24, 11, 0.03, 0)
    const H = r.hyperfocal
    const at = dof(24, 11, 0.03, H)
    expect(at.far).toBe(Infinity)
    expect(at.near).toBeCloseTo(H / 2, 6)
  })
  it('sensor helpers', () => {
    expect(cropFactor(SENSORS[0])).toBeCloseTo(1, 6)
    expect(cropFactor(SENSORS[4])).toBeCloseTo(2, 1)
    expect(defaultCoc(SENSORS[0])).toBeCloseTo(0.0288, 4)
    expect(angleOfView(50, SENSORS[0]).d).toBeCloseTo(46.79, 1)
  })
})
