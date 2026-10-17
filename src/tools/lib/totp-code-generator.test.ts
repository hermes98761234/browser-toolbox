import { describe, expect, it } from 'vitest'
import { base32Decode, base32Encode, buildOtpauth, hotp, parseOtpauth, totp, verify } from './totp-code-generator'

const ascii = (s: string) => new TextEncoder().encode(s)

describe('totp-code-generator', () => {
  it('base32 round trip', () => {
    expect(base32Encode(ascii('foobar'))).toBe('MZXW6YTBOI')
    expect(new TextDecoder().decode(base32Decode('mzxw 6ytb oi======'))).toBe('foobar')
    expect(() => base32Decode('ABC1')).toThrow()
  })
  it('RFC 4226 HOTP vectors', async () => {
    const k = ascii('12345678901234567890')
    expect(await hotp(k, 0)).toBe('755224')
    expect(await hotp(k, 1)).toBe('287082')
    expect(await hotp(k, 9)).toBe('520489')
  })
  it('RFC 6238 TOTP vectors', async () => {
    const k1 = ascii('12345678901234567890')
    const k256 = ascii('12345678901234567890123456789012')
    const k512 = ascii('1234567890123456789012345678901234567890123456789012345678901234')
    expect(await totp(k1, 59, 30, 8, 'SHA1')).toBe('94287082')
    expect(await totp(k256, 59, 30, 8, 'SHA256')).toBe('46119246')
    expect(await totp(k512, 59, 30, 8, 'SHA512')).toBe('90693936')
    expect(await totp(k1, 1111111109, 30, 8, 'SHA1')).toBe('07081804')
    expect(await totp(k512, 20000000000, 30, 8, 'SHA512')).toBe('47863826')
  })
  it('verify with drift window', async () => {
    const k = ascii('12345678901234567890')
    const prev = await totp(k, 1111111109 - 30, 30, 6)
    expect(await verify(prev, k, 1111111109, 30, 6, 'SHA1', 1)).toBe(-1)
    expect(await verify('000000', k, 1111111109, 30, 6, 'SHA1', 0)).toBe(null)
  })
  it('otpauth URIs', () => {
    const o = parseOtpauth('otpauth://totp/ACME%20Co:john.doe@email.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=ACME%20Co&algorithm=SHA256&digits=8&period=60')
    expect(o).toMatchObject({ type: 'totp', issuer: 'ACME Co', account: 'john.doe@email.com', algo: 'SHA256', digits: 8, period: 60 })
    const back = parseOtpauth(buildOtpauth(o))
    expect(back).toEqual(o)
    expect(() => parseOtpauth('https://x')).toThrow()
  })
})
