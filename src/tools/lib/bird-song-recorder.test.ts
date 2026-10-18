import { describe, expect, it } from 'vitest'
import { bandDb, fmtSec, mono, peakFreq, spectrogram, syllables, synthBird } from './bird-song-recorder'

const tone = (f: number, rate: number, sec: number, gaps: [number, number][] = []) => {
  const x = new Float32Array(Math.round(rate * sec))
  for (let i = 0; i < x.length; i++) {
    const t = i / rate
    if (!gaps.length || gaps.some(([a, b]) => t >= a && t < b)) x[i] = 0.5 * Math.sin(2 * Math.PI * f * t)
  }
  return x
}

describe('bird-song-recorder', () => {
  it('spectrogram finds a tone and its level', () => {
    const sp = spectrogram(tone(4000, 32000, 0.5), 32000, 1024)
    expect(sp.binHz).toBeCloseTo(31.25, 6)
    const p = peakFreq(sp, 0, 0.5, 1000, 12000)
    expect(Math.abs(p.f - 4000)).toBeLessThanOrEqual(sp.binHz)
    const k = Math.round(4000 / sp.binHz)
    expect(sp.frames[3][k]).toBeGreaterThan(-8)
    expect(sp.frames[3][k]).toBeLessThan(-4.5) // 0.5 amplitude ≈ −6 dBFS
  })
  it('syllables split by silence', () => {
    const x = tone(3000, 16000, 1, [[0.1, 0.2], [0.4, 0.55], [0.8, 0.85]])
    const sp = spectrogram(x, 16000, 256)
    const s = syllables(sp, 1000, 8000)
    expect(s.length).toBe(3)
    expect(s[1][0]).toBeCloseTo(0.39, 1)
    expect(s[1][1] - s[1][0]).toBeCloseTo(0.16, 1)
    expect(bandDb(sp, 1000, 8000).length).toBe(sp.frames.length)
  })
  it('synthetic song is deterministic and energetic in 2–7 kHz', () => {
    const a = synthBird(32000, 4, 2), b = synthBird(32000, 4, 2)
    expect(a).toEqual(b)
    const sp = spectrogram(a, 32000, 1024)
    const p = peakFreq(sp, 0, 4, 1000, 12000)
    expect(p.f).toBeGreaterThan(2000)
    expect(p.f).toBeLessThan(7500)
    expect(syllables(sp, 2000, 8000).length).toBeGreaterThan(5)
  })
  it('helpers', () => {
    expect([...mono([new Float32Array([1, 0]), new Float32Array([0, 1])])]).toEqual([0.5, 0.5])
    expect(fmtSec(65.5)).toBe('1:05.50')
  })
})
