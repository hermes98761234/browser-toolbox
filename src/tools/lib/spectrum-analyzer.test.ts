import { describe, expect, it } from 'vitest'
import { fft, findPeaks, makeWindow, noteOf, rmsDb, spectrumDb, xToF, fToX } from './spectrum-analyzer'

describe('spectrum-analyzer', () => {
  it('fft of an impulse is flat and of a cosine is two spikes', () => {
    const re = new Float64Array(8), im = new Float64Array(8)
    re[0] = 1
    fft(re, im)
    expect(Array.from(re)).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
    const r2 = Float64Array.from({ length: 16 }, (_, i) => Math.cos((2 * Math.PI * 3 * i) / 16)), i2 = new Float64Array(16)
    fft(r2, i2)
    expect(r2[3]).toBeCloseTo(8)
    expect(r2[13]).toBeCloseTo(8)
    expect(Math.abs(r2[5])).toBeLessThan(1e-9)
  })
  it('full-scale sine reads 0 dBFS and the peak frequency is interpolated', () => {
    const sr = 48000, n = 4096, f = 1234.5
    const x = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * f * i) / sr))
    const db = spectrumDb(x, makeWindow('flat-top', n))
    const p = findPeaks(db, sr, n)[0]
    expect(p.db).toBeCloseTo(0, 0)
    expect(Math.abs(p.freq - f)).toBeLessThan(2)
    const half = x.map((v) => v * 0.5)
    expect(findPeaks(spectrumDb(half, makeWindow('flat-top', n)), sr, n)[0].db).toBeCloseTo(-6.02, 0)
  })
  it('separates two tones', () => {
    const sr = 44100, n = 8192
    const x = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / sr) + 0.1 * Math.sin((2 * Math.PI * 3000 * i) / sr))
    const pk = findPeaks(spectrumDb(x, makeWindow('hann', n)), sr, n)
    expect(Math.abs(pk[0].freq - 440)).toBeLessThan(1)
    expect(Math.abs(pk[1].freq - 3000)).toBeLessThan(2)
    expect(pk[0].db - pk[1].db).toBeCloseTo(20, 0)
  })
  it('names notes and RMS', () => {
    expect(noteOf(440)).toMatchObject({ name: 'A4', cents: 0 })
    expect(noteOf(261.63).name).toBe('C4')
    expect(noteOf(446).cents).toBe(23)
    const s = Array.from({ length: 4800 }, (_, i) => Math.sin((2 * Math.PI * 100 * i) / 48000))
    expect(rmsDb(s)).toBeCloseTo(-3.01, 1)
    expect(xToF(fToX(1000, 20, 20000, true), 20, 20000, true)).toBeCloseTo(1000)
  })
})
