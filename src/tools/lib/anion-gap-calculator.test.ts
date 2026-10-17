import { describe, expect, it } from 'vitest'
import { albuminToGdl, anionGap } from './anion-gap-calculator'

describe('anion gap', () => {
  it('basic and with potassium', () => {
    expect(anionGap({ na: 140, cl: 104, hco3: 24 }).ag).toBe(12)
    expect(anionGap({ na: 140, cl: 104, hco3: 24, k: 4 }).ag).toBe(16)
  })
  it('albumin correction', () => {
    const r = anionGap({ na: 140, cl: 105, hco3: 20, albumin: 2 })
    expect(r.ag).toBe(15)
    expect(r.corrected).toBe(20)
    expect(r.deltaGap).toBe(4) // (20-12) - (24-20)
    expect(r.deltaRatio).toBe(2)
  })
  it('DKA pattern', () => {
    const r = anionGap({ na: 135, cl: 98, hco3: 10 })
    expect(r.ag).toBe(27)
    expect(r.level).toBe('high')
    expect(r.deltaRatio).toBeCloseTo(15 / 14, 6)
    expect(r.interpretation).toMatch(/pure high anion gap/)
  })
  it('normal gap acidosis', () => {
    const r = anionGap({ na: 138, cl: 114, hco3: 14 })
    expect(r.level).toBe('normal')
    expect(r.interpretation).toMatch(/hyperchloremic/)
  })
  it('units', () => expect(albuminToGdl(35, 'g/L')).toBe(3.5))
})
