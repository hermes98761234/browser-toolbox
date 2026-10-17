import { describe, expect, it } from 'vitest'
import { analyze, fmtDur, frameRms, level, meterPos, parseTags, percentile, synthVoice, verdict } from './voice-memo-recorder'

describe('voice-memo-recorder', () => {
  it('computes frame RMS and percentiles', () => {
    const sq = new Float32Array(1000).map((_, i) => (i % 2 ? 0.5 : -0.5))
    expect(frameRms([sq], 1000, 100).every((r) => Math.abs(r - 0.5) < 1e-6)).toBe(true)
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(percentile([0, 10], 0.1)).toBeCloseTo(1)
  })
  it('measures a live level', () => {
    const l = level(new Float32Array([0.5, -0.5, 0.5, -1]))
    expect(l.peak).toBe(1)
    expect(l.rms).toBeCloseTo(Math.sqrt((0.25 * 3 + 1) / 4))
    expect(meterPos(-30)).toBe(0.5)
    expect(meterPos(-Infinity)).toBe(0)
  })
  it('analyses the synthetic voice: good SNR, no clipping', () => {
    const v = synthVoice(8000, 6, 3, -55)
    const q = analyze([v], 8000)
    expect(q.clipPct).toBe(0)
    expect(q.noiseDb).toBeLessThan(-50)
    expect(q.snrDb).toBeGreaterThan(25)
    expect(q.speechPct).toBeGreaterThan(20)
    expect(verdict(q)[0][0]).toBe('ok')
  })
  it('flags clipping and noise', () => {
    const loud = new Float32Array(4000).map((_, i) => (i % 4 < 2 ? 1 : -1))
    expect(verdict(analyze([loud], 4000)).some(([t]) => t === 'err')).toBe(true)
  })
  it('formats and parses', () => {
    expect(fmtDur(75.4)).toBe('1:15')
    expect(parseTags('Work, #idea, work ,')).toEqual(['work', 'idea'])
  })
})
