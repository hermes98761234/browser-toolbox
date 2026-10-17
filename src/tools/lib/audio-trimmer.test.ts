import { describe, expect, it } from 'vitest'
import { detectSound, encodeWav, fadeGain, fmtTime, normalizeGain, parseTime, peaks, render } from './audio-trimmer'

describe('audio-trimmer', () => {
  const rate = 1000
  const ones = [new Float32Array(1000).fill(0.5)]

  it('fade curves hit the endpoints', () => {
    for (const c of ['linear', 'equal-power', 'exponential'] as const) {
      expect(fadeGain(0, c)).toBeCloseTo(0)
      expect(fadeGain(1, c)).toBeCloseTo(1)
    }
    expect(fadeGain(0.5, 'equal-power')).toBeCloseTo(Math.SQRT1_2)
  })

  it('trims and fades', () => {
    const [out] = render(ones, rate, { start: 0.2, end: 0.7, fadeIn: 0.1, fadeOut: 0.1, curve: 'linear', gainDb: 0 })
    expect(out.length).toBe(500)
    expect(out[0]).toBe(0)
    expect(out[50]).toBeCloseTo(0.25)
    expect(out[250]).toBeCloseTo(0.5)
    expect(out[499]).toBe(0)
  })

  it('applies gain in dB', () => {
    const [out] = render(ones, rate, { start: 0, end: 1, fadeIn: 0, fadeOut: 0, curve: 'linear', gainDb: 6.0206 })
    expect(out[10]).toBeCloseTo(1, 3)
    expect(normalizeGain(ones, rate, 0, 1, 0)).toBeCloseTo(6.0206, 3)
  })

  it('detects sound boundaries', () => {
    const ch = new Float32Array(1000)
    for (let i = 300; i < 600; i++) ch[i] = 0.3
    const [a, b] = detectSound([ch], rate, -40, 0)
    expect(a).toBeCloseTo(0.3)
    expect(b).toBeCloseTo(0.6)
  })

  it('peaks returns per-column extremes', () => {
    const ch = new Float32Array([0, 1, -1, 0.5])
    expect(peaks([ch], 2)).toEqual([[0, 1], [-1, 0.5]])
  })

  it('writes a valid WAV header', () => {
    const w = encodeWav([new Float32Array([0, 1, -1])], 8000)
    const v = new DataView(w.buffer)
    expect(String.fromCharCode(...w.slice(0, 4))).toBe('RIFF')
    expect(v.getUint32(24, true)).toBe(8000)
    expect(w.length).toBe(44 + 6)
    expect(v.getInt16(46, true)).toBe(32767)
    expect(v.getInt16(48, true)).toBe(-32768)
  })

  it('formats and parses times', () => {
    expect(fmtTime(75.5)).toBe('1:15.50')
    expect(parseTime('1:15.5')).toBeCloseTo(75.5)
    expect(parseTime('12')).toBe(12)
  })
})
