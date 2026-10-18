import { describe, expect, it } from 'vitest'
import { albumLoudness, concatCh, dB, kWeighting, limit, measure, normalize, sine, truePeakEnvelope } from './loudness-normalizer'

const fs = 48000

describe('K-weighting', () => {
  it('matches the BS.1770 48 kHz coefficients', () => {
    const [a, b] = kWeighting(48000)
    expect(a.b0).toBeCloseTo(1.53512485958697, 9)
    expect(a.b1).toBeCloseTo(-2.69169618940638, 9)
    expect(a.b2).toBeCloseTo(1.19839281085285, 9)
    expect(a.a1).toBeCloseTo(-1.69065929318241, 9)
    expect(a.a2).toBeCloseTo(0.73248077421585, 9)
    expect(b.a1).toBeCloseTo(-1.99004745483398, 9)
    expect(b.a2).toBeCloseTo(0.99007225036621, 9)
  })
})

describe('EBU Tech 3341 style cases', () => {
  it('1 kHz stereo sine at −23 dBFS reads −23.0 LUFS', () => {
    expect(measure(sine(fs, 20, 1000, -23), fs).integrated).toBeCloseTo(-23, 1)
  })
  it('1 kHz stereo sine at −33 dBFS reads −33.0 LUFS (44.1 kHz too)', () => {
    expect(measure(sine(fs, 20, 1000, -33), fs).integrated).toBeCloseTo(-33, 1)
    expect(measure(sine(44100, 20, 1000, -33), 44100).integrated).toBeCloseTo(-33, 1)
  })
  it('relative gate: −36/−23/−36 dBFS sequence reads −23 LUFS', () => {
    const x = concatCh([sine(fs, 10, 1000, -36), sine(fs, 60, 1000, -23), sine(fs, 10, 1000, -36)])
    expect(measure(x, fs).integrated).toBeCloseTo(-23, 1)
  })
  it('absolute gate: −72/−36/−23/−36/−72 sequence reads −23 LUFS', () => {
    const x = concatCh([sine(fs, 10, 1000, -72), sine(fs, 10, 1000, -36), sine(fs, 60, 1000, -23), sine(fs, 10, 1000, -36), sine(fs, 10, 1000, -72)])
    expect(measure(x, fs).integrated).toBeCloseTo(-23, 1)
  })
  it('momentary / short-term max of a steady tone equal its loudness', () => {
    const m = measure(sine(fs, 10, 1000, -20), fs)
    expect(m.momentaryMax).toBeCloseTo(-20, 1)
    expect(m.shortTermMax).toBeCloseTo(-20, 1)
  })
})

describe('EBU Tech 3342 loudness range', () => {
  it('−20 then −30 dBFS → LRA 10 LU', () => {
    expect(measure(concatCh([sine(fs, 20, 1000, -20), sine(fs, 20, 1000, -30)]), fs).lra).toBeCloseTo(10, 0)
  })
  it('−20 then −15 dBFS → LRA 5 LU', () => {
    expect(measure(concatCh([sine(fs, 20, 1000, -20), sine(fs, 20, 1000, -15)]), fs).lra).toBeCloseTo(5, 0)
  })
  it('steady tone has LRA 0', () => {
    expect(measure(sine(fs, 20, 1000, -20), fs).lra).toBeLessThan(0.1)
  })
})

describe('true peak', () => {
  it('a 0 dBFS sine at fs/4 sampled at 45° shows −3 dB sample peak but ≈ 0 dBTP', () => {
    const x = sine(fs, 1, fs / 4, 0, 1, Math.PI / 4)
    const m = measure(x, fs)
    expect(m.samplePeak).toBeCloseTo(-3.01, 1)
    expect(m.truePeak).toBeGreaterThan(-0.4)
    expect(m.truePeak).toBeLessThan(0.2)
  })
  it('a 997 Hz sine true peak matches its amplitude', () => {
    const env = truePeakEnvelope(sine(fs, 1, 997, -6, 1), fs)
    expect(dB(Math.max(...env))).toBeCloseTo(-6, 1)
  })
})

describe('normalisation', () => {
  it('hits the target and keeps the true-peak ceiling with the limiter', () => {
    // a quiet tone with a loud transient
    const x = sine(fs, 8, 440, -30)
    for (let i = 100000; i < 100400; i++) x[0][i] = x[1][i] = 0.9 * Math.sin(i / 3)
    const m = measure(x, fs)
    const r = normalize(x, fs, m, { target: -14, ceiling: -1, mode: 'limit' })
    const after = measure(r.out, fs)
    expect(r.limited).toBeGreaterThan(0)
    expect(after.truePeak).toBeLessThanOrEqual(-0.9)
    expect(after.integrated).toBeCloseTo(-14, 0)
  })
  it('reduce mode caps gain instead of limiting', () => {
    const x = sine(fs, 5, 1000, -6)
    const m = measure(x, fs)
    const r = normalize(x, fs, m, { target: 0, ceiling: -1, mode: 'reduce' })
    expect(r.capped).toBe(true)
    expect(measure(r.out, fs).truePeak).toBeCloseTo(-1, 1)
  })
  it('limiter leaves quiet material untouched', () => {
    const x = sine(fs, 2, 1000, -20)
    expect(limit(x, fs, -1).reduction).toBe(0)
  })
  it('album loudness pools blocks', () => {
    const a = measure(sine(fs, 10, 1000, -20), fs), b = measure(sine(fs, 10, 1000, -26), fs)
    const al = albumLoudness([a, b])
    expect(al).toBeGreaterThan(-26)
    expect(al).toBeLessThan(-20)
    expect(al).toBeCloseTo(10 * Math.log10((10 ** -2 + 10 ** -2.6) / 2), 1)
  })
})
