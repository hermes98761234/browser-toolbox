import { describe, expect, it } from 'vitest'
import { ageFromBirth, catAge, dogChart, dogLog, horseAge, humanAge, scaled, stageAt, stages } from './pet-age-converter'

describe('pet-age-converter', () => {
  it('dog chart values', () => {
    expect(dogChart(1, 'small')).toBe(15)
    expect(dogChart(7, 'large')).toBe(50)
    expect(dogChart(10, 'giant')).toBe(79)
    expect(dogChart(6.5, 'medium')).toBeCloseTo(44.5)
    expect(dogChart(17, 'small')).toBe(84)
  })
  it('epigenetic clock', () => {
    expect(dogLog(1)).toBe(31)
    expect(dogLog(Math.E)).toBeCloseTo(47)
    expect(dogLog(10)).toBeCloseTo(67.84, 1)
  })
  it('cats and horses', () => {
    expect(catAge(1)).toBe(15)
    expect(catAge(2)).toBe(24)
    expect(catAge(10)).toBe(56)
    expect(horseAge(4)).toBe(20.5)
  })
  it('small mammal scaling', () => {
    expect(scaled(0.5, 0.5, 10)).toBe(18)
    expect(scaled(10, 0.5, 10)).toBe(80)
    expect(humanAge('hamster', 2.5)).toBeCloseTo(80)
  })
  it('stages and birth dates', () => {
    expect(stageAt(stages('cat'), 12).name).toBe('Senior')
    expect(stageAt(stages('dog', 'small'), 0.5).name).toBe('Puppy')
    expect(ageFromBirth('2020-01-01', new Date('2025-01-01T00:00'))).toBeCloseTo(5, 2)
  })
})
