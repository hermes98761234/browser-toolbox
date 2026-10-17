// Incremental (streaming) hashers in plain TypeScript: MD5, SHA-1, SHA-256, BLAKE3, CRC-32.

export interface Hasher {
  update(data: Uint8Array): void
  digest(): Uint8Array
}

const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n))
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

/** Shared 64-byte block buffering for MD-style hashes. */
abstract class Block64 implements Hasher {
  protected buf = new Uint8Array(64)
  protected len = 0
  protected total = 0
  protected abstract block(b: Uint8Array): void
  protected abstract out(): Uint8Array
  private bigEndian: boolean
  constructor(bigEndian: boolean) {
    this.bigEndian = bigEndian
  }
  update(data: Uint8Array) {
    this.total += data.length
    let i = 0
    if (this.len) {
      const take = Math.min(64 - this.len, data.length)
      this.buf.set(data.subarray(0, take), this.len)
      this.len += take
      i = take
      if (this.len === 64) {
        this.block(this.buf)
        this.len = 0
      }
    }
    for (; i + 64 <= data.length; i += 64) this.block(data.subarray(i, i + 64))
    if (i < data.length) {
      this.buf.set(data.subarray(i), 0)
      this.len = data.length - i
    }
  }
  digest() {
    const bits = this.total * 8
    const pad = new Uint8Array(((this.len < 56 ? 56 : 120) - this.len) + 8)
    pad[0] = 0x80
    const dv = new DataView(pad.buffer)
    const hi = Math.floor(bits / 2 ** 32), lo = bits >>> 0
    if (this.bigEndian) {
      dv.setUint32(pad.length - 8, hi)
      dv.setUint32(pad.length - 4, lo)
    } else {
      dv.setUint32(pad.length - 8, lo, true)
      dv.setUint32(pad.length - 4, hi, true)
    }
    const t = this.total
    this.update(pad)
    this.total = t
    return this.out()
  }
}

const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)
const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]

export class MD5 extends Block64 {
  private h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]
  constructor() { super(false) }
  protected block(b: Uint8Array) {
    const dv = new DataView(b.buffer, b.byteOffset, 64)
    const m = Array.from({ length: 16 }, (_, i) => dv.getUint32(i * 4, true))
    let [a, bb, c, d] = this.h
    for (let i = 0; i < 64; i++) {
      const r = i >> 4
      let f: number, g: number
      if (r === 0) { f = (bb & c) | (~bb & d); g = i }
      else if (r === 1) { f = (d & bb) | (~d & c); g = (5 * i + 1) & 15 }
      else if (r === 2) { f = bb ^ c ^ d; g = (3 * i + 5) & 15 }
      else { f = c ^ (bb | ~d); g = (7 * i) & 15 }
      const tmp = d
      d = c
      c = bb
      bb = (bb + rotl((a + f + MD5_K[i] + m[g]) | 0, MD5_S[(r << 2) | (i & 3)])) | 0
      a = tmp
    }
    this.h = [(this.h[0] + a) | 0, (this.h[1] + bb) | 0, (this.h[2] + c) | 0, (this.h[3] + d) | 0]
  }
  protected out() {
    const o = new Uint8Array(16)
    const dv = new DataView(o.buffer)
    this.h.forEach((x, i) => dv.setUint32(i * 4, x >>> 0, true))
    return o
  }
}

export class SHA1 extends Block64 {
  private h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  private w = new Int32Array(80)
  constructor() { super(true) }
  protected block(b: Uint8Array) {
    const dv = new DataView(b.buffer, b.byteOffset, 64)
    const w = this.w
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(i * 4)
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    let [a, bb, c, d, e] = this.h
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (bb & c) | (~bb & d) : i < 40 ? bb ^ c ^ d : i < 60 ? (bb & c) | (bb & d) | (c & d) : bb ^ c ^ d
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6
      const t = (rotl(a, 5) + f + e + k + w[i]) | 0
      e = d
      d = c
      c = rotl(bb, 30)
      bb = a
      a = t
    }
    this.h = this.h.map((x, i) => (x + [a, bb, c, d, e][i]) | 0)
  }
  protected out() {
    const o = new Uint8Array(20)
    const dv = new DataView(o.buffer)
    this.h.forEach((x, i) => dv.setUint32(i * 4, x >>> 0))
    return o
  }
}

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]
const IV256 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]

export class SHA256 extends Block64 {
  private h = [...IV256]
  private w = new Int32Array(64)
  constructor() { super(true) }
  protected block(b: Uint8Array) {
    const dv = new DataView(b.buffer, b.byteOffset, 64)
    const w = this.w
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let [a, bb, c, d, e, f, g, h] = this.h
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0
      h = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = bb
      bb = a
      a = (t1 + t2) | 0
    }
    this.h = this.h.map((x, i) => (x + [a, bb, c, d, e, f, g, h][i]) | 0)
  }
  protected out() {
    const o = new Uint8Array(32)
    const dv = new DataView(o.buffer)
    this.h.forEach((x, i) => dv.setUint32(i * 4, x >>> 0))
    return o
  }
}

// ---------- BLAKE3 (unkeyed, 32-byte output) ----------
const B3_PERM = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8]
const CHUNK_START = 1, CHUNK_END = 2, PARENT = 4, ROOT = 8

