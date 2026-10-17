// Audio Converter: pure DSP and container helpers — WAV (16/24-bit PCM, 32-bit float),
// channel mixing, gain/fades, Ogg page muxing for Opus, and ADTS headers for AAC.

export type Depth = 16 | 24 | 32

/** RIFF/WAVE file; 32 = IEEE float (WAVE_FORMAT_IEEE_FLOAT with a fact chunk). */
export function encodeWav(channels: Float32Array[], rate: number, depth: Depth = 16, dither = false, seed = 1): Uint8Array {
  const nc = channels.length, n = channels[0]?.length ?? 0
  const bps = depth / 8, isF = depth === 32
  const data = n * nc * bps
  const fmtLen = isF ? 18 : 16
  const head = 12 + 8 + fmtLen + (isF ? 12 : 0) + 8
  const buf = new ArrayBuffer(head + data)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, head - 8 + data, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, fmtLen, true)
  v.setUint16(20, isF ? 3 : 1, true)
  v.setUint16(22, nc, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * nc * bps, true)
  v.setUint16(32, nc * bps, true)
  v.setUint16(34, depth, true)
  let o = 36
  if (isF) {
    v.setUint16(o, 0, true)
    o += 2
    str(o, 'fact')
    v.setUint32(o + 4, 4, true)
    v.setUint32(o + 8, n, true)
    o += 12
  }
  str(o, 'data')
  v.setUint32(o + 4, data, true)
  o += 8
  let r = seed >>> 0
  const rnd = () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < n; i++)
    for (let c = 0; c < nc; c++) {
      const x = channels[c][i]
      if (isF) v.setFloat32(o, x, true)
      else if (depth === 16) {
        const d = dither ? (rnd() - rnd()) / 32768 : 0 // TPDF, ±1 LSB
        const s = Math.max(-1, Math.min(1, x + d))
        v.setInt16(o, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true)
      } else {
        const s = Math.max(-1, Math.min(1, x))
        const q = s < 0 ? Math.round(s * 0x800000) : Math.round(s * 0x7fffff)
        v.setUint8(o, q & 0xff)
        v.setUint8(o + 1, (q >> 8) & 0xff)
        v.setUint8(o + 2, (q >> 16) & 0xff)
      }
      o += bps
    }
  return new Uint8Array(buf)
}

/** Down-/up-mixes to `n` channels: mono = average; mono→stereo duplicates; else keeps the first n. */
export function mixChannels(ch: Float32Array[], n: number): Float32Array[] {
  if (!ch.length || n === ch.length || n <= 0) return ch
  const len = ch[0].length
  if (n === 1) {
    const out = new Float32Array(len)
    for (const c of ch) for (let i = 0; i < len; i++) out[i] += c[i] / ch.length
    return [out]
  }
  if (ch.length === 1) return Array.from({ length: n }, () => ch[0].slice())
  return ch.slice(0, n)
}

export function slice(ch: Float32Array[], rate: number, start: number, end: number): Float32Array[] {
  const len = ch[0]?.length ?? 0
  const a = Math.max(0, Math.min(len, Math.round(start * rate)))
  const b = end > 0 ? Math.max(a, Math.min(len, Math.round(end * rate))) : len
  return ch.map((c) => c.slice(a, b))
}

export function peak(ch: Float32Array[]): number {
  let p = 0
  for (const c of ch) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a }
  return p
}

export function rms(ch: Float32Array[]): number {
  let s = 0, n = 0
  for (const c of ch) { for (let i = 0; i < c.length; i++) s += c[i] * c[i]; n += c.length }
  return n ? Math.sqrt(s / n) : 0
}

export const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity)

/** Gain (linear) for peak or RMS normalisation to `target` dBFS; RMS mode never pushes the peak above 0 dBFS. */
export function normGain(ch: Float32Array[], mode: 'peak' | 'rms', target: number): number {
  const p = peak(ch)
  if (p === 0) return 1
  const g = Math.pow(10, target / 20) / (mode === 'peak' ? p : rms(ch) || p)
  return mode === 'rms' ? Math.min(g, 0.999 / p) : g
}

/** Applies gain and linear fades (seconds) in place. */
export function gainFade(ch: Float32Array[], rate: number, gain: number, fadeIn = 0, fadeOut = 0): void {
  const len = ch[0]?.length ?? 0
  const fi = Math.min(len, Math.round(fadeIn * rate)), fo = Math.min(len, Math.round(fadeOut * rate))
  for (const c of ch)
    for (let i = 0; i < len; i++) {
      let g = gain
      if (i < fi) g *= i / fi
      if (i >= len - fo) g *= (len - 1 - i) / fo
      c[i] *= g
    }
}

