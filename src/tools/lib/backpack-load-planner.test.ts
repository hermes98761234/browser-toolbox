import { describe, expect, it } from 'vitest'
import { advise, centre, centreOfMass, zoneLoad, zoneOf, type Item } from './backpack-load-planner'

const it1 = (p: Partial<Item>): Item => ({ id: 'a', name: 'x', kg: 1, liters: 1, zone: 'core', ...p })

describe('backpack load', () => {
  it('centre of mass is the weighted mean of zone centres', () => {
    const c = centreOfMass([it1({ kg: 2, zone: 'core' }), it1({ kg: 2, zone: 'bottom' })], 0)
    const a = centre(zoneOf('core')), b = centre(zoneOf('bottom'))
    expect(c.y).toBeCloseTo((a[1] + b[1]) / 2, 9)
    expect(c.z).toBeCloseTo((a[2] + b[2]) / 2, 9)
    expect(c.mass).toBe(4)
  })
  it('side pockets shift x', () => {
    expect(centreOfMass([it1({ zone: 'left' })], 0).x).toBeLessThan(0)
    expect(centreOfMass([it1({ zone: 'left' }), it1({ zone: 'right' })], 0).x).toBeCloseTo(0, 9)
  })
  it('zone fill and advice', () => {
    const z = zoneLoad([it1({ liters: 20, zone: 'lid' })], 50)
    expect(z.find((x) => x.zone.id === 'lid')!.fill).toBeCloseTo(20 / 3, 6)
    const adv = advise([it1({ kg: 5, liters: 10, zone: 'lid', name: 'Stove' })], 1.5, 50, 70, 'trail')
    expect(adv.some((a) => a.text.includes('Stove'))).toBe(true)
    expect(adv.some((a) => a.tone === 'err')).toBe(true)
  })
})
