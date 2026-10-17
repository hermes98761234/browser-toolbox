import { describe, expect, it } from 'vitest'
import { Cascade, aWeightDb, makeDemo, msToDb, nioshMinutes, responseDb, timeWeight, weightingSOS } from './sound-level-meter'

describe('frequency weighting', () => {
  it('analytic A curve matches IEC table', () => {
    expect(aWeightDb(1000)).toBeCloseTo(0, 1)
    expect(aWeightDb(100)).toBeCloseTo(-19.1, 1)
    expect(aWeightDb(31.5)).toBeCloseTo(-39.4, 0)
    expect(aWeightDb(4000)).toBeCloseTo(1.0, 1)
  })
  for (const fs of [44100, 48000]) {
    it(`digital A filter tracks the curve at ${fs} Hz`, () => {
      const sos = weightingSOS('A', fs)
      expect(responseDb(sos, 1000, fs)).toBeCloseTo(0, 6)
      for (const f of [31.5, 63, 125, 250, 500, 2000, 4000]) expect(Math.abs(responseDb(sos, f, fs) - aWeightDb(f))).toBeLessThan(0.4)
      expect(Math.abs(responseDb(sos, 10000, fs) - aWeightDb(10000))).toBeLessThan(1.5)
    })
  }
  it('C weighting is nearly flat in the midrange; Z is flat', () => {
    const c = weightingSOS('C', 48000)
    expect(responseDb(c, 1000, 48000)).toBeCloseTo(0, 6)
    expect(responseDb(c, 31.5, 48000)).toBeCloseTo(-3.0, 0)
    expect(weightingSOS('Z', 48000)).toEqual([])
  })
  it('filtering a 1 kHz sine keeps its RMS; 100 Hz is attenuated ~19 dB', () => {
    const fs = 48000
    const tone = (f: number) => Float32Array.from({ length: fs }, (_, i) => Math.sin((2 * Math.PI * f * i) / fs))
    const run = (f: number) => {
      const c = new Cascade(weightingSOS('A', fs))
      c.process(tone(f)) // settle
      return msToDb(c.process(tone(f)).ms)
    }
    expect(run(1000)).toBeCloseTo(msToDb(0.5), 1)
    expect(run(100) - msToDb(0.5)).toBeCloseTo(-19.1, 0)
  })
})

describe('levels', () => {
  it('converts and weights', () => {
    expect(msToDb(1)).toBe(0)
    expect(msToDb(0.01)).toBeCloseTo(-20)
    expect(timeWeight(0, 1, 0.125, 0.125)).toBeCloseTo(1 - Math.exp(-1))
    expect(nioshMinutes(85)).toBe(480)
    expect(nioshMinutes(100)).toBeCloseTo(15)
  })
  it('demo signal is bounded and non-silent', () => {
    const g = makeDemo(48000)
    const x = g(48000 * 3)
    const ms = x.reduce((a, v) => a + v * v, 0) / x.length
    expect(msToDb(ms)).toBeGreaterThan(-45)
    expect(x.reduce((a, v) => Math.max(a, Math.abs(v)), 0)).toBeLessThan(1)
  })
})
