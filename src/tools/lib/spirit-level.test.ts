import { describe, expect, it } from 'vitest'
import { edgeAngle, formatTilt, surfaceAngles, twoPointOffset, upVector } from './spirit-level'

describe('spirit-level', () => {
  it('flat phone is level', () => {
    const a = surfaceAngles(0, 0)
    expect(a.x).toBeCloseTo(0)
    expect(a.y).toBeCloseTo(0)
    expect(a.total).toBeCloseTo(0)
    expect(upVector(0, 0)[2]).toBeCloseTo(1)
  })
  it('reads single-axis tilts', () => {
    expect(surfaceAngles(0, 5).x).toBeCloseTo(-5) // right side down
    expect(surfaceAngles(3, 0).y).toBeCloseTo(3) // top raised
    expect(surfaceAngles(3, 4).total).toBeGreaterThan(4.9)
  })
  it('measures edge rotation around the screen normal', () => {
    expect(edgeAngle(90, 0)).toBeCloseTo(0) // upright portrait
    expect(edgeAngle(90, 0.0001)).toBeCloseTo(0)
    expect(Math.abs(edgeAngle(10, 90))).toBeCloseTo(10) // landscape, tilted 10°
    expect(edgeAngle(0, 90)).toBeCloseTo(0) // standing on the right edge (landscape)
  })
  it('formats slope units', () => {
    expect(formatTilt(45, 'pct')).toBe('100.0%')
    expect(formatTilt(1, 'mmm')).toBe('17 mm/m')
    expect(formatTilt(-2, 'deg')).toBe('−2.0°')
    expect(formatTilt(Math.atan(1 / 48) / (Math.PI / 180), 'ratio')).toBe('1:48')
    expect(formatTilt(Math.atan(0.25 / 12) / (Math.PI / 180), 'inft')).toBe('0.25″/ft')
    expect(twoPointOffset(2.4, -1.6)).toBeCloseTo(0.4)
  })
})