function b3compress(cv: number[], m: Uint32Array, counter: number, blockLen: number, flags: number): Uint32Array {
  const s = new Uint32Array([...cv, IV256[0], IV256[1], IV256[2], IV256[3], counter >>> 0, Math.floor(counter / 2 ** 32) >>> 0, blockLen, flags])
  let w = Uint32Array.from(m)
  const g = (a: number, b: number, c: number, d: number, x: number, y: number) => {
    s[a] = s[a] + s[b] + x; s[d] = rotr(s[d] ^ s[a], 16)
    s[c] = s[c] + s[d]; s[b] = rotr(s[b] ^ s[c], 12)
    s[a] = s[a] + s[b] + y; s[d] = rotr(s[d] ^ s[a], 8)
    s[c] = s[c] + s[d]; s[b] = rotr(s[b] ^ s[c], 7)
  }
  for (let r = 0; r < 7; r++) {
    g(0, 4, 8, 12, w[0], w[1]); g(1, 5, 9, 13, w[2], w[3]); g(2, 6, 10, 14, w[4], w[5]); g(3, 7, 11, 15, w[6], w[7])
    g(0, 5, 10, 15, w[8], w[9]); g(1, 6, 11, 12, w[10], w[11]); g(2, 7, 8, 13, w[12], w[13]); g(3, 4, 9, 14, w[14], w[15])
    if (r < 6) w = Uint32Array.from(B3_PERM, (p) => w[p])
  }
  for (let i = 0; i < 8; i++) {
    s[i] ^= s[i + 8]
    s[i + 8] ^= cv[i]
  }
  return s
}

const words = (b: Uint8Array) => {
  const dv = new DataView(b.buffer, b.byteOffset, 64)
  return Uint32Array.from({ length: 16 }, (_, i) => dv.getUint32(i * 4, true))
}

interface Output {
  cv: number[]
  m: Uint32Array
  counter: number
  len: number
  flags: number
}
const chaining = (o: Output) => [...b3compress(o.cv, o.m, o.counter, o.len, o.flags).slice(0, 8)]

export class BLAKE3 implements Hasher {
  private stack: number[][] = []
  private cv = [...IV256]
  private chunk = 0
  private block = new Uint8Array(64)
  private blockLen = 0
  private blocks = 0
  private chunkLen = () => this.blocks * 64 + this.blockLen
  private chunkOutput(): Output {
    const b = new Uint8Array(64)
    b.set(this.block.subarray(0, this.blockLen))
    return { cv: this.cv, m: words(b), counter: this.chunk, len: this.blockLen, flags: (this.blocks === 0 ? CHUNK_START : 0) | CHUNK_END }
  }
  private parent(l: number[], r: number[]): Output {
    return { cv: [...IV256], m: Uint32Array.from([...l, ...r]), counter: 0, len: 64, flags: PARENT }
  }
  update(data: Uint8Array) {
    let i = 0
    while (i < data.length) {
      if (this.chunkLen() === 1024) {
        let cv = chaining(this.chunkOutput())
        let total = this.chunk + 1
        while ((total & 1) === 0) {
          cv = chaining(this.parent(this.stack.pop()!, cv))
          total /= 2
        }
        this.stack.push(cv)
        this.chunk++
        this.cv = [...IV256]
        this.blocks = 0
        this.blockLen = 0
      }
      if (this.blockLen === 64) {
        this.cv = chaining({ cv: this.cv, m: words(this.block), counter: this.chunk, len: 64, flags: this.blocks === 0 ? CHUNK_START : 0 })
        this.blocks++
        this.blockLen = 0
      }
      const take = Math.min(64 - this.blockLen, data.length - i, 1024 - this.chunkLen())
      this.block.set(data.subarray(i, i + take), this.blockLen)
      this.blockLen += take
      i += take
    }
  }
  digest() {
    let o = this.chunkOutput()
    for (let k = this.stack.length - 1; k >= 0; k--) o = this.parent(this.stack[k], chaining(o))
    const s = b3compress(o.cv, o.m, 0, o.len, o.flags | ROOT)
    const out = new Uint8Array(32)
    const dv = new DataView(out.buffer)
    for (let k = 0; k < 8; k++) dv.setUint32(k * 4, s[k], true)
    return out
  }
}

// ---------- CRC-32 (IEEE) ----------
const CRC_T = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
export class CRC32 implements Hasher {
  private c = 0xffffffff
  update(d: Uint8Array) {
    let c = this.c
    for (let i = 0; i < d.length; i++) c = CRC_T[(c ^ d[i]) & 0xff] ^ (c >>> 8)
    this.c = c
  }
  digest() {
    const o = new Uint8Array(4)
    new DataView(o.buffer).setUint32(0, (this.c ^ 0xffffffff) >>> 0)
    return o
  }
}

export const ALGOS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512', 'BLAKE3', 'CRC-32'] as const
export type Algo = (typeof ALGOS)[number]
/** Algorithms computed incrementally in JS; the rest use Web Crypto on the whole input. */
export const STREAMING: Partial<Record<Algo, () => Hasher>> = { MD5: () => new MD5(), 'SHA-1': () => new SHA1(), 'SHA-256': () => new SHA256(), BLAKE3: () => new BLAKE3(), 'CRC-32': () => new CRC32() }

export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
export function toBase64(b: Uint8Array) {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s)
}

export function hashBytes(algo: Algo, data: Uint8Array): string | null {
  const f = STREAMING[algo]
  if (!f) return null
  const h = f()
  h.update(data)
  return toHex(h.digest())
}

/** Normalises a pasted checksum: hex (any case, spaces/colons ignored) or base64 → lowercase hex. */
export function normalizeExpected(s: string): string {
  const t = s.trim().split(/\s+/)[0] ?? ''
  const hex = t.replace(/[:-]/g, '').toLowerCase()
  if (/^[0-9a-f]+$/.test(hex)) return hex
  try {
    return toHex(Uint8Array.from(atob(t), (c) => c.charCodeAt(0)))
  } catch {
    return hex
  }
}
