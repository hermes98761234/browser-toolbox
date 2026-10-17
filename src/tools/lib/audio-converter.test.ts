import { describe, expect, it } from 'vitest'
import { adtsHeader, encodeWav, gainFade, mixChannels, muxOggOpus, normGain, oggCrc, oggPage, slice, soundBounds } from './audio-converter'

describe('audio-converter', () => {
  it('writes WAV headers for each depth', () => {
    const ch = [new Float32Array([0, 0.5, -1, 1]), new Float32Array([0, -0.5, 1, -1])]
    const w16 = encodeWav(ch, 44100, 16)
    const v = new DataView(w16.buffer)
    expect(w16.length).toBe(44 + 16)
    expect(v.getUint16(20, true)).toBe(1)
    expect(v.getUint32(28, true)).toBe(44100 * 4)
    expect(v.getInt16(44 + 4 * 2, true)).toBe(-32768)
    const w24 = encodeWav(ch, 48000, 24)
    expect(w24.length).toBe(44 + 24)
    expect(new DataView(w24.buffer).getUint16(34, true)).toBe(24)
    // 0.5 → 0x3FFFFF+… little endian 3 bytes
    expect(w24[44 + 6] | (w24[44 + 7] << 8) | (w24[44 + 8] << 16)).toBe(Math.round(0.5 * 0x7fffff))
    const wf = encodeWav(ch, 48000, 32)
    const vf = new DataView(wf.buffer)
    expect(vf.getUint16(20, true)).toBe(3)
    expect(String.fromCharCode(wf[38], wf[39], wf[40], wf[41])).toBe('fact')
    expect(vf.getFloat32(wf.length - 4, true)).toBe(-1)
  })
  it('mixes channels', () => {
    const m = mixChannels([new Float32Array([1, 0]), new Float32Array([0, 1])], 1)
    expect([...m[0]]).toEqual([0.5, 0.5])
    expect(mixChannels([new Float32Array([1])], 2).length).toBe(2)
  })
  it('normalises, fades, slices and finds sound', () => {
    const c = [new Float32Array([0, 0.25, -0.5, 0.1, 0])]
    expect(normGain(c, 'peak', 0)).toBeCloseTo(2)
    expect(normGain(c, 'rms', 0)).toBeLessThanOrEqual(0.999 / 0.5)
    const f = [new Float32Array(10).fill(1)]
    gainFade(f, 10, 1, 0.5, 0.5)
    expect(f[0][0]).toBe(0)
    expect(f[0][9]).toBe(0)
    expect(f[0][5]).toBeCloseTo(0.8)
    expect(slice(c, 1, 1, 3)[0].length).toBe(2)
    const s = [new Float32Array([0, 0, 0.5, 0.5, 0])]
    expect(soundBounds(s, 1)).toEqual([2, 4])
  })
  it('computes Ogg CRC and pages', () => {
    expect(oggCrc(new TextEncoder().encode('123456789'))).toBe(0x89a1897f)
    const p = oggPage([new Uint8Array(300)], 960n, 1, 2, 0)
    expect(p[26]).toBe(2)
    expect(p[27]).toBe(255)
    expect(p[28]).toBe(45)
    const crc = new DataView(p.buffer).getUint32(22, true)
    const z = p.slice()
    z.set([0, 0, 0, 0], 22)
    expect(oggCrc(z)).toBe(crc)
  })
  it('muxes Ogg Opus with a trimmed final granule', () => {
    const pk = Array.from({ length: 5 }, () => new Uint8Array(100))
    const f = muxOggOpus(pk, [960, 960, 960, 960, 960], { channels: 2, preSkip: 312, inputRate: 44100, total: 4500 })
    const s = new TextDecoder().decode(f.slice(28, 36))
    expect(s).toBe('OpusHead')
    // last page granule = preSkip + total
    let off = 0, last = 0n
    while (off < f.length) {
      const v = new DataView(f.buffer, off)
      last = v.getBigInt64(6, true)
      const nseg = f[off + 26]
      let body = 0
      for (let i = 0; i < nseg; i++) body += f[off + 27 + i]
      off += 27 + nseg + body
    }
    expect(off).toBe(f.length)
    expect(last).toBe(312n + 4500n)
  })
  it('builds ADTS headers', () => {
    const h = adtsHeader(100, 44100, 2)
    expect(h[0]).toBe(0xff)
    expect((h[1] & 0xf6)).toBe(0xf0)
    expect((h[2] >> 2) & 0xf).toBe(4)
    const len = ((h[3] & 3) << 11) | (h[4] << 3) | (h[5] >> 5)
    expect(len).toBe(107)
    expect(((h[2] & 1) << 2) | (h[3] >> 6)).toBe(2)
  })
})

describe('sniff', () => {
  it('reads WAV and MP3 rates', async () => {
    const { sniff, encodeWav } = await import('./audio-converter')
    expect(sniff(encodeWav([new Float32Array(4)], 22050))).toEqual({ kind: 'WAV', rate: 22050 })
    const mp3 = new Uint8Array(64)
    mp3.set([0xff, 0xfb, 0x90, 0x64])
    expect(sniff(mp3)).toEqual({ kind: 'MP3', rate: 44100 })
  })
})
