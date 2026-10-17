import { describe, expect, it } from 'vitest'
import { armor, decrypt, encrypt, entropyBits, parseHeader, randomPassword, unarmor } from './file-encryptor'

const meta = { name: 'note.txt', type: 'text/plain', size: 5, created: '2026-01-01T00:00:00Z' }

describe('file encryptor', () => {
  it('round-trips data and metadata', async () => {
    const data = new TextEncoder().encode('hello')
    const ct = await encrypt(data, meta, 'p@ss', 1000)
    const h = parseHeader(ct)
    expect(h.iterations).toBe(1000)
    expect(h.salt).toHaveLength(16)
    expect(ct.length).toBe(h.headerLen + 4 + JSON.stringify(meta).length + 5 + 16)
    const out = await decrypt(ct, 'p@ss')
    expect(new TextDecoder().decode(out.data)).toBe('hello')
    expect(out.meta).toEqual(meta)
  })
  it('rejects wrong passwords and tampering (including the header)', async () => {
    const ct = await encrypt(new Uint8Array([1, 2, 3]), meta, 'right', 1000)
    await expect(decrypt(ct, 'wrong')).rejects.toThrow(/Wrong password/)
    const bad = ct.slice()
    bad[bad.length - 1] ^= 1
    await expect(decrypt(bad, 'right')).rejects.toThrow()
    const hdr = ct.slice()
    hdr[20] ^= 1 // salt byte
    await expect(decrypt(hdr, 'right')).rejects.toThrow()
    expect(() => parseHeader(new Uint8Array(50))).toThrow(/magic/)
  })
  it('armors as text', async () => {
    const ct = await encrypt(new Uint8Array(300).fill(7), meta, 'x', 1000)
    const t = armor(ct)
    expect(t.startsWith('-----BEGIN BTENC-----')).toBe(true)
    expect(unarmor(t)).toEqual(ct)
  })
  it('makes strong random passwords', () => {
    const p = randomPassword(20)
    expect(p.replace(/-/g, '')).toHaveLength(20)
    expect(entropyBits('password')).toBeLessThan(40)
    expect(entropyBits(p)).toBeGreaterThan(80)
  })
})
