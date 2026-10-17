import { describe, expect, it } from 'vitest'
import { decode, noteFreq, noteName, pitchBend, toHex } from './midi-monitor'

describe('midi-monitor', () => {
  it('note names and frequencies', () => {
    expect(noteName(60)).toBe('C4')
    expect(noteName(69)).toBe('A4')
    expect(noteName(21)).toBe('A0')
    expect(noteFreq(69)).toBe(440)
    expect(noteFreq(60)).toBeCloseTo(261.63, 2)
  })
  it('channel voice messages', () => {
    expect(decode([0x90, 60, 100])).toMatchObject({ type: 'noteon', channel: 1, note: 60, velocity: 100 })
    expect(decode([0x93, 60, 0]).type).toBe('noteoff')
    expect(decode([0x8f, 64, 40])).toMatchObject({ type: 'noteoff', channel: 16 })
    expect(decode([0xb0, 64, 127]).summary).toContain('Sustain = 127 (on)')
    expect(decode([0xc2, 4])).toMatchObject({ type: 'program', channel: 3, value: 4 })
  })
  it('pitch bend is 14-bit centred', () => {
    expect(pitchBend(0, 64)).toBe(0)
    expect(pitchBend(127, 127)).toBe(8191)
    expect(pitchBend(0, 0)).toBe(-8192)
    expect(decode([0xe0, 0, 0x40]).value).toBe(0)
  })
  it('system messages', () => {
    expect(decode([0xf8]).type).toBe('clock')
    expect(decode([0xfa]).summary).toBe('Start')
    expect(decode([0xf0, 0x7e, 0x7f, 0xf7]).type).toBe('sysex')
    expect(toHex([0x90, 60, 127])).toBe('90 3C 7F')
  })
})
