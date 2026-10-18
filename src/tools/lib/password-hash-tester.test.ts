import { describe, expect, it } from 'vitest'
import { makeHash, selfTest, verifyHash, type HashReq, argon2, argon2Phc, bcryptB64Decode, bcryptB64Encode, bcryptHash, blake2b, fromHex, hmacSha256, parseBcrypt, parsePhc, pbkdf2Sha256, piWords, scrypt, sha256, toHex, utf8 } from './password-hash-tester'

const rfc = (type: 'argon2d' | 'argon2i' | 'argon2id') => toHex(argon2({
  type, password: new Uint8Array(32).fill(1), salt: new Uint8Array(16).fill(2), secret: new Uint8Array(8).fill(3), ad: new Uint8Array(12).fill(4), t: 3, m: 32, p: 4, tagLen: 32,
}))

describe('primitives', () => {
  it('BLAKE2b-512("abc") (RFC 7693 Appendix A)', () => {
    expect(toHex(blake2b(utf8('abc')))).toBe('ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923')
    expect(toHex(blake2b(new Uint8Array(0)))).toBe('786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce')
  })
  it('SHA-256, HMAC and PBKDF2 known answers', () => {
    expect(toHex(sha256(utf8('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(toHex(hmacSha256(utf8('key'), utf8('The quick brown fox jumps over the lazy dog')))).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8')
    expect(toHex(pbkdf2Sha256(utf8('password'), utf8('salt'), 1, 32))).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b')
    expect(toHex(pbkdf2Sha256(utf8('password'), utf8('salt'), 2, 32))).toBe('ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43')
  })
  it('π words for Blowfish', () => {
    const w = piWords()
    expect(w[0]).toBe(0x243f6a88)
    expect(w[17]).toBe(0x8979fb1b)
    expect(w[18]).toBe(0xd1310ba6) // S-box 0, entry 0
  })
})

describe('Argon2 (RFC 9106 test vectors)', () => {
  it('Argon2d', () => expect(rfc('argon2d')).toBe('512b391b6f1162975371d30919734294f868e3be3984f3c1a13a4db9fabe4acb'))
  it('Argon2i', () => expect(rfc('argon2i')).toBe('c814d9d1dc7f37aa13f0d77f2494bda1c8de6b016dd388d29952a4c4672b6ce8'))
  it('Argon2id', () => expect(rfc('argon2id')).toBe('0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659'))
  it('PHC encode / parse round trip', () => {
    const o = { type: 'argon2id' as const, password: utf8('hunter2'), salt: utf8('somesalt'), t: 2, m: 64, p: 1, tagLen: 32 }
    const s = argon2Phc(o, argon2(o))
    const p = parsePhc(s)!
    expect(p.id).toBe('argon2id')
    expect(p.version).toBe(19)
    expect(p.params).toEqual({ m: '64', t: '2', p: '1' })
    expect(toHex(p.hash)).toBe(toHex(argon2(o)))
  })
})

describe('bcrypt (well-known vectors)', () => {
  const v: [string, string][] = [
    ['U*U', '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW'],
    ['U*U*', '$2a$05$CCCCCCCCCCCCCCCCCCCCC.VGOzA784oUp/Z0DY336zx7pLYAy0lwK'],
    ['U*U*U', '$2a$05$XXXXXXXXXXXXXXXXXXXXXOAcXxm9kjPGEMsLznoKqmqw7tc8WCx4a'],
    ['', '$2a$05$CCCCCCCCCCCCCCCCCCCCC.7uG0VCzI2bS7j6ymqJi9CdcdxiRTWNy'],
  ]
  for (const [pw, h] of v) {
    it(`"${pw}"`, () => {
      const p = parseBcrypt(h)!
      expect(bcryptHash(pw, p.salt, p.cost, '2a')).toBe(h)
    })
  }
  it('radix-64 round trip', () => {
    const b = fromHex('00112233445566778899aabbccddeeff')
    expect(toHex(bcryptB64Decode(bcryptB64Encode(b), 16))).toBe(toHex(b))
  })
})

describe('scrypt (RFC 7914 §12)', () => {
  it('N=16, r=1, p=1', () => {
    expect(toHex(scrypt(new Uint8Array(0), new Uint8Array(0), 16, 1, 1, 64))).toBe('77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906')
  })
  it('password/NaCl N=1024, r=8, p=16', () => {
    expect(toHex(scrypt(utf8('password'), utf8('NaCl'), 1024, 8, 16, 64))).toBe('fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b3731622eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640')
  })
})

describe('make / verify round trips', () => {
  const base: HashReq = { alg: 'bcrypt', password: 'correct horse', salt: new Uint8Array(16).fill(7), cost: 4, variant: '2b', m: 64, t: 1, p: 1, ln: 4, r: 2, sp: 1, iters: 1000, len: 32 }
  for (const alg of ['bcrypt', 'argon2id', 'argon2i', 'argon2d', 'scrypt', 'pbkdf2-sha256', 'pbkdf2-sha512'] as const) {
    it(alg, async () => {
      const h = await makeHash({ ...base, alg })
      expect((await verifyHash(h, 'correct horse')).match).toBe(true)
      expect((await verifyHash(h, 'correct horsf')).match).toBe(false)
    })
  }
  it('PBKDF2-SHA256 via WebCrypto matches the JS implementation', async () => {
    const h = await makeHash({ ...base, alg: 'pbkdf2-sha256', iters: 2, salt: utf8('salt'), password: 'password' })
    expect(toHex(parsePhc(h)!.hash)).toBe('ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43')
  })
  it('verifies a reference Argon2id PHC string and rejects junk', async () => {
    await expect(verifyHash('nonsense', 'x')).rejects.toThrow()
    expect(selfTest().every(([, ok]) => ok)).toBe(true)
  })
})
