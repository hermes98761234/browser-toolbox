import { describe, expect, it } from 'vitest'
import { midiToFreq, noteName, parseNote, SCALES, spell, triads } from './scale-explorer'

const S = (n: string) => SCALES.find((s) => s.name.startsWith(n))!.steps

describe('scale explorer', () => {
  it('spells keys correctly', () => {
    expect(spell(5, S('Major'))).toEqual(['F', 'G', 'A', 'Bb', 'C', 'D', 'E'])
    expect(spell(6, S('Major'))).toEqual(['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F'])
    expect(spell(9, S('Natural minor'))).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    expect(spell(4, S('Harmonic minor'))).toEqual(['E', 'F#', 'G', 'A', 'B', 'C', 'D#'])
  })
  it('diatonic triads of C major', () => {
    expect(triads(0, S('Major')).map((t) => t.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
    expect(triads(0, S('Major')).map((t) => t.name)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'])
  })
  it('notes and frequencies', () => {
    expect(midiToFreq(69)).toBe(440)
    expect(midiToFreq(40)).toBeCloseTo(82.407, 3)
    expect(noteName(40)).toBe('E2')
    expect(parseNote('Bb1')).toBe(34)
    expect(parseNote('F#3')).toBe(54)
    expect(parseNote('H2')).toBeNull()
  })
})
