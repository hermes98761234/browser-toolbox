import { describe, expect, it } from 'vitest'
import { charsetBits, estimate, humanTime } from './password-strength-meter'

describe('password strength', () => {
  it('weak passwords score low', () => {
    expect(estimate('password').score).toBe(0)
    expect(estimate('123456').score).toBe(0)
    expect(estimate('qwerty123').score).toBeLessThanOrEqual(1)
    expect(estimate('P@ssw0rd').score).toBeLessThanOrEqual(1)
    expect(estimate('aaaaaaaaaaaa').score).toBeLessThanOrEqual(1)
    expect(estimate('abcdefgh').score).toBeLessThanOrEqual(1)
    expect(estimate('john1985').score).toBeLessThanOrEqual(2)
  })
  it('detects patterns', () => {
    expect(estimate('password').sequence[0].pattern).toBe('dictionary')
    expect(estimate('zxcvbnm').sequence.some((m) => m.pattern === 'spatial' || m.pattern === 'dictionary')).toBe(true)
    expect(estimate('xkq9876').sequence.some((m) => m.pattern === 'sequence')).toBe(true)
    expect(estimate('abcabcabc').sequence[0].pattern).toBe('repeat')
    expect(estimate('drowssap').sequence[0].detail).toContain('reversed')
  })
  it('strong passwords score high', () => {
    expect(estimate('correcthorsebatterystaple').score).toBeGreaterThanOrEqual(3)
    expect(estimate('k#9Lq!v2Zr&8mWp$').score).toBe(4)
    expect(estimate('Tr0ub4dor&3').score).toBeGreaterThanOrEqual(2)
  })
  it('helpers', () => {
    expect(charsetBits('abcd')).toBeCloseTo(4 * Math.log2(26))
    expect(humanTime(0.5)).toBe('instantly')
    expect(humanTime(90)).toBe('2 minutes')
    expect(humanTime(86400 * 3)).toBe('3 days')
  })
})
