import { describe, expect, it } from 'vitest'
import { decode, encode, events, PRESETS, resize, stepDur, stepTime, TRACKS } from './drum-pattern-sequencer'

describe('drum sequencer timing', () => {
  it('straight 16ths at 120 bpm are 125 ms apart', () => {
    expect(stepDur(120)).toBeCloseTo(0.125)
    expect([0, 1, 2, 3].map((i) => stepTime(i, 120, 50))).toEqual([0, 0.125, 0.25, 0.375])
  })
  it('swing delays only the off-beat 16ths', () => {
    const tri = stepTime(1, 120, 200 / 3)
    expect(tri).toBeCloseTo(0.25 * (2 / 3)) // triplet feel: 2/3 of the 8th
    expect(stepTime(2, 120, 66)).toBeCloseTo(0.25)
    expect(stepTime(1, 120, 90)).toBeCloseTo(0.25 * 0.75) // clamped at 75 %
  })
  it('events loop and honour accents and mutes', () => {
    const p = decode('X...x...|....x...', 2, 8)
    const ev = events(p, 120, 50, 2)
    expect(ev.map((e) => e.t)).toEqual([0, 0.5, 0.5, 1, 1.5, 1.5])
    expect(ev[0].vel).toBe(1)
    expect(ev[1].vel).toBe(0.7)
    expect(events(p, 120, 50, 1, [false, true])).toHaveLength(2)
  })
  it('encode/decode and resize', () => {
    for (const k of Object.keys(PRESETS)) {
      const p = decode(PRESETS[k].p)
      expect(p).toHaveLength(TRACKS.length)
      expect(encode(p)).toBe(PRESETS[k].p)
    }
    expect(resize([[1, 0, 2]], 6)).toEqual([[1, 0, 2, 1, 0, 2]])
    expect(resize([[1, 0, 2, 1]], 2)).toEqual([[1, 0]])
  })
})
