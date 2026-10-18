import { describe, expect, it } from 'vitest'
import { chordName, chordNotes, diatonic, palette, parseRoman, scaleOf, smoothVoice, vlq, voice, writeMidi } from './chord-progression-builder'

const C = { tonic: 'C', mode: 'major' }
describe('theory', () => {
  it('spells scales', () => {
    expect(scaleOf({ tonic: 'F', mode: 'major' }).names).toEqual(['F', 'G', 'A', 'B♭', 'C', 'D', 'E'])
    expect(scaleOf({ tonic: 'F#', mode: 'major' }).names).toEqual(['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯'])
    expect(scaleOf({ tonic: 'A', mode: 'harmonic minor' }).names).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G♯'])
  })
  it('builds diatonic chords', () => {
    expect(Array.from({ length: 7 }, (_, d) => diatonic(C, d, false).roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
    expect(Array.from({ length: 7 }, (_, d) => diatonic(C, d, true).roman)).toEqual(['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7'])
    const am = { tonic: 'A', mode: 'harmonic minor' }
    expect(diatonic(am, 4, true).roman).toBe('V7')
    expect(diatonic(am, 6, true).roman).toBe('vii°7')
    expect(diatonic(am, 2, false).roman).toBe('III+')
  })
  it('parses roman numerals incl. secondary and borrowed', () => {
    const vv = parseRoman('V7/V', C)!
    expect(chordName(vv)).toBe('D7')
    expect(chordNotes(vv)).toEqual(['D', 'F♯', 'A', 'C'])
    expect(vv.source).toBe('secondary')
    const b7 = parseRoman('bVII', C)!
    expect(chordName(b7)).toBe('B♭')
    expect(b7.source).toBe('borrowed')
    expect(parseRoman('iv', C)!.source).toBe('borrowed')
    expect(chordName(parseRoman('N6', C)!)).toBe('D♭')
    expect(chordNotes(parseRoman('vii°7/ii', { tonic: 'Eb', mode: 'major' })!)).toEqual(['E', 'G', 'B♭', 'D♭'])
    expect(parseRoman('xyz', C)).toBeNull()
    expect(chordName(parseRoman('I', C)!, 1)).toBe('C/E')
  })
  it('palette parses entirely', () => {
    for (const mode of ['major', 'minor', 'dorian']) for (const g of palette({ tonic: 'D', mode })) for (const r of g.chords) expect(parseRoman(r, { tonic: 'D', mode }), r).not.toBeNull()
  })
  it('voices chords', () => {
    expect(voice(parseRoman('I', C)!, 0)).toEqual([60, 64, 67])
    expect(voice(parseRoman('I', C)!, 1)).toEqual([64, 67, 72])
    const v = smoothVoice(parseRoman('IV', C)!, [60, 64, 67])
    expect(v.notes).toEqual([60, 65, 69]) // F/C: common tone C kept
  })
  it('writes MIDI', () => {
    expect(vlq(0)).toEqual([0])
    expect(vlq(480)).toEqual([0x83, 0x60])
    expect(vlq(0x200000)).toEqual([0x81, 0x80, 0x80, 0x00])
    const m = writeMidi([{ tick: 0, notes: [60], dur: 480, vel: 90, ch: 0 }], 120)
    expect(String.fromCharCode(...m.slice(0, 4))).toBe('MThd')
    expect(String.fromCharCode(...m.slice(14, 18))).toBe('MTrk')
    const len = (m[18] << 24) | (m[19] << 16) | (m[20] << 8) | m[21]
    expect(m.length).toBe(22 + len)
    expect([...m.slice(-4)]).toEqual([0, 0xff, 0x2f, 0])
  })
})
