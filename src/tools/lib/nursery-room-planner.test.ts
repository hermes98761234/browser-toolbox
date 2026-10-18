import { describe, expect, it } from 'vitest'
import { check, distToSeg, doorZone, featureSeg, freeFloor, frontZone, makeItem, type Feature, type Room } from './nursery-room-planner'

const R: Room = { w: 3.5, d: 3, h: 2.5 }
const win: Feature = { id: 'w', kind: 'window', wall: 'N', offset: 1, width: 1.2 }
const door: Feature = { id: 'd', kind: 'door', wall: 'S', offset: 0.2, width: 0.8 }

describe('nursery-room-planner', () => {
  it('feature segments and distances', () => {
    expect(featureSeg(R, win)).toEqual([[1, 0], [2.2, 0]])
    expect(featureSeg(R, { ...win, wall: 'E', offset: 5 })).toEqual([[3.5, 1.8], [3.5, 3]])
    const crib = makeItem('crib', 1.6, 1.5, 0, 'c')
    expect(distToSeg(crib, featureSeg(R, win))).toBeCloseTo(1.5 - 0.335, 6)
  })
  it('front zone follows rotation', () => {
    const d = makeItem('dresser', 1, 1, 0, 'x')
    expect(frontZone(d, 0.6)).toMatchObject({ x: 1, z: 1.55 })
    const r = frontZone({ ...d, rot: 90 }, 0.6)
    expect(r.x).toBeCloseTo(0.45, 6)
    expect(r.z).toBeCloseTo(1, 6)
    expect(doorZone(R, door)).toMatchObject({ x: 0.6, z: 2.6 })
  })
  it('flags crib near window, climbable furniture, cords and blocked door', () => {
    const crib = makeItem('crib', 1.6, 0.4, 0, 'c')
    const dresser = makeItem('dresser', 2.6, 0.25, 0, 'dr')
    const mon = makeItem('monitor', 0.8, 0.3, 0, 'm')
    const toy = makeItem('toybox', 0.6, 2.75, 0, 't')
    const res = check(R, [crib, dresser, mon, toy], [win, door])
    const txt = res.map((r) => r.text).join('\n')
    expect(txt).toMatch(/from a window/)
    expect(txt).toMatch(/Dresser is .* from the cot/)
    expect(txt).toMatch(/keep cords/)
    expect(txt).toMatch(/Door swing is blocked by Toy chest/)
    expect(res[0].level).toBe('err')
  })
  it('a good layout passes', () => {
    const crib = makeItem('crib', 1.0, 2.0, 0, 'c') // centre z 2.0, away from window at N
    const ward = makeItem('wardrobe', 3.2, 1.2, 90, 'wd') // against east wall, front facing west (−x)
    const res = check(R, [crib, ward], [win])
    expect(res.filter((r) => r.level !== 'ok').map((r) => r.text)).toEqual([])
    expect(freeFloor(R, [crib, ward])).toBeCloseTo(1 - (1.27 * 0.67 + 0.6) / 10.5, 6)
  })
})