/** First and last sample above `thresholdDb` (any channel) → [start, end] seconds. */
export function soundBounds(ch: Float32Array[], rate: number, thresholdDb = -50): [number, number] {
  const th = Math.pow(10, thresholdDb / 20)
  const len = ch[0]?.length ?? 0
  let a = -1, b = -1
  for (let i = 0; i < len; i++) if (ch.some((c) => Math.abs(c[i]) > th)) { a = i; break }
  for (let i = len - 1; i >= 0; i--) if (ch.some((c) => Math.abs(c[i]) > th)) { b = i; break }
  return a < 0 ? [0, len / rate] : [a / rate, (b + 1) / rate]
}

// ---------- Ogg ----------

const OGG_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    t[i] = r >>> 0
  }
  return t
})()

/** Ogg CRC-32 (polynomial 0x04C11DB7, no reflection, init 0). */
export function oggCrc(d: Uint8Array): number {
  let c = 0
  for (let i = 0; i < d.length; i++) c = ((c << 8) ^ OGG_TABLE[((c >>> 24) ^ d[i]) & 0xff]) >>> 0
  return c >>> 0
}

/** One Ogg page holding whole packets (each must fit the 255-segment limit together). */
export function oggPage(packets: Uint8Array[], granule: bigint, serial: number, seq: number, flags: number): Uint8Array {
  const lacing: number[] = []
  for (const p of packets) {
    let n = p.length
    while (n >= 255) { lacing.push(255); n -= 255 }
    lacing.push(n)
  }
  const body = packets.reduce((a, p) => a + p.length, 0)
  const out = new Uint8Array(27 + lacing.length + body)
  const v = new DataView(out.buffer)
  out.set([0x4f, 0x67, 0x67, 0x53], 0) // OggS
  out[4] = 0
  out[5] = flags
  v.setBigInt64(6, granule, true)
  v.setUint32(14, serial, true)
  v.setUint32(18, seq, true)
  out[26] = lacing.length
  out.set(lacing, 27)
  let o = 27 + lacing.length
  for (const p of packets) { out.set(p, o); o += p.length }
  v.setUint32(22, oggCrc(out), true)
  return out
}

export function opusHead(channels: number, preSkip: number, inputRate: number): Uint8Array {
  const b = new Uint8Array(19)
  const v = new DataView(b.buffer)
  b.set([...'OpusHead'].map((c) => c.charCodeAt(0)))
  b[8] = 1
  b[9] = channels
  v.setUint16(10, preSkip, true)
  v.setUint32(12, inputRate, true)
  v.setInt16(16, 0, true)
  b[18] = 0 // mapping family 0: mono/stereo
  return b
}

export function opusTags(vendor: string, comments: string[] = []): Uint8Array {
  const enc = new TextEncoder()
  const vd = enc.encode(vendor), cs = comments.map((c) => enc.encode(c))
  const b = new Uint8Array(8 + 4 + vd.length + 4 + cs.reduce((a, c) => a + 4 + c.length, 0))
  const v = new DataView(b.buffer)
  b.set([...'OpusTags'].map((c) => c.charCodeAt(0)))
  v.setUint32(8, vd.length, true)
  b.set(vd, 12)
  let o = 12 + vd.length
  v.setUint32(o, cs.length, true)
  o += 4
  for (const c of cs) { v.setUint32(o, c.length, true); b.set(c, o + 4); o += 4 + c.length }
  return b
}

/**
 * Ogg Opus file from encoded packets. `samples` = 48 kHz samples per packet; `total` = real
 * length in 48 kHz samples (sets the final granule so decoders trim encoder padding).
 */
export function muxOggOpus(packets: Uint8Array[], samples: number[], o: { channels: number; preSkip: number; inputRate: number; total: number; serial?: number; head?: Uint8Array; tags?: string[] }): Uint8Array {
  const serial = o.serial ?? 0x5eed1234
  const pages: Uint8Array[] = []
  let seq = 0
  pages.push(oggPage([o.head ?? opusHead(o.channels, o.preSkip, o.inputRate)], 0n, serial, seq++, 0x02))
  pages.push(oggPage([opusTags('Browser Toolbox audio-converter', o.tags)], 0n, serial, seq++, 0))
  let gran = o.preSkip
  const limit = o.preSkip + o.total
  let cur: Uint8Array[] = [], segs = 0
  const flush = (last: boolean) => {
    if (!cur.length) return
    pages.push(oggPage(cur, BigInt(last ? Math.min(gran, limit) : gran), serial, seq++, last ? 0x04 : 0))
    cur = []
    segs = 0
  }
  packets.forEach((p, i) => {
    const s = Math.floor(p.length / 255) + 1
    if (segs + s > 255 || cur.length >= 50) flush(false)
    cur.push(p)
    segs += s
    gran += samples[i]
  })
  flush(true)
  const out = new Uint8Array(pages.reduce((a, p) => a + p.length, 0))
  let off = 0
  for (const p of pages) { out.set(p, off); off += p.length }
  return out
}

