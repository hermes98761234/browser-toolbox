import { describe, expect, it } from 'vitest'
import { classify, demoMidi, midiOf, mpm, noteName, sungNotes, synthFrame, type Frame } from './vocal-range-finder'

const sine = (f: number, n = 2048, sr = 48000) => Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * f * i) / sr))

describe('vocal-range-finder', () => {
  it('detects pure sines within 0.3 %', () => {
    for (const f of [82.41, 110, 196, 261.63, 440, 880, 1046.5]) {
      const p = mpm(sine(f), 48000)!
      expect(Math.abs(p.freq - f) / f).toBeLessThan(0.003)
      expect(p.clarity).toBeGreaterThan(0.95)
    }
  })
  it('finds the fundamental of a harmonic-rich voice (no octave error)', () => {
    for (const f of [98, 146.83, 220, 523.25]) {
      const p = mpm(synthFrame(f, 0.1, 2048, 44100, 0.03), 44100)!
      expect(Math.abs(midiOf(p.freq) - midiOf(f))).toBeLessThan(0.3)
    }
  })
  it('returns null or low clarity for noise', () => {
    let s = 7
    const n = Float32Array.from({ length: 2048 }, () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1)
    const p = mpm(n, 48000)
    expect(p === null || p.clarity < 0.6).toBe(true)
  })
  it('groups held notes and drops short blips', () => {
    const fr: Frame[] = []
    for (let i = 0; i < 20; i++) fr.push({ t: i * 0.05, midi: 45.1 })
    fr.push({ t: 1.0, midi: 70 }, { t: 1.05, midi: null })
    for (let i = 0; i < 10; i++) fr.push({ t: 1.1 + i * 0.05, midi: 60 + (i % 2) * 0.3 })
    const s = sungNotes(fr)
    expect(s.map((x) => x.midi)).toEqual([45, 60])
  })
  it('classifies voices', () => {
    expect(classify(43, 67)[0].name).toBe('Baritone')
    expect(classify(60, 84)[0].name).toBe('Soprano')
    expect(classify(48, 72)[0].name).toBe('Tenor')
    expect(noteName(60)).toBe('C4')
    expect(noteName(43)).toBe('G2')
  })
  it('demo melody spans G2–G4', () => {
    const v: number[] = []
    for (let t = 0; t < 12; t += 0.05) {
      const m = demoMidi(t)
      if (m !== null) v.push(m)
    }
    expect(Math.min(...v)).toBe(43)
    expect(Math.max(...v)).toBe(67)
  })
})

describe('demo pipeline', () => {
  it('detects the demo singer end-to-end as G2–G4', async () => {
    const { midiFreq } = await import('./chromatic-tuner')
    const fr: Frame[] = []
    for (let t = 0.05; t <= 11; t += 0.05) {
      const m = demoMidi(t)
      if (m === null) { fr.push({ t, midi: null }); continue }
      const p = mpm(synthFrame(midiFreq(m), t, 2048, 44100, 0.02, Math.round(t * 1000)), 44100, 65, 1400)
      fr.push({ t, midi: p && p.clarity > 0.85 ? midiOf(p.freq) : null })
    }
    const notes = sungNotes(fr, 0.3)
    expect(Math.min(...notes.map((n) => n.midi))).toBe(43)
    expect(Math.max(...notes.map((n) => n.midi))).toBe(67)
  })
})
