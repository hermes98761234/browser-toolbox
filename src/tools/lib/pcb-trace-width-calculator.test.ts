import { describe, expect, it } from 'vitest'
import { areaFor, currentFor, resistance, riseFor, widthFor } from './pcb-trace-width-calculator'

describe('pcb-trace-width-calculator', () => {
  it('matches IPC-2221 reference values', () => {
    // 1 A, 10 °C rise, 1 oz external → ~11.8 mil (≈ 0.30 mm), as in common IPC-2221 calculators
    expect(widthFor(1, 10, 1, 'external')).toBeCloseTo(11.83, 1)
    // internal layer needs (2)^(1/0.725) ≈ 2.6× the area
    expect(areaFor(1, 10, 'internal') / areaFor(1, 10, 'external')).toBeCloseTo(2 ** (1 / 0.725), 6)
    expect(widthFor(5, 20, 2, 'external')).toBeCloseTo(35.7, 0)
  })
  it('inverse functions agree', () => {
    const w = widthFor(3, 15, 1, 'internal')
    expect(currentFor(w, 15, 1, 'internal')).toBeCloseTo(3, 9)
    expect(riseFor(3, w, 1, 'internal')).toBeCloseTo(15, 9)
  })
  it('computes copper resistance', () => {
    // 10 mil × 1 inch, 1 oz at 25 °C ≈ 0.0502 Ω
    expect(resistance(10, 1000, 1, 25)).toBeCloseTo(0.0502, 3)
  })
})
