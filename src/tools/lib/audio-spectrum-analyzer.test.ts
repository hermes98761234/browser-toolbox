import { describe, expect, it } from 'vitest'
import { aWeightDb, bandEdges, bandLevels, CENTRES, correlation, cWeightDb, demoMix, hold, NOMINAL, peakAbs, pinkNoise, rms, Meter, RTA_CAL } from './audio-spectrum-analyzer'
import { fft } from './spectrum-analyzer'

describe('weighting', () => {
  it('matches IEC 61672 table values', () => {
    expect(aWeightDb(1000)).toBeCloseTo(0, 1)
    expect(aWeightDb(100)).toBeCloseTo(-19.1, 1)
    expect(aWeightDb(10000)).toBeCloseTo(-2.5, 1)
    expect(cWeightDb(1000)).toBeCloseTo(0, 1)
    expect(cWeightDb(31.5)).toBeCloseTo(-3.0, 1)
  })
})

describe('bands', () => {
  it('has 31 contiguous third-octave bands', () => {
    expect(NOMINAL).toHaveLength(31)
    expect(CENTRES[17]).toBe(1000)
    const [lo, hi] = bandEdges(1000)
    expect(lo).toBeCloseTo(891.25, 1)
    expect(hi).toBeCloseTo(1122.0, 1)
    expect(bandEdges(CENTRES[10])[1]).toBeCloseTo(bandEdges(CENTRES[11])[0], 6)
  })
  it('puts a 1 kHz tone into the 1 kHz band with its full power', () => {
    const fs = 48000, N = 8192
    const bins = new Float32Array(N / 2).fill(-200)
    const k = Math.round(1000 / (fs / N))
    bins[k] = -12
    bins[k + 1] = -15
    const lv = bandLevels(bins, fs, N)
    expect(lv[17]).toBeCloseTo(10 * Math.log10(10 ** -1.2 + 10 ** -1.5), 6)
    expect(lv[16]).toBeLessThan(-150)
    expect(bandLevels(bins, fs, N, 'A')[17]).toBeCloseTo(lv[17], 1)
  })
})

describe('stereo', () => {
  it('correlation', () => {
    const a = Float32Array.from({ length: 480 }, (_, i) => Math.sin(i / 7))
    expect(correlation(a, a)).toBeCloseTo(1, 6)
    expect(correlation(a, a.map((v) => -v))).toBeCloseTo(-1, 6)
    const b = Float32Array.from({ length: 480 }, (_, i) => Math.cos(i / 7))
    expect(Math.abs(correlation(a, b))).toBeLessThan(0.1)
    expect(correlation(a, new Float32Array(480))).toBe(0)
  })
  it('peak hold holds then falls', () => {
    let h = hold({ v: -Infinity, t: 0 }, -6, 0)
    h = hold(h, -20, 1)
    expect(h.v).toBe(-6)
    h = hold(h, -20, 3)
    expect(h.v).toBeCloseTo(-18, 6)
    h = hold(h, -20, 10)
    expect(h.v).toBe(-20)
  })
})

describe('generators', () => {
  it('pink noise has equal energy per octave and the requested RMS', () => {
    const N = 1 << 16
    const x = pinkNoise(N, -20, 5)
    expect(20 * Math.log10(rms(x))).toBeCloseTo(-20, 3)
    const re = Float64Array.from(x), im = new Float64Array(N)
    fft(re, im)
    const fs = 48000
    const oct = (lo: number) => {
      let p = 0
      for (let k = Math.ceil(lo / (fs / N)); k < (2 * lo) / (fs / N); k++) p += re[k] ** 2 + im[k] ** 2
      return 10 * Math.log10(p)
    }
    const ref = oct(1000)
    for (const lo of [125, 250, 500, 2000, 4000]) expect(Math.abs(oct(lo) - ref)).toBeLessThan(2.5)
  })
  it('demo mix is stereo, not clipping and not mono', () => {
    const [L, R] = demoMix(16000, 4)
    expect(L.length).toBe(64000)
    const pk = Math.max(peakAbs(L), peakAbs(R))
    expect(pk).toBeLessThan(1)
    expect(pk).toBeGreaterThan(0.3)
    const c = correlation(L, R)
    expect(c).toBeGreaterThan(0.3)
    expect(c).toBeLessThan(0.999)
  })
})

describe('Meter', () => {
  it('reads a −18 dBFS 1 kHz stereo sine as −18 LUFS, −18 dBTP, correlation +1', () => {
    const fs = 48000
    const m = new Meter(fs)
    const A = 10 ** (-18 / 20)
    for (let b = 0; b < 5 * 48; b++) {
      const L = Float32Array.from({ length: 1000 }, (_, i) => A * Math.sin((2 * Math.PI * 1000 * (b * 1000 + i)) / fs))
      m.push(L, L)
    }
    expect(m.r.momentary).toBeCloseTo(-18, 1)
    expect(m.r.shortTerm).toBeCloseTo(-18, 1)
    expect(m.r.integrated).toBeCloseTo(-18, 1)
    expect(m.r.peak[0]).toBeCloseTo(-18, 1)
    expect(m.r.truePeakMax).toBeCloseTo(-18, 0)
    expect(m.r.rms[1]).toBeCloseTo(-21.01, 1)
    expect(m.r.correlation).toBeCloseTo(1, 3)
    expect(m.r.seconds).toBeCloseTo(5, 5)
    // RTA: the sine lands in the 1 kHz band at its RMS level
    const lv = bandLevels(m.spectrum(8192), fs, 8192).map((v) => v + RTA_CAL)
    expect(lv[17]).toBeCloseTo(-21.01, 0)
  })
})
