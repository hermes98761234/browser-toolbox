import { describe, expect, it } from 'vitest'
import { basic, bestDrill, DRILLS, drillFor, identify, THREADS, threadPct } from './thread-dimensions-reference'

const T = (id: string) => THREADS.find((t) => t.id === id)!

describe('thread-dimensions-reference', () => {
  it('ISO basic dimensions for M10 × 1.5', () => {
    const b = basic(T('M10'))
    expect(b.pitchDia).toBeCloseTo(9.026, 3)
    expect(b.minorExt).toBeCloseTo(8.160, 3)
    expect(b.minorInt).toBeCloseTo(8.376, 3)
    expect(b.stress).toBeCloseTo(58.0, 0) // ISO 898-1 As = 58.0 mm²
  })
  it('tap drills', () => {
    expect(threadPct(T('M6'), 5)).toBeCloseTo(76.98, 2) // D − P ≈ 77 %
    expect(bestDrill(T('M8'), DRILLS.metric).mm).toBe(6.8)
    expect(bestDrill(T('1/4-20'), DRILLS.inch).name).toMatch(/^#7/)
    expect(bestDrill(T('#10-32'), DRILLS.inch).name).toMatch(/^#21/)
    expect(drillFor(T('1/2-13'), 75) / 25.4).toBeCloseTo(0.425, 3)
  })
  it('identifies a measured thread', () => {
    expect(identify(7.9, 1.25)[0].t.id).toBe('M8')
    expect(identify(6.3, 25.4 / 20)[0].t.id).toBe('1/4-20')
  })
})
