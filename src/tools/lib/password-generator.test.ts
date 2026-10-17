import { describe, expect, it } from 'vitest'
import { charEntropy, crackTime, estimateEntropy, generatePassphrase, generatePassword, generatePin, pools, randomInt, WORDS, type Rng } from './password-generator'

const seq = (vals: number[]): Rng => {
  let i = 0
  return (n) => Uint32Array.from({ length: n }, () => vals[i++ % vals.length])
}

describe('password-generator', () => {
  it('has 1296 unique words', () => {
    expect(WORDS.length).toBe(1296)
    expect(new Set(WORDS).size).toBe(1296)
    expect(WORDS.every((w) => /^[a-z]{2,6}$/.test(w))).toBe(true)
  })
  it('rejects biased random values', () => {
    // n = 3: limit = floor(2^32/3)*3 = 4294967295 → value 4294967295 must be rejected
    expect(randomInt(3, seq([4294967295, 7]))).toBe(1)
  })
  it('generates passwords from the chosen sets', () => {
    const o = { length: 24, upper: true, lower: true, digits: true, symbols: false, symbolSet: '!@#', excludeAmbiguous: true, requireEach: true }
    for (let k = 0; k < 50; k++) {
      const p = generatePassword(o)
      expect(p).toHaveLength(24)
      expect(p).toMatch(/[A-Z]/)
      expect(p).toMatch(/[a-z]/)
      expect(p).toMatch(/[0-9]/)
      expect(p).not.toMatch(/[Il1O0o!@#]/)
    }
    expect(pools(o).join('').length).toBe(26 + 26 + 10 - 6)
  })
  it('computes entropy and passphrases', () => {
    expect(charEntropy(16, 94)).toBeCloseTo(16 * Math.log2(94), 9)
    const p = generatePassphrase({ words: 6, separator: '-', capitalize: true, addNumber: false, addSymbol: false })
    expect(p.text.split('-')).toHaveLength(6)
    expect(p.bits).toBeCloseTo(6 * Math.log2(1296), 9)
    expect(generatePin(6)).toMatch(/^\d{6}$/)
  })
  it('estimates typed passwords and crack times', () => {
    expect(estimateEntropy('password123').notes.length).toBeGreaterThan(0)
    expect(estimateEntropy('Tr0ub4dor&3').bits).toBeGreaterThan(60)
    expect(crackTime(10, 1000)).toBe('instantly')
    expect(crackTime(40, 1e10)).toMatch(/second/)
    expect(crackTime(128, 1e12)).toMatch(/years|universe/)
  })
})
