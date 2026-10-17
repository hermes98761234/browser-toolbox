import { describe, expect, it } from 'vitest'
import { algInfo, decodeJwt, relative, signHmac, timeStatus, verify, warnings } from './jwt-decoder'

// jwt.io's classic example, secret "your-256-bit-secret".
const HS = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
const RS = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0IiwiaWF0IjoxfQ.s7xsRhzftggVBs0y6V0-Bh5Tfx1G_TbvoT4htOf0cvDuqHn4V543fQWi9qWMqPl6xZLhUT-X4LSsQQTuHijOoIEqUcLaFaFm7PLLIctx5sdxmdEs4yV18-dDzmVDd4Nk2jz0ACJyWJUH3r_NAJT_cy7ggdekAQKSz_9WZCTilDs'
const RS_PEM = '-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDQJzWHB5Hf8ThgI3YXT02diK+Z\nutLAPCiPpDW1zsrh+Ssg3nTfGpkqE3Bl+BBV1jOVT2wJuPsVM3cJNxoAIDh9HKe5\nnlj9vW1NXLdTuaB8DXYdbahHKbrvOih3qiceLEKlt4X84hAa7159xdd0aVe79fEV\nc0VWmDKx5jc32nLwpwIDAQAB\n-----END PUBLIC KEY-----\n'
const ES = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0IiwiaWF0IjoxfQ.3yCL3EEkSu_4MPo7t1Crs52dlAAdu-VrtXt7YNMpuUGzvauT7qzZbydqcHQNhApQvzGJjiA3yNENDwOPZttzDA'
const ES_PEM = '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE5rI2xjVGAFC9jL0uqB5/mj5DKXbd\n/RQku5T+7qRFqEoVfylY7x4xz5hbKk4QswQ+gM8x6Q+Mx87Oh0QeUJ4mYg==\n-----END PUBLIC KEY-----\n'

describe('jwt-decoder', () => {
  it('decodes segments', () => {
    const d = decodeJwt(`Bearer ${HS}`)
    expect(d.errors).toEqual([])
    expect(d.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(d.payload).toEqual({ sub: '1234567890', name: 'John Doe', iat: 1516239022 })
    expect(d.signature.length).toBe(32)
    expect(decodeJwt('a.b').errors[0]).toMatch(/3 dot-separated/)
    expect(decodeJwt('a.b.c.d.e').errors[0]).toMatch(/JWE/)
  })
  it('checks time claims', () => {
    expect(timeStatus({ iat: 100, exp: 200 }, 150)).toEqual({ state: 'valid', lifetime: 100, remaining: 50 })
    expect(timeStatus({ exp: 200 }, 200).state).toBe('expired')
    expect(timeStatus({ exp: 200 }, 205, 10).state).toBe('valid')
    expect(timeStatus({ nbf: 300, exp: 400 }, 250).state).toBe('early')
    expect(timeStatus({}, 1).state).toBe('no-exp')
    expect(relative(3725)).toBe('in 1 h 2 min')
    expect(relative(-90000)).toBe('1 d 1 h ago')
  })
  it('warns about risky tokens', () => {
    expect(warnings({ alg: 'none' }, { exp: 1 })[0]).toMatch(/unsigned/)
    expect(warnings({ alg: 'HS256' }, { password: 'x' }).length).toBe(2)
    expect(algInfo('ES512')).toEqual({ kind: 'ec', hash: 'SHA-512', curve: 'P-521' })
  })
  it('verifies HMAC, RSA and ECDSA signatures', async () => {
    expect(await verify(HS, 'your-256-bit-secret')).toBe(true)
    expect(await verify(HS, 'wrong')).toBe(false)
    expect(await verify(RS, RS_PEM)).toBe(true)
    expect(await verify(ES, ES_PEM)).toBe(true)
    expect(await verify(RS.slice(0, -2) + 'AA', RS_PEM)).toBe(false)
  })
  it('signs HMAC tokens', async () => {
    const t = await signHmac({ alg: 'HS256', typ: 'JWT' }, { sub: '1234567890', name: 'John Doe', iat: 1516239022 }, 'your-256-bit-secret')
    expect(t).toBe(HS)
  })
})
