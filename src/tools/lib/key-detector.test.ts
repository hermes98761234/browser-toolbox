import { describe, expect, it } from 'vitest'
import { analyze, camelot, DEMOS, estimateTuning, keyName, rankKeys, PROFILES, scaleNotes, spectralPeaks, synthProgression } from './key-detector'

describe('key detector', () => {
  it('names keys, Camelot codes and scales', () => {
    expect(keyName({ tonic: 3, minor: false })).toBe('E♭ major')
    expect(keyName({ tonic: 1, minor: true })).toBe('C♯ minor')
    expect(camelot({ tonic: 0, minor: false })).toBe('8B')
    expect(camelot({ tonic: 9, minor: true })).toBe('8A')
    expect(camelot({ tonic: 7, minor: false })).toBe('9B')
    expect(camelot({ tonic: 5, minor: true })).toBe('4A')
    expect(scaleNotes({ tonic: 5, minor: false }).join(' ')).toBe('F G A B♭ C D E')
  })
  it('profiles rank their own rotation first', () => {
    const ch = PROFILES.kk.major.map((_, i) => PROFILES.kk.major[(i + 12 - 7) % 12])
    const r = rankKeys(ch, 'kk')
    expect(r[0].name).toBe('G major')
    expect(r[0].r).toBeCloseTo(1, 6)
  })
  it('estimates tuning of a 432 Hz tone', () => {
    const sr = 22050
    const x = new Float32Array(sr * 2).map((_, i) => Math.sin((2 * Math.PI * 432 * i) / sr))
    const { peaks } = spectralPeaks(x, sr)
    expect(estimateTuning(peaks)).toBeCloseTo(1200 * Math.log2(432 / 440), 0)
  })
  for (const d of DEMOS) {
    it(`detects ${d.key}`, () => {
      const a4 = d.name.includes('432') ? 432 : 440
      const x = synthProgression(d.chords, 22050, d.bpm, a4)
      const a = analyze(x, 22050)
      expect(a.ranked[0].name).toBe(d.key)
      if (a4 === 432) expect(a.tuning).toBeLessThan(-25)
    })
  }
})
