import { describe, expect, it } from 'vitest'
import { encodeGif, lzwDecode, lzwEncode, makeMatcher, mapPixels, medianCut, writeGif } from './video-to-gif'

describe('gif encoder', () => {
  it('LZW round-trips including dictionary resets', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 8) & 255
    for (const [len, bits] of [[10, 2], [5000, 4], [60000, 8], [1, 2]] as const) {
      const idx = new Uint8Array(len).map((_, i) => (bits === 8 ? rnd() : (rnd() % (1 << bits)) & (i % 7 === 0 ? 0 : 255)))
      const enc = lzwEncode(idx, bits)
      expect([...lzwDecode(enc, bits, len)]).toEqual([...idx])
    }
  })
  it('median cut finds the dominant colours', () => {
    const px = new Uint8Array(4 * 300)
    for (let i = 0; i < 300; i++) px.set(i < 100 ? [255, 0, 0, 255] : i < 200 ? [0, 255, 0, 255] : [0, 0, 255, 255], i * 4)
    const pal = medianCut(px, 4)
    const cols = [...Array(pal.length / 3).keys()].map((i) => [...pal.slice(i * 3, i * 3 + 3)].join(','))
    expect(cols).toEqual(expect.arrayContaining(['255,0,0', '0,255,0', '0,0,255']))
    const m = makeMatcher(pal)
    expect(cols[m(250, 10, 5)]).toBe('255,0,0')
  })
  it('writes a well-formed GIF stream', () => {
    const pal = new Uint8Array([0, 0, 0, 255, 255, 255])
    const g = writeGif(2, 2, [{ x: 0, y: 0, w: 2, h: 2, idx: new Uint8Array([0, 1, 1, 0]), delayCs: 10, transparent: -1 }], pal, 0)
    expect(new TextDecoder().decode(g.slice(0, 6))).toBe('GIF89a')
    expect(g[6]).toBe(2)
    expect(g[10]).toBe(0xf0) // global table, 1 bit → 2 entries
    expect(g[g.length - 1]).toBe(0x3b)
  })
  it('optimised animation crops unchanged frames', () => {
    const w = 8, h = 8
    const a = new Uint8ClampedArray(w * h * 4).fill(255)
    const b = a.slice()
    b.set([0, 0, 0, 255], (3 * w + 4) * 4) // one pixel changes
    const r = encodeGif(w, h, [a, a.slice(), b], [10, 10, 10], { colors: 4, dither: 'none', strength: 1, optimize: true, localPalettes: false, loop: 0 })
    expect(r.frames).toBe(2) // duplicate frame merged
    expect(r.bytes[r.bytes.length - 1]).toBe(0x3b)
    const pal = new Uint8Array([0, 0, 0, 255, 255, 255])
    expect([...mapPixels(new Uint8Array([10, 10, 10, 255, 240, 240, 240, 255]), 2, 1, makeMatcher(pal), pal, 'fs')]).toEqual([0, 1])
  })
})
