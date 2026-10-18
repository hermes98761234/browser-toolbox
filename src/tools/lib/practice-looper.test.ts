import { describe, expect, it } from 'vitest'
import { demoTune, peaks, processAudio, resample, wsola, zcFreq } from './practice-looper'

const sr = 16000
const sine = (f: number, secs: number) => Float32Array.from({ length: Math.round(sr * secs) }, (_, i) => Math.sin((2 * Math.PI * f * i) / sr))

describe('practice-looper', () => {
  it('WSOLA changes length but not pitch', () => {
    const x = sine(220, 1)
    const [y] = wsola([x], 0.5, sr)
    expect(y.length).toBe(32000)
    expect(zcFreq(y.subarray(2000, 30000), sr)).toBeCloseTo(220, -0.5)
    const [z] = wsola([x], 1.5, sr)
    expect(Math.abs(z.length - 10667)).toBeLessThan(2)
    expect(Math.abs(zcFreq(z.subarray(1000, 9000), sr) - 220)).toBeLessThan(3)
  })
  it('resampling and transposition', () => {
    const x = sine(200, 1)
    expect(Math.abs(zcFreq(resample(x, 2), sr) - 400)).toBeLessThan(2)
    const [y] = processAudio([x], sr, 1, 12)
    expect(Math.abs(y.length - 16000)).toBeLessThan(40)
    expect(Math.abs(zcFreq(y.subarray(1000, 15000), sr) - 400)).toBeLessThan(4)
    const [z] = processAudio([x], sr, 0.8, -12)
    expect(Math.abs(z.length - 20000)).toBeLessThan(60)
    expect(Math.abs(zcFreq(z.subarray(1000, 19000), sr) - 100)).toBeLessThan(2)
  })
  it('peaks and demo tune', () => {
    const [lo, hi] = peaks(Float32Array.from([0, 1, -1, 0.5]), 0, 4, 2)
    expect([lo[0], hi[0], lo[1], hi[1]]).toEqual([0, 1, -1, 0.5])
    const [L, R] = demoTune(8000)
    expect(L.length).toBe(R.length)
    expect(L.length / 8000).toBeGreaterThan(20)
    expect(L.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeLessThanOrEqual(0.85 + 1e-6)
  })
})