// ---------- AAC / ADTS ----------

export const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]

/** 7-byte ADTS header (MPEG-4, AAC-LC, no CRC) for a raw AAC frame of `len` bytes. */
export function adtsHeader(len: number, rate: number, channels: number): Uint8Array {
  const sf = AAC_RATES.indexOf(rate)
  if (sf < 0) throw new Error(`AAC does not support ${rate} Hz`)
  const L = len + 7
  const profile = 1 // AAC LC (object type 2) − 1
  return new Uint8Array([
    0xff,
    0xf1,
    (profile << 6) | (sf << 2) | ((channels >> 2) & 1),
    ((channels & 3) << 6) | ((L >> 11) & 3),
    (L >> 3) & 0xff,
    ((L & 7) << 5) | 0x1f,
    0xfc,
  ])
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

/** Expected output size in bytes. */
export function estimateBytes(fmt: 'wav' | 'opus' | 'aac', seconds: number, rate: number, channels: number, depth: Depth, kbps: number): number {
  if (fmt === 'wav') return 44 + seconds * rate * channels * (depth / 8)
  return (seconds * kbps * 1000) / 8 * (fmt === 'opus' ? 1.01 : 1.02)
}

// ---------- input sniffing ----------

/** Container/codec name and native sample rate from the first bytes of a file (null if unknown). */
export function sniff(b: Uint8Array): { kind: string; rate: number | null } {
  const s = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n))
  const u32le = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)
  if (b.length < 12) return { kind: 'unknown', rate: null }
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WAVE') {
    for (let o = 12; o + 8 < b.length && o < 4096; ) {
      const id = s(o, 4), len = u32le(o + 4) >>> 0
      if (id === 'fmt ') return { kind: 'WAV', rate: u32le(o + 12) >>> 0 }
      o += 8 + len + (len & 1)
    }
    return { kind: 'WAV', rate: null }
  }
  if (s(0, 4) === 'fLaC') return { kind: 'FLAC', rate: (b[18] << 12) | (b[19] << 4) | (b[20] >> 4) }
  if (s(0, 4) === 'OggS') {
    const seg = b[26], p = 27 + seg
    if (s(p, 8) === 'OpusHead') return { kind: 'Ogg Opus', rate: 48000 }
    if (s(p + 1, 6) === 'vorbis') return { kind: 'Ogg Vorbis', rate: u32le(p + 12) >>> 0 }
    if (s(p, 5) === '\x7fFLAC') return { kind: 'Ogg FLAC', rate: (b[p + 27] << 12) | (b[p + 28] << 4) | (b[p + 29] >> 4) }
    return { kind: 'Ogg', rate: null }
  }
  if (s(4, 4) === 'ftyp') {
    const lim = Math.min(b.length - 36, 4_000_000)
    for (let i = 0; i < lim; i++) if (b[i] === 0x6d && b[i + 1] === 0x70 && b[i + 2] === 0x34 && b[i + 3] === 0x61) return { kind: 'M4A / AAC', rate: (b[i + 28] << 8) | b[i + 29] }
    return { kind: 'MP4', rate: null }
  }
  if (s(0, 4) === '\x1aE\xdf\xa3') return { kind: 'WebM', rate: null }
  let o = 0
  if (s(0, 3) === 'ID3') o = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f))
  for (let i = o; i < Math.min(b.length - 4, o + 65536); i++) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue
    if ((b[i + 1] & 0xf6) === 0xf0) return { kind: 'AAC (ADTS)', rate: AAC_RATES[(b[i + 2] >> 2) & 0xf] ?? null }
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, sr = (b[i + 2] >> 2) & 3
    if (ver === 1 || layer === 0 || sr === 3) continue
    const base = [44100, 48000, 32000][sr]
    return { kind: layer === 1 ? 'MP3' : `MPEG layer ${4 - layer}`, rate: ver === 3 ? base : ver === 2 ? base / 2 : base / 4 }
  }
  return { kind: 'unknown', rate: null }
}
