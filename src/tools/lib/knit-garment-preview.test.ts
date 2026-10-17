import { describe, expect, it } from 'vitest'
import { castOn, colourShare, fitRepeat, longestFloat, parseRows, PRESETS } from './knit-garment-preview'

describe('knit-garment-preview', () => {
  it('presets are rectangular', () => {
    for (const p of Object.values(PRESETS)) expect(new Set(p.rows.map((r) => r.length)).size).toBe(1)
  })
  it('gauge maths', () => {
    expect(castOn(100, 22)).toBe(220)
    expect(fitRepeat(220, 12)).toEqual({ repeats: 220 / 12, exact: false, lower: 216, upper: 228 })
    expect(fitRepeat(216, 12).exact).toBe(true)
  })
  it('colour share and floats', () => {
    const c = parseRows(['0011', '0001'])
    expect(colourShare(c, 2)).toEqual([0.625, 0.375])
    expect(longestFloat(parseRows(['00000111']))).toBe(5)
    expect(longestFloat(parseRows(['10000001']))).toBe(6) // wraps around
    expect(longestFloat(parseRows(['1111']))).toBe(0) // single colour: no float
  })
})
