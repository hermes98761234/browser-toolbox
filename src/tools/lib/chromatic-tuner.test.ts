import { describe, expect, it } from 'vitest'
import { midiFreq, noteOf, parseNote, yin } from './chromatic-tuner'

const tone = (f: number, sr = 48000, n = 4096, harmonics = [1, 0.5, 0.3]) => {
  const b = new Float32Array(n)
  for (let i = 0; i < n; i++) b[i] = harmonics.reduce((a, h, k) => a + h * Math.sin((2 * Math.PI * f * (k + 1) * i) / sr), 0)
  return b
}

describe('tuner', () => {
  it('detects pitch of harmonic tones', () => {
    for (const f of [41.2, 82.41, 110, 196, 261.63, 440, 659.25, 1046.5]) {
      const p = yin(tone(f), 48000)!
      expect(p).not.toBeNull()
      expect(Math.abs(1200 * Math.log2(p.freq / f))).toBeLessThan(3) // within 3 cents
    }
  })
  it('returns null for noise-free silence-like random signal', () => {
    let seed = 1
    const b = new Float32Array(4096).map(() => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1)
    const p = yin(b, 48000)
    expect(p === null || p.clarity < 0.7).toBe(true)
  })
  it('maps frequencies to notes', () => {
    expect(noteOf(440)).toMatchObject({ name: 'A', octave: 4, midi: 69 })
    expect(noteOf(261.63).name).toBe('C')
    const n = noteOf(445)
    expect(n.cents).toBeCloseTo(19.56, 1)
    expect(noteOf(432, 432).cents).toBeCloseTo(0, 6)
    expect(midiFreq(40)).toBeCloseTo(82.407, 3)
    expect(parseNote('E2')).toBe(40)
    expect(parseNote('C#4')).toBe(61)
    expect(parseNote('Bb3')).toBe(58)
  })
})
