import { describe, expect, it } from 'vitest'
import { dawes, exitPupil, focalRatio, imageScale, lightGrasp, limitingMag, magnification, pupilForAge, pupilUse, rayleigh, trueField } from './telescope-calculator'

const dob = { aperture: 203, focal: 1200, obstruction: 0.23 }

describe('telescope calculator', () => {
  it('basic optics', () => {
    expect(focalRatio(dob)).toBeCloseTo(5.91, 2)
    expect(magnification(1200, 25)).toBe(48)
    expect(magnification(1200, 25, 2)).toBe(96)
    expect(exitPupil(203, 48)).toBeCloseTo(4.23, 2)
  })
  it('true field by both methods', () => {
    expect(trueField(dob, { focal: 25, afov: 52 })).toBeCloseTo(52 / 48)
    // 32 mm Plössl field stop ≈ 27 mm → 27/1200 rad = 1.289°
    expect(trueField(dob, { focal: 32, afov: 52, fieldStop: 27 })).toBeCloseTo(1.289, 3)
  })
  it('resolution, limiting magnitude, light grasp', () => {
    expect(dawes(100)).toBeCloseTo(1.16)
    expect(rayleigh(100)).toBeCloseTo(1.38, 2)
    expect(limitingMag(125)).toBeCloseTo(13.18, 2)
    expect(lightGrasp({ aperture: 70, focal: 700, obstruction: 0 })).toBeCloseTo(100)
    expect(lightGrasp(dob)).toBeCloseTo((203 / 7) ** 2 * (1 - 0.23 ** 2))
  })
  it('image scale and helpers', () => {
    expect(imageScale(1000, 3.76)).toBeCloseTo(0.7756, 3)
    expect(pupilUse(8).tone).toBe('err')
    expect(pupilUse(0.3).tone).toBe('warn')
    expect(pupilForAge(20)).toBe(7.5)
    expect(pupilForAge(70)).toBeCloseTo(5.35, 2)
  })
})
