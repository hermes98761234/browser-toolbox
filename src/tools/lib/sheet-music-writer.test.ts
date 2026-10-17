import { describe, expect, it } from 'vitest'
import { keyAcc, noteShape, parseAbc, parseKey, timeline, toMidi } from './sheet-music-writer'

const notes = (abc: string) => parseAbc(abc).items.filter((i) => i.kind === 'note')

describe('ABC parser', () => {
  it('keys', () => {
    expect(parseKey('G').fifths).toBe(1)
    expect(parseKey('Bb').fifths).toBe(-2)
    expect(parseKey('Am').fifths).toBe(0)
    expect(parseKey('D dorian').fifths).toBe(0)
    expect(parseKey('F#m').fifths).toBe(3)
    expect(parseKey('C clef=bass').clef).toBe('bass')
    expect(keyAcc(2, 3)).toBe(1) // F# in D major
    expect(keyAcc(-1, 6)).toBe(-1) // Bb in F major
  })
  it('pitches, octaves, key and bar accidentals', () => {
    const n = notes("X:1\nL:1/4\nK:G\nC c c' C, F ^G G | G")
    const midi = n.map((x) => (x.kind === 'note' ? x.pitches[0].midi : 0))
    expect(midi).toEqual([60, 72, 84, 48, 66, 68, 68, 67])
  })
  it('lengths, rests, broken rhythm and tuplets', () => {
    const n = notes('L:1/8\nK:C\nA2 A/ A3/2 z4 A>B (3ABc')
    expect(n.map((x) => x.dur)).toEqual([1 / 4, 1 / 16, 3 / 16, 1 / 2, 3 / 16, 1 / 16, 1 / 12, 1 / 12, 1 / 12])
    expect(n[3].kind === 'note' && n[3].pitches.length).toBe(0)
  })
  it('chords and default unit by meter', () => {
    const t = parseAbc('M:2/4\nK:C\n[CEG]4')
    expect(t.unit).toBe(1 / 16)
    const n = t.items[0]
    expect(n.kind === 'note' && n.pitches.map((p) => p.midi)).toEqual([60, 64, 67])
    expect(n.kind === 'note' && n.dur).toBe(1 / 4)
  })
  it('tempo field', () => {
    expect(parseAbc('Q:1/8=240\nK:C\nC').qpm).toBe(120)
    expect(parseAbc('Q:3/8=60\nK:C\nC').qpm).toBe(90)
  })
  it('note shapes', () => {
    expect(noteShape(3 / 8)).toEqual({ base: 1 / 4, dots: 1 })
    expect(noteShape(1 / 2)).toEqual({ base: 1 / 2, dots: 0 })
  })
  it('timeline expands repeats and merges ties', () => {
    const t = parseAbc('L:1/4\nK:C\n|: C D :| E- E')
    const tl = timeline(t.items)
    expect(tl.map((n) => n.midi[0])).toEqual([60, 62, 60, 62, 64])
    expect(tl[4].dur).toBe(1 / 2)
    expect(tl[4].t).toBe(1)
  })
  it('writes a valid MIDI header', () => {
    const m = toMidi(parseAbc('L:1/4\nK:C\nCDEF'))
    expect(String.fromCharCode(...m.slice(0, 4))).toBe('MThd')
    expect(String.fromCharCode(...m.slice(14, 18))).toBe('MTrk')
    const len = (m[18] << 24) | (m[19] << 16) | (m[20] << 8) | m[21]
    expect(len).toBe(m.length - 22)
    expect([...m.slice(-4)]).toEqual([0, 0xff, 0x2f, 0])
  })
})
