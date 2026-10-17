import { describe, expect, it } from 'vitest'
import { fits, leg, occupancy, slotRange, summarize, type Circuits } from './panel-directory-maker'

const c: Circuits = {
  1: { label: 'Range', amps: 50, poles: 2, kind: 'std' },
  2: { label: 'Kitchen', amps: 20, poles: 1, kind: 'gfci' },
  4: { label: 'Dryer', amps: 30, poles: 2, kind: 'std' },
  5: { label: 'Bedroom', amps: 15, poles: 1, kind: 'afci' },
  9: { label: 'Spare', amps: 20, poles: 1, kind: 'spare' },
}

describe('panel directory maker', () => {
  it('maps slots to legs', () => {
    expect([1, 2, 3, 4, 5].map((s) => leg(s))).toEqual(['A', 'A', 'B', 'B', 'A'])
    expect([1, 3, 5, 7].map((s) => leg(s, 3))).toEqual(['A', 'B', 'C', 'A'])
  })
  it('places multi-pole breakers on same-side slots', () => {
    const o = occupancy(12, c)
    expect(o.get(3)).toBe(1)
    expect(o.get(6)).toBe(4)
    expect(o.has(7)).toBe(false)
    expect(slotRange(4, 2)).toBe('4/6')
  })
  it('checks fit', () => {
    expect(fits(12, c, 5, 2)).toBe(true)
    expect(fits(12, c, 2, 2)).toBe(false) // 4 is taken
    expect(fits(12, c, 11, 2)).toBe(false) // past the end
  })
  it('summarizes slots and leg loads', () => {
    const s = summarize(12, c)
    expect(s.used).toBe(7)
    expect(s.free).toBe(5)
    expect(s.breakers).toBe(5)
    expect(s.multi).toBe(2)
    // A: slots 1,2,5,6 = 50+20+15+30 ; B: slots 3,4 = 50+30 (a 2-pole always spans both legs)
    expect(s.perLeg).toEqual({ A: 115, B: 80 })
  })
})
