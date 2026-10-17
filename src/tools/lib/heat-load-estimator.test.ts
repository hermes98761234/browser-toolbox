import { describe, expect, it } from 'vitest'
import { roomLoad, type Climate, type Room } from './heat-load-estimator'

const C: Climate = { tinHeat: 21, toutHeat: -5, tinCool: 24, toutCool: 32, tground: 10, dw: 5, solarAllowance: false }
const R: Room = {
  id: 'r', name: 'Test', l: 5, w: 4, h: 2.5, ach: 0.5, people: 2, equip: 200, light: 5,
  surfaces: [
    { id: 'a', name: 'Wall', kind: 'wall', area: 10, u: 0.3, adj: 'outside', orient: 'S', shgc: 0, shade: 1 },
    { id: 'b', name: 'Window', kind: 'window', area: 2.5, u: 1.4, adj: 'outside', orient: 'S', shgc: 0.6, shade: 1 },
    { id: 'c', name: 'Floor', kind: 'floor', area: 20, u: 0.25, adj: 'ground', orient: 'H', shgc: 0, shade: 1 },
  ],
}

describe('heat-load-estimator', () => {
  it('heating: fabric + infiltration', () => {
    const l = roomLoad(R, C)
    expect(l.heat.fabric).toBeCloseTo(0.3 * 10 * 26 + 1.4 * 2.5 * 26 + 0.25 * 20 * 11, 6) // 78 + 91 + 55
    expect(l.heat.infiltration).toBeCloseTo(0.33 * 0.5 * 50 * 26, 6) // 214.5
    expect(l.heat.total).toBeCloseTo(438.5, 6)
  })
  it('cooling: conduction, solar, gains and latent', () => {
    const l = roomLoad(R, C)
    expect(l.cool.fabric).toBeCloseTo(0.3 * 10 * 8 + 1.4 * 2.5 * 8, 6) // 52
    expect(l.cool.solar).toBeCloseTo(2.5 * 0.6 * 350, 6) // 525
    expect(l.cool.sensible).toBeCloseTo(52 + 525 + 0.33 * 25 * 8 + 150 + 100 + 200, 6)
    expect(l.cool.latent).toBeCloseTo(110 + 3.01 * (25 / 3.6) * 5, 6)
  })
})
