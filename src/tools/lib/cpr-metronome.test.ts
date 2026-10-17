import { describe, expect, it } from 'vitest'
import { clampRate, cycleInfo, events, fmtClock, phaseAt, tapFeedback, type CprCfg } from './cpr-metronome'

const C: CprCfg = { bpm: 110, compressions: 30, breaths: 2, pause: 6, switchEvery: 120 }

describe('cpr metronome', () => {
  it('clamps to the guideline window', () => {
    expect(clampRate(90)).toBe(100)
    expect(clampRate(130)).toBe(120)
    expect(clampRate(110.4)).toBe(110)
  })
  it('computes cycle timing', () => {
    const ci = cycleInfo(C)
    expect(ci.comp).toBeCloseTo(30 * 60 / 110, 9)
    expect(ci.total).toBeCloseTo(16.3636 + 6, 3)
    expect(ci.fraction).toBeCloseTo(16.3636 / 22.3636, 3)
    expect(ci.perMinute).toBeCloseTo(30 * 60 / 22.3636, 2)
    expect(cycleInfo({ ...C, compressions: 0 }).fraction).toBe(1)
  })
  it('finds the phase at a time', () => {
    expect(phaseAt(0, C)).toMatchObject({ kind: 'compress', cycle: 1, count: 1 })
    expect(phaseAt(60 / 110 * 29 + 0.01, C)).toMatchObject({ kind: 'compress', count: 30 })
    expect(phaseAt(17, C)).toMatchObject({ kind: 'breathe', cycle: 1, breath: 1 })
    expect(phaseAt(20.5, C)).toMatchObject({ kind: 'breathe', breath: 2 })
    expect(phaseAt(22.4, C)).toMatchObject({ kind: 'compress', cycle: 2, count: 1 })
    expect(phaseAt(5, { ...C, compressions: 0 })).toMatchObject({ kind: 'compress', count: Math.floor(5 * 110 / 60) + 1 })
  })
  it('lists events per cycle', () => {
    const ev = events(0, cycleInfo(C).total, C)
    expect(ev.filter((e) => e.kind === 'click' || e.kind === 'accent').length).toBe(30)
    expect(ev.filter((e) => e.kind === 'breaths').length).toBe(1)
    expect(ev.filter((e) => e.kind === 'resume').length).toBe(1)
    const ev2 = events(0, 130, C)
    expect(ev2.filter((e) => e.kind === 'switch').map((e) => e.t)).toEqual([120])
    // windows tile without gaps or duplicates
    const a = events(0, 10, C).length + events(10, 30, C).length
    expect(a).toBe(events(0, 30, C).length)
  })
  it('gives tap feedback', () => {
    expect(tapFeedback([0, 500])).toBeNull()
    const good = Array.from({ length: 20 }, (_, i) => i * 545)
    const f = tapFeedback(good)!
    expect(f.rate).toBeCloseTo(110.09, 1)
    expect(f.good).toBe(true)
    expect(tapFeedback(Array.from({ length: 10 }, (_, i) => i * 700))!.verdict).toMatch(/slow/)
    expect(tapFeedback(Array.from({ length: 10 }, (_, i) => i * 450))!.verdict).toMatch(/fast/)
    expect(fmtClock(125)).toBe('2:05')
  })
})
