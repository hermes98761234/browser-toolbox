import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, bytesToText, sniffMime, textToBytes } from './base64-converter'

const enc = (s: string, o = {}) => bytesToBase64(textToBytes(s), o)
const dec = (s: string) => {
  const r = base64ToBytes(s)
  return r.ok ? bytesToText(r.bytes) : `ERR ${r.error}`
}

describe('base64', () => {
  it('RFC 4648 test vectors', () => {
    const v: [string, string][] = [['', ''], ['f', 'Zg=='], ['fo', 'Zm8='], ['foo', 'Zm9v'], ['foob', 'Zm9vYg=='], ['fooba', 'Zm9vYmE='], ['foobar', 'Zm9vYmFy']]
    for (const [p, e] of v) {
      expect(enc(p)).toBe(e)
      expect(dec(e)).toBe(p)
    }
  })
  it('utf-8 and url-safe', () => {
    expect(enc('héllo ✓')).toBe('aMOpbGxvIOKckw==')
    expect(dec('aMOpbGxvIOKckw==')).toBe('héllo ✓')
    const b = new Uint8Array([0xfb, 0xff, 0xbf])
    expect(bytesToBase64(b)).toBe('+/+/')
    expect(bytesToBase64(b, { urlSafe: true })).toBe('-_-_')
    const r = base64ToBytes('-_-_')
    expect(r.ok && [...r.bytes]).toEqual([0xfb, 0xff, 0xbf])
    expect(dec('Zm9vYg')).toBe('foob')
  })
  it('wrap, whitespace, data uri, errors', () => {
    expect(enc('a'.repeat(60), { wrap: 76 }).split('\n')[0].length).toBe(76)
    expect(dec('Zm9v\nYmFy')).toBe('foobar')
    expect(dec('data:text/plain;base64,aGk=')).toBe('hi')
    expect(dec('Zm9v!')).toMatch(/Invalid character/)
    expect(dec('Zm9vY')).toMatch(/length/)
    expect(dec('+_ab')).toMatch(/Mixed/)
  })
  it('sniffs mime types', () => {
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10]))?.mime).toBe('image/png')
    expect(sniffMime(textToBytes('<svg xmlns="x"></svg>'))?.ext).toBe('svg')
    expect(sniffMime(textToBytes('hello'))).toBeNull()
  })
})
