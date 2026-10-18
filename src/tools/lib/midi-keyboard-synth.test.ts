import { describe, expect, it } from 'vitest'
import { adsrPoints, impulse, isBlack, KEYMAP, keyLabel, midiToFreq, noteName, parseMidi, PRESETS, unisonDetunes } from './midi-keyboard-synth'

describe('midi keyboard synth helpers', () => {
  it('equal temperament tuning', () => {
    expect(midiToFreq(69)).toBe(440)
    expect(midiToFreq(60)).toBeCloseTo(261.6256, 3)
    expect(midiToFreq(81)).toBeCloseTo(880, 6)
    expect(noteName(60)).toBe('C4')
    expect(noteName(61)).toBe('C♯4')
    expect(isBlack(61)).toBe(true)
    expect(isBlack(64)).toBe(false)
  })
  it('parses MIDI messages', () => {
    expect(parseMidi([0x90, 60, 127])).toEqual({ type: 'on', ch: 0, note: 60, vel: 1 })
    expect(parseMidi([0x93, 60, 0])).toEqual({ type: 'off', ch: 3, note: 60 })
    expect(parseMidi([0x80, 62, 40])).toEqual({ type: 'off', ch: 0, note: 62 })
    expect(parseMidi([0xb0, 64, 127])).toMatchObject({ type: 'cc', cc: 64, value: 1 })
    expect(parseMidi([0xe0, 0, 64])).toMatchObject({ type: 'bend', value: 0 })
    expect(parseMidi([0xe0, 127, 127])).toMatchObject({ type: 'bend', value: 1 })
    expect(parseMidi([0xe0, 0, 0]).type === 'bend' && (parseMidi([0xe0, 0, 0]) as { value: number }).value).toBe(-1)
    expect(parseMidi([0xf8])).toEqual({ type: 'other' })
  })
  it('keyboard map covers two octaves and labels keys', () => {
    expect(KEYMAP.KeyZ).toBe(0)
    expect(KEYMAP.KeyQ).toBe(12)
    expect(keyLabel(1)).toBe('S')
    expect(keyLabel(28)).toBe('P')
  })
  it('unison spread is symmetric', () => {
    expect(unisonDetunes(1, 30)).toEqual([0])
    expect(unisonDetunes(3, 20)).toEqual([-10, 0, 10])
    const d = unisonDetunes(4, 30)
    expect(d[0] + d[3]).toBeCloseTo(0)
  })
  it('envelope and impulse shapes', () => {
    const p = adsrPoints(0.1, 0.2, 0.5, 0.3)
    expect(p[1]).toEqual([0.1, 1])
    expect(p[p.length - 1][1]).toBeLessThan(0.05)
    const ir = impulse(0.5, 8000)
    expect(ir).toHaveLength(2)
    expect(ir[0].length).toBe(4000)
    expect(Math.abs(ir[0][3999])).toBeLessThan(1e-3)
    expect(Object.keys(PRESETS).length).toBeGreaterThanOrEqual(6)
  })
})
