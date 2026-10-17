import { describe, expect, it } from 'vitest'
import { beatPhase, clickTrack, detectBpm, drumLoop, fft, onsetEnvelope, tapTempo } from './bpm-detector'

const SR = 22050

describe('bpm detector', () => {
  it('fft matches a known transform', () => {
    const re = new Float64Array([1, 0, 0, 0, 0, 0, 0, 0]), im = new Float64Array(8)
    fft(re, im)
    expect([...re]).toEqual(new Array(8).fill(1))
    const n = 16, r2 = new Float64Array(n), i2 = new Float64Array(n)
    for (let i = 0; i < n; i++) r2[i] = Math.cos((2 * Math.PI * 3 * i) / n)
    fft(r2, i2)
    expect(Math.hypot(r2[3], i2[3])).toBeCloseTo(8, 9)
    expect(Math.hypot(r2[5], i2[5])).toBeCloseTo(0, 9)
  })
  it('onset envelope peaks at clicks', () => {
    const { env, fps } = onsetEnvelope(clickTrack(120, 4, SR), SR)
    expect(fps).toBeCloseTo(SR / 512, 6)
    const top = [...env.keys()].sort((a, b) => env[b] - env[a]).slice(0, 6).map((f) => f / fps).sort((a, b) => a - b)
    for (const t of top) expect(Math.abs(((t - 0.1 + 0.25) % 0.5) - 0.25)).toBeLessThan(0.05)
  })
  for (const bpm of [72, 90, 120, 128, 140, 174]) {
    it(`detects ${bpm} BPM click track`, () => {
      const r = detectBpm(clickTrack(bpm, 20, SR), SR, 60, 200)
      expect(Math.abs(r.bpm - bpm)).toBeLessThan(1)
      expect(r.confidence).toBeGreaterThan(0.3)
    })
  }
  for (const [bpm, style] of [[124, 'four'], [95, 'break'], [172, 'dnb']] as const) {
    it(`detects ${bpm} BPM ${style} drum loop`, () => {
      const r = detectBpm(drumLoop(bpm, 8, SR, style), SR, 60, 200)
      const ok = [bpm, bpm / 2, bpm * 2].some((b) => Math.abs(r.bpm - b) < 1.5)
      expect(ok).toBe(true)
      expect(Math.abs(r.bpm - bpm)).toBeLessThan(1.5)
    })
  }
  it('aligns beat phase to the first click', () => {
    const { env, fps } = onsetEnvelope(clickTrack(100, 10, SR), SR)
    const off = beatPhase(env, fps, 100)
    expect(Math.abs(off - 0.1)).toBeLessThan(0.05)
  })
  it('tap tempo', () => {
    expect(tapTempo([0])).toBeNull()
    expect(tapTempo([0, 500, 1000, 1500])!.bpm).toBeCloseTo(120, 6)
    const r = tapTempo([0, 480, 1010, 1495, 2005])!
    expect(Math.abs(r.bpm - 120)).toBeLessThan(2)
    expect(r.sd).toBeGreaterThan(0)
  })
})
