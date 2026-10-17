import { describe, expect, it } from 'vitest'
import { clock, parseCommand, parseDuration } from './cooking-timer-hub'

describe('cooking timer voice parsing', () => {
  it('parses durations', () => {
    expect(parseDuration('9 minutes')).toBe(540)
    expect(parseDuration('one hour twenty minutes')).toBe(4800)
    expect(parseDuration('twenty five minutes')).toBe(1500)
    expect(parseDuration('one and a half hours')).toBe(5400)
    expect(parseDuration('half an hour')).toBe(1800)
    expect(parseDuration('90 seconds')).toBe(90)
    expect(parseDuration('a minute')).toBe(60)
  })
  it('parses commands', () => {
    expect(parseCommand('Start pasta 9 minutes')).toEqual({ action: 'start', name: 'pasta', seconds: 540 })
    expect(parseCommand('set a timer for boiled eggs for six minutes')).toEqual({ action: 'start', name: 'boiled eggs', seconds: 360 })
    expect(parseCommand('stop the rice')).toEqual({ action: 'stop', name: 'rice', seconds: 0 })
    expect(parseCommand('add two minutes to pasta')).toEqual({ action: 'add', name: 'pasta', seconds: 120 })
    expect(parseCommand('um')?.name).toBe('um')
    expect(parseCommand('please')).toBeNull()
  })
  it('formats clock', () => {
    expect(clock(65)).toBe('1:05')
    expect(clock(3725)).toBe('1:02:05')
    expect(clock(0.2)).toBe('0:01')
  })
})
