import { describe, expect, it } from 'vitest'
import { effectiveWpm, frames, orpIndex, pauseFactor, prevSentence, remainingMs } from './speed-reading-trainer'

describe('speed reading', () => {
  it('ORP index', () => {
    expect(orpIndex('a')).toBe(0)
    expect(orpIndex('read')).toBe(1)
    expect(orpIndex('reading')).toBe(2)
    expect(orpIndex('comprehension')).toBe(3)
    expect(orpIndex('“Hello')).toBe(2)
    expect(orpIndex('internationalisation')).toBe(4)
  })
  it('pause factors', () => {
    expect(pauseFactor('end.')).toBeCloseTo(2.2)
    expect(pauseFactor('wait,')).toBeCloseTo(1.5)
    expect(pauseFactor('cat')).toBe(1)
    expect(pauseFactor('extraordinary')).toBeGreaterThan(1)
  })
  it('timing at 300 wpm without smart pauses = 200 ms per word', () => {
    const f = frames('one two three four', 300, 1, false)
    expect(f.map((x) => x.delay)).toEqual([200, 200, 200, 200])
    expect(remainingMs(f)).toBe(800)
  })
  it('chunks stop at sentence ends', () => {
    const f = frames('The cat sat. A dog ran away fast.', 300, 3, false)
    expect(f.map((x) => x.text)).toEqual(['The cat sat.', 'A dog ran', 'away fast.'])
    expect(f.map((x) => x.sentenceStart)).toEqual([true, true, false])
    expect(prevSentence(f, 2)).toBe(1)
  })
  it('effective wpm', () => expect(effectiveWpm(400, 0.75)).toBe(300))
})
