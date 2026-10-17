import { describe, expect, it } from 'vitest'
import { combine, decodeShare, encodeShare, gfDiv, gfInv, gfMul, interpolate0, split } from './secret-sharing-splitter'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array) => new TextDecoder().decode(b)

describe('GF(256)', () => {
  it('AES field facts', () => {
    expect(gfMul(0x53, 0xca)).toBe(0x01) // classic inverse pair
    expect(gfMul(0x57, 0x83)).toBe(0xc1) // FIPS-197 example
    expect(gfInv(0x53)).toBe(0xca)
    for (let a = 1; a < 256; a++) expect(gfMul(a, gfInv(a))).toBe(1)
    expect(gfDiv(gfMul(7, 99), 99)).toBe(7)
  })
  it('interpolates a line through two points', () => {
    // f(x) = 42 + 5x → f(1) = 42^5, f(2) = 42^gfMul(5,2)
    expect(interpolate0([1, 2], [42 ^ 5, 42 ^ gfMul(5, 2)])).toBe(42)
  })
})

describe('Shamir split / combine', () => {
  const secret = 'correct horse battery staple — ключ 🔑'
  it('round-trips with any k-subset', () => {
    const shares = split(enc(secret), 5, 3)
    const subsets = [[0, 1, 2], [0, 2, 4], [4, 3, 1], [1, 2, 3, 4]]
    for (const ss of subsets) {
      const r = combine(ss.map((i) => shares[i]))
      expect(r.ok).toBe(true)
      expect(dec(r.secret)).toBe(secret)
    }
  })
  it('fewer than k shares do not reveal the secret', () => {
    const shares = split(enc(secret), 5, 3)
    const r = combine([{ ...shares[0], k: 2 }, { ...shares[1], k: 2 }])
    expect(r.ok).toBe(false)
  })
  it('text encoding round-trip and tamper detection', () => {
    const shares = split(enc('hi'), 3, 2).map(encodeShare)
    expect(shares[0]).toMatch(/^SSS1-2-1-[0-9A-F]+$/)
    const back = shares.map(decodeShare)
    expect(dec(combine(back.slice(1)).secret)).toBe('hi')
    const bad = { ...back[0], data: back[0].data.map((v, i) => (i === 0 ? v ^ 1 : v)) }
    expect(combine([bad, back[1]]).ok).toBe(false)
    expect(() => decodeShare('nope')).toThrow()
  })
})
