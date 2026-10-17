import { describe, expect, it } from 'vitest'
import { check, fmtTime, parseSubs, parseTime, retime, toSrt, toVtt } from './subtitle-editor'

describe('subtitle-editor', () => {
  it('parses and formats times', () => {
    expect(parseTime('01:02:03,456')).toBeCloseTo(3723.456)
    expect(parseTime('02:03.5')).toBeCloseTo(123.5)
    expect(parseTime('12.25')).toBe(12.25)
    expect(parseTime('00:61:00')).toBeNaN()
    expect(parseTime('abc')).toBeNaN()
    expect(fmtTime(3723.456)).toBe('01:02:03,456')
    expect(fmtTime(5.0004, '.')).toBe('00:00:05.000')
  })
  it('round-trips SRT and VTT', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,500\nHello\nworld\n\n2\n00:00:04,000 --> 00:00:06,000\nBye\n'
    const cues = parseSubs(srt)
    expect(cues.map((c) => [c.start, c.end, c.text])).toEqual([[1, 3.5, 'Hello\nworld'], [4, 6, 'Bye']])
    expect(toSrt(cues)).toBe(srt)
    const vtt = toVtt(cues)
    expect(vtt.startsWith('WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.500')).toBe(true)
    expect(parseSubs('WEBVTT\n\n00:01.000 --> 00:02.000 align:start\nHi')[0]).toMatchObject({ start: 1, end: 2, text: 'Hi' })
  })
  it('retimes and checks', () => {
    const cues = parseSubs('1\n00:00:01,000 --> 00:00:03,000\nA\n\n2\n00:00:02,500 --> 00:00:02,600\nThis line is far too long to be read in a tenth of a second')
    expect(retime(cues, -2)[0]).toMatchObject({ start: 0, end: 1 })
    const msgs = check(cues).map((i) => i.msg).join('|')
    expect(msgs).toContain('overlaps')
    expect(msgs).toContain('very short')
    expect(msgs).toContain('reading speed')
    expect(msgs).toContain('line longer')
  })
})
