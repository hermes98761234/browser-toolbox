import { describe, expect, it } from 'vitest'
import { clock, parseSubs, stamp, toSrt, toTxt, toVtt, wordCount, wpm, type Seg } from './audio-transcriber'

const segs: Seg[] = [
  { id: 'b', start: 4.2, end: 7.9, text: 'Second line here', speaker: 'Bo' },
  { id: 'a', start: 0, end: 4, text: 'Hello and welcome.' },
  { id: 'c', start: 9, end: 9, text: '   ' },
]

describe('timestamps', () => {
  it('formats SRT/VTT stamps and clocks', () => {
    expect(stamp(3725.5)).toBe('01:02:05,500')
    expect(stamp(0.0456, '.')).toBe('00:00:00.046')
    expect(clock(65)).toBe('1:05')
    expect(clock(3661)).toBe('1:01:01')
  })
})

describe('exporters', () => {
  it('SRT is ordered, numbered and skips empty cues', () => {
    expect(toSrt(segs)).toBe('1\n00:00:00,000 --> 00:00:04,000\nHello and welcome.\n\n2\n00:00:04,200 --> 00:00:07,900\nBo: Second line here\n')
  })
  it('VTT header and TXT', () => {
    expect(toVtt(segs).startsWith('WEBVTT\n\n00:00:00.000 --> 00:00:04.000')).toBe(true)
    expect(toTxt(segs, true)).toBe('[0:00] Hello and welcome.\n[0:04] Bo: Second line here\n')
  })
  it('round-trips through the parser', () => {
    const back = parseSubs(toSrt(segs))
    expect(back).toEqual([
      { start: 0, end: 4, text: 'Hello and welcome.' },
      { start: 4.2, end: 7.9, text: 'Second line here', speaker: 'Bo' },
    ])
    expect(parseSubs(toVtt(segs)).length).toBe(2)
  })
})

describe('stats', () => {
  it('counts words and pace', () => {
    expect(wordCount(segs)).toBe(6)
    expect(wpm(segs)).toBeCloseTo(6 / (7.9 / 60), 5)
  })
})
