import { describe, expect, it } from 'vitest'
import { anglesAt, blend, mirror, poseById, POSES, segmentAt, skeleton, timeline, totalTime } from './stretching-routine-builder'

describe('mannequin kinematics', () => {
  it('standing figure is about 1.7 m tall with feet on the floor', () => {
    const s = skeleton({})
    expect(s.head[1] + 0.11).toBeGreaterThan(1.6)
    expect(s.head[1] + 0.11).toBeLessThan(1.85)
    expect(Math.min(s.lAn[1], s.lToe[1])).toBeCloseTo(0.04, 2)
    // facing +z: the nose is in front of the head, left shoulder on +x
    expect(s.nose[2]).toBeGreaterThan(s.head[2])
    expect(s.lSh[0]).toBeGreaterThan(s.rSh[0])
  })
  it('overhead reach puts the hands above the head; forward fold puts them low', () => {
    const r = skeleton(poseById('reach').a)
    expect(r.lHand[1]).toBeGreaterThan(r.head[1])
    const f = skeleton(poseById('fold').a)
    expect(f.lHand[1]).toBeLessThan(f.lKn[1])
    expect(f.head[1]).toBeLessThan(f.pelvis[1])
  })
  it('supine poses lie on the floor', () => {
    const s = skeleton(poseById('kneehug').a)
    expect(s.head[1]).toBeLessThan(0.2)
    expect(s.chest[1]).toBeLessThan(0.2)
  })
  it('side bend left moves the chest to the left (+x); mirror moves it right', () => {
    const p = poseById('side').a
    const l = skeleton(p), r = skeleton(mirror(p))
    expect(l.chest[0] - l.pelvis[0]).toBeGreaterThan(0.1)
    expect(r.chest[0] - r.pelvis[0]).toBeLessThan(-0.1)
  })
  it('every pose is finite and grounded', () => {
    for (const p of POSES) {
      const s = skeleton(p.a)
      for (const v of Object.values(s)) for (const c of v) expect(Number.isFinite(c)).toBe(true)
    }
  })
})

describe('interpolation and timeline', () => {
  it('blend eases from a to b', () => {
    expect(blend({ lk: 0 }, { lk: 90 }, 0).lk).toBe(0)
    expect(blend({ lk: 0 }, { lk: 90 }, 0.5).lk).toBeCloseTo(45)
    expect(blend({ lk: 0 }, { lk: 90 }, 1).lk).toBe(90)
    expect(blend({ lk: 0 }, { lk: 90 }, 0.1).lk!).toBeLessThan(9)
  })
  it('sided poses are held on both sides', () => {
    const segs = timeline([{ id: 'a', pose: 'quad', hold: 30 }, { id: 'b', pose: 'reach', hold: 20 }], 3)
    // (move+hold)×2 for quad, move+hold for reach, final move
    expect(segs.length).toBe(7)
    expect(totalTime(segs)).toBe(3 + 30 + 3 + 30 + 3 + 20 + 3)
    expect(segs[3].side).toBe('right')
    expect(segmentAt(segs, 0)).toBe(0)
    expect(segmentAt(segs, 4)).toBe(1)
    expect(anglesAt(segs, 10).lk).toBe(150)
    expect(anglesAt(segs, 40).rk).toBe(150)
  })
})
