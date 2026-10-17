import { describe, expect, it } from 'vitest'
import { analyse, craniovertebral, inclination, neckLoadKg, synthLandmarks } from './posture-checker'

describe('posture geometry', () => {
  it('vertical segment has 0° inclination', () => {
    expect(inclination({ x: 10, y: 100 }, { x: 10, y: 0 }, 'right')).toBeCloseTo(0)
  })
  it('forward lean is positive for either facing', () => {
    expect(inclination({ x: 0, y: 10 }, { x: 10, y: 0 }, 'right')).toBeCloseTo(45)
    expect(inclination({ x: 0, y: 10 }, { x: -10, y: 0 }, 'left')).toBeCloseTo(45)
    expect(inclination({ x: 0, y: 10 }, { x: -10, y: 0 }, 'right')).toBeCloseTo(-45)
  })
  it('CVA is 90° minus neck inclination', () => {
    expect(craniovertebral({ x: 10, y: 0 }, { x: 0, y: 17.32 }, 'right')).toBeCloseTo(60, 1)
  })
  it('neck load follows Hansraj values', () => {
    expect(neckLoadKg(0)).toBe(5)
    expect(neckLoadKg(30)).toBeCloseTo(18.1)
    expect(neckLoadKg(22.5)).toBeCloseTo((12.2 + 18.1) / 2)
    expect(neckLoadKg(90)).toBe(27.2)
  })
  it('synthetic landmarks round-trip through analyse', () => {
    const a = analyse(synthLandmarks(45, 12, { x: 200, y: 400 }, 200, 80), 'right')
    expect(a.neck).toBeCloseTo(45)
    expect(a.torso).toBeCloseTo(12)
    expect(a.cva).toBeCloseTo(45)
    expect(a.grades.neck).toBe('poor')
    const upright = analyse(synthLandmarks(5, 2, { x: 200, y: 400 }, 200, 80), 'right')
    expect(upright.overall).toBe('good')
    expect(upright.score).toBe(100)
  })
})
