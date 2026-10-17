import { describe, expect, it } from 'vitest'
import { CHORDS, INTERVALS, makeQuestion, midiToHz, noteName, pool, record, SCALES, totals, weakest } from './ear-trainer'

describe('ear-trainer', () => {
  it('has correct theory tables', () => {
    expect(INTERVALS).toHaveLength(12)
    expect(INTERVALS.find((i) => i.id === 'P5')!.steps).toEqual([0, 7])
    expect(CHORDS.find((c) => c.id === 'dom7')!.steps).toEqual([0, 4, 7, 10])
    for (const s of SCALES) expect(s.steps.at(-1)).toBe(12)
    expect(pool('interval', 1).map((i) => i.id)).toEqual(['M3', 'P4', 'P5', 'P8'])
  })
  it('converts pitch', () => {
    expect(midiToHz(69)).toBe(440)
    expect(midiToHz(60)).toBeCloseTo(261.626, 2)
    expect(noteName(60)).toBe('C4')
    expect(noteName(70)).toBe('B♭4')
  })
  it('builds questions in range', () => {
    let seed = 1
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 200; i++) {
      const q = makeQuestion('scale', 3, 'mixed', rnd)
      expect(Math.min(...q.notes)).toBeGreaterThanOrEqual(48)
      expect(Math.max(...q.notes)).toBeLessThanOrEqual(84)
      expect(q.direction).not.toBe('together')
    }
    const d = makeQuestion('interval', 3, 'down', () => 0.5)
    expect(d.notes[0]).toBeGreaterThan(d.notes[1])
    expect(makeQuestion('chord', 2, 'up', () => 0, 'maj').item.id).toBe('min')
  })
  it('keeps score', () => {
    let s = record({}, 'interval', 'P5', true)
    s = record(s, 'interval', 'P5', false)
    s = record(s, 'chord', 'maj', true)
    expect(s['interval:P5']).toEqual({ right: 1, total: 2 })
    expect(totals(s)).toEqual({ right: 2, total: 3 })
    expect(totals(s, 'chord')).toEqual({ right: 1, total: 1 })
    expect(weakest(record(s, 'interval', 'P5', false), 'interval', 1)[0].id).toBe('P5')
  })
})
