import { describe, expect, it } from 'vitest'
import { chordTones, findVoicings, INSTRUMENTS, parseChord, pianoNotes } from './chord-finder'

const [guitar, , uke] = INSTRUMENTS
const top = (name: string, inst = guitar, k = 3) => {
  const c = parseChord(name)!
  return findVoicings(c.root, c.quality, inst, c.bass).slice(0, k).map((x) => x.v.map((f) => (f < 0 ? 'x' : f)).join(''))
}

describe('chord finder', () => {
  it('parses chord names', () => {
    expect(parseChord('Am7')).toEqual({ root: 9, quality: 'm7', bass: undefined })
    expect(parseChord('F#maj7')?.root).toBe(6)
    expect(parseChord('C/E')).toEqual({ root: 0, quality: '', bass: 4 })
    expect(parseChord('Xyz')).toBeNull()
    expect(chordTones(7, '7').pcs).toEqual([7, 11, 2, 5])
  })
  it('finds the classic open guitar shapes', () => {
    expect(top('C')).toContain('x32010')
    expect(top('Am')).toContain('x02210')
    expect(top('E')).toContain('022100')
    expect(top('D')).toContain('xx0232')
    expect(top('F', guitar, 6)).toContain('133211')
  })
  it('finds ukulele shapes', () => {
    expect(top('C', uke)).toContain('0003')
    expect(top('Am', uke)).toContain('2000')
  })
  it('builds piano inversions', () => {
    expect(pianoNotes(0, '', 0)).toEqual([60, 64, 67])
    expect(pianoNotes(0, '', 1)).toEqual([64, 67, 72])
  })
})
