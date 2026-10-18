import { describe, expect, it } from 'vitest'
import { b64, b64url, b64urlDecode, hex, jwkThumbprint, mpint, opensshPrivate, sshFingerprint, sshPublicBlob, sshPublicLine } from './key-pair-generator'

const h = (s: string) => Uint8Array.from(s.match(/../g)!.map((x) => parseInt(x, 16)))

describe('SSH wire encoding (RFC 4251 examples)', () => {
  it('mpint', () => {
    expect(hex(mpint(new Uint8Array(0)), '')).toBe('00000000')
    expect(hex(mpint(h('09a378f9b2e332a7')), '')).toBe('0000000809a378f9b2e332a7')
    expect(hex(mpint(h('0080')), '')).toBe('000000020080')
    expect(hex(mpint(h('80')), '')).toBe('000000020080')
  })
})

describe('OpenSSH public keys', () => {
  it('ssh-ed25519 (RFC 8032 test key 1)', async () => {
    const jwk = { kty: 'OKP', crv: 'Ed25519', x: b64url(h('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a')) }
    expect(sshPublicLine(jwk, 'me@host')).toBe('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINdamAGCsQq31Uv+08lkBzoO4XLz2qYjJa8CGmj3B1Ea me@host')
    expect(await sshFingerprint(sshPublicBlob(jwk)!.blob)).toBe('SHA256:bbXpuKG6zhzdmnxq256TlqzFBzRl2f6OOg722cYNbU8')
  })
  it('ssh-rsa layout: string type, mpint e, mpint n', () => {
    const n = new Uint8Array(256).fill(0xab)
    const blob = sshPublicBlob({ kty: 'RSA', e: 'AQAB', n: b64url(n) })!.blob
    expect(hex(blob.subarray(0, 11), '')).toBe('00000007' + hex(new TextEncoder().encode('ssh-rsa'), ''))
    expect(hex(blob.subarray(11, 18), '')).toBe('00000003010001')
    expect(hex(blob.subarray(18, 23), '')).toBe('0000010100') // 257 bytes: leading zero for the high bit
    expect(blob.length).toBe(11 + 7 + 4 + 257)
  })
  it('ecdsa-sha2-nistp256 layout', () => {
    const x = new Uint8Array(32).fill(1), y = new Uint8Array(32).fill(2)
    const k = sshPublicBlob({ kty: 'EC', crv: 'P-256', x: b64url(x), y: b64url(y) })!
    expect(k.type).toBe('ecdsa-sha2-nistp256')
    expect(k.blob.length).toBe(4 + 19 + 4 + 8 + 4 + 65)
    expect(k.blob[4 + 19 + 4 + 8 + 4]).toBe(4)
  })
  it('no SSH form for X25519', () => {
    expect(sshPublicBlob({ kty: 'OKP', crv: 'X25519', x: 'AA' })).toBeNull()
  })
})

describe('private container and thumbprints', () => {
  it('openssh-key-v1 structure', () => {
    const jwk = { kty: 'OKP', crv: 'Ed25519', x: b64url(new Uint8Array(32).fill(7)), d: b64url(new Uint8Array(32).fill(9)) }
    const pemText = opensshPrivate(jwk, 'c', 0x01020304)!
    const raw = Uint8Array.from(atob(pemText.split('\n').slice(1, -2).join('')), (c) => c.charCodeAt(0))
    expect(new TextDecoder().decode(raw.subarray(0, 15))).toBe('openssh-key-v1\0')
    // private section length is a multiple of 8
    // magic + "none" + "none" + "" + count + pubkey blob (4 + 51)
    const tail = raw.subarray(15 + 8 + 8 + 4 + 4 + 4 + 51)
    const len = (tail[0] << 24) | (tail[1] << 16) | (tail[2] << 8) | tail[3]
    expect(len % 8).toBe(0)
    expect(tail.length).toBe(4 + len)
    expect(hex(tail.subarray(4, 12), '')).toBe('0102030401020304')
  })
  it('RFC 7638 thumbprint example', async () => {
    const jwk = {
      kty: 'RSA', e: 'AQAB',
      n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw',
    }
    expect(await jwkThumbprint(jwk)).toBe('NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs')
  })
  it('base64 helpers', () => {
    expect(b64(Uint8Array.of(0xfb, 0xff))).toBe('+/8=')
    expect(b64url(Uint8Array.of(0xfb, 0xff))).toBe('-_8')
    expect([...b64urlDecode('-_8')]).toEqual([0xfb, 0xff])
  })
})
