import { describe, expect, it } from 'vitest'
import { axialIssues, bands, bonello, logFreqs, modes, response, schroeder, shape, soundSpeed, type V3 } from './room-mode-calculator'

const room: V3 = [5, 4, 2.5]

describe('room modes', () => {
  it('speed of sound', () => {
    expect(soundSpeed(20)).toBeCloseTo(343.2, 1)
  })
  it('known 5 × 4 × 2.5 m room at c = 343', () => {
    const ms = modes(room, 200, 343)
    expect(ms[0].f).toBeCloseTo(34.3, 2)
    expect(ms[0].type).toBe('axial')
    expect(ms[1].f).toBeCloseTo(42.875, 3)
    const h = ms.find((m) => m.n.join() === '0,0,1')!
    expect(h.f).toBeCloseTo(68.6, 3)
    const t = ms.find((m) => m.n.join() === '1,1,0')!
    expect(t.f).toBeCloseTo(54.91, 2)
    expect(t.type).toBe('tangential')
    expect(ms.find((m) => m.n.join() === '1,1,1')!.type).toBe('oblique')
    // the 2nd length mode coincides exactly with the 1st height mode (5 = 2 × 2.5)
    expect(ms.find((m) => m.n.join() === '2,0,0')!.f).toBeCloseTo(68.6, 6)
    expect(ms.every((m, i) => !i || m.f >= ms[i - 1].f)).toBe(true)
  })
  it('Bonello flags the degenerate room', () => {
    const r = bonello(bands(modes(room, 200, 343)))
    expect(r.issues.some((s) => s.includes('Coincident'))).toBe(true)
    const cube = bonello(bands(modes([4, 4, 4], 200, 343)))
    expect(cube.pass).toBe(false)
  })
  it('Schroeder frequency', () => {
    expect(schroeder(0.5, 50)).toBeCloseTo(200, 6)
  })
  it('mode shapes: nulls at the centre for odd modes', () => {
    expect(shape([1, 0, 0], room, [2.5, 1, 1])).toBeCloseTo(0, 9)
    expect(Math.abs(shape([1, 0, 0], room, [0, 1, 1]))).toBe(1)
  })
  it('listener at a width null loses the first width mode', () => {
    const f = logFreqs(20, 200, 200)
    const i = f.findIndex((x) => x >= 42.875)
    const mid = response(room, [[0.3, 0.3, 0.3]], [3, 2, 1.2], 343, 0.4, f)[i]
    const side = response(room, [[0.3, 0.3, 0.3]], [3, 0.6, 1.2], 343, 0.4, f)[i]
    expect(side).toBeGreaterThan(mid + 3)
    expect(axialIssues(modes(room, 200, 343), 200).clusters.length).toBeGreaterThan(0)
  })
})
