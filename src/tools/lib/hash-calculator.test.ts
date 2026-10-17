import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { BLAKE3, hashBytes, normalizeExpected, STREAMING, toBase64, toHex, type Algo } from './hash-calculator'

const enc = (s: string) => new TextEncoder().encode(s)
const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) % 251)

describe('hash-calculator', () => {
  it('matches known vectors', () => {
    expect(hashBytes('MD5', enc(''))).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(hashBytes('MD5', enc('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(hashBytes('SHA-1', enc('abc'))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    expect(hashBytes('SHA-256', enc('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hashBytes('CRC-32', enc('123456789'))).toBe('cbf43926')
    expect(hashBytes('BLAKE3', enc(''))).toBe('af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262')
    expect(hashBytes('BLAKE3', enc('abc'))).toBe('6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85')
  })
  it('matches node:crypto across block boundaries and split updates', () => {
    const node: Partial<Record<Algo, string>> = { MD5: 'md5', 'SHA-1': 'sha1', 'SHA-256': 'sha256' }
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 4097]) {
      const d = bytes(n)
      for (const [a, nm] of Object.entries(node) as [Algo, string][]) {
        const h = STREAMING[a]!()
        h.update(d.subarray(0, n >> 1))
        h.update(d.subarray(n >> 1))
        expect(toHex(h.digest()), `${a} ${n}`).toBe(createHash(nm).update(d).digest('hex'))
      }
    }
  })
  it('streams BLAKE3 consistently over chunk boundaries', () => {
    for (const n of [1023, 1024, 1025, 2048, 3073, 9000]) {
      const d = bytes(n)
      const one = hashBytes('BLAKE3', d)
      const h = new BLAKE3()
      for (let i = 0; i < n; i += 97) h.update(d.subarray(i, Math.min(n, i + 97)))
      expect(toHex(h.digest())).toBe(one)
    }
  })
  it('normalises expected values', () => {
    expect(normalizeExpected('  CB:F4:39:26  file.txt')).toBe('cbf43926')
    expect(normalizeExpected(toBase64(Uint8Array.from([1, 2, 255])))).toBe('0102ff')
  })
})
