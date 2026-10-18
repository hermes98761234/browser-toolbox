// Password hashing written from the specifications: BLAKE2b (RFC 7693), Argon2d/i/id (RFC 9106),
// bcrypt (Provos & Mazières 1999, Blowfish key schedule with π-derived constants computed here),
// SHA-256 / HMAC / PBKDF2 (FIPS 180-4, RFC 2104, RFC 8018) and scrypt (RFC 7914). PHC string helpers.
// Pure synchronous code so it runs in a Web Worker and in tests.

const enc = new TextEncoder()
export const utf8 = (s: string) => enc.encode(s)
export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
export function fromHex(h: string): Uint8Array {
  const s = h.replace(/[^0-9a-f]/gi, '')
  const out = new Uint8Array(s.length >> 1)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16)
  return out
}
const concat = (...a: Uint8Array[]) => {
  const out = new Uint8Array(a.reduce((s, x) => s + x.length, 0))
  let o = 0
  for (const x of a) {
    out.set(x, o)
    o += x.length
  }
  return out
}
const le32 = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255])

/** Constant-time byte comparison. */
export function equalCT(a: Uint8Array, b: Uint8Array): boolean {
  let d = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return d === 0
}

// ---------------------------------------------------------------- BLAKE2b
// 64-bit words are stored as (lo, hi) pairs in Uint32Arrays.

const B2_IV = new Uint32Array([
  0xf3bcc908, 0x6a09e667, 0x84caa73b, 0xbb67ae85, 0xfe94f82b, 0x3c6ef372, 0x5f1d36f1, 0xa54ff53a,
  0xade682d1, 0x510e527f, 0x2b3e6c1f, 0x9b05688c, 0xfb41bd6b, 0x1f83d9ab, 0x137e2179, 0x5be0cd19,
])
const SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4], [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13], [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11], [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5], [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
]

/** v[a] += v[b] (+ m[x]) in place, 64-bit. */
function add64(v: Uint32Array, a: number, b: number) {
  const lo = v[2 * a] + v[2 * b]
  v[2 * a + 1] = v[2 * a + 1] + v[2 * b + 1] + (lo > 0xffffffff ? 1 : 0)
  v[2 * a] = lo
}
function addM(v: Uint32Array, a: number, m: Uint32Array, x: number) {
  const lo = v[2 * a] + m[2 * x]
  v[2 * a + 1] = v[2 * a + 1] + m[2 * x + 1] + (lo > 0xffffffff ? 1 : 0)
  v[2 * a] = lo
}
/** v[d] = rotr64(v[d] ^ v[a], n) for n in {16, 24, 32, 63}. */
function xorRot(v: Uint32Array, d: number, a: number, n: number) {
  const lo = v[2 * d] ^ v[2 * a], hi = v[2 * d + 1] ^ v[2 * a + 1]
  if (n === 32) {
    v[2 * d] = hi
    v[2 * d + 1] = lo
  } else if (n === 63) {
    v[2 * d] = (lo << 1) | (hi >>> 31)
    v[2 * d + 1] = (hi << 1) | (lo >>> 31)
  } else {
    v[2 * d] = (lo >>> n) | (hi << (32 - n))
    v[2 * d + 1] = (hi >>> n) | (lo << (32 - n))
  }
}

function b2G(v: Uint32Array, m: Uint32Array, a: number, b: number, c: number, d: number, x: number, y: number) {
  add64(v, a, b); addM(v, a, m, x); xorRot(v, d, a, 32)
  add64(v, c, d); xorRot(v, b, c, 24)
  add64(v, a, b); addM(v, a, m, y); xorRot(v, d, a, 16)
  add64(v, c, d); xorRot(v, b, c, 63)
}

function b2Compress(h: Uint32Array, block: Uint8Array, t: number, last: boolean) {
  const v = new Uint32Array(32)
  const m = new Uint32Array(32)
  v.set(h)
  v.set(B2_IV, 16)
  v[24] ^= t >>> 0
  v[25] ^= Math.floor(t / 4294967296)
  if (last) {
    v[28] = ~v[28]
    v[29] = ~v[29]
  }
  for (let i = 0; i < 32; i++) m[i] = block[4 * i] | (block[4 * i + 1] << 8) | (block[4 * i + 2] << 16) | (block[4 * i + 3] << 24)
  for (let r = 0; r < 12; r++) {
    const s = SIGMA[r % 10]
    b2G(v, m, 0, 4, 8, 12, s[0], s[1])
    b2G(v, m, 1, 5, 9, 13, s[2], s[3])
    b2G(v, m, 2, 6, 10, 14, s[4], s[5])
    b2G(v, m, 3, 7, 11, 15, s[6], s[7])
    b2G(v, m, 0, 5, 10, 15, s[8], s[9])
    b2G(v, m, 1, 6, 11, 12, s[10], s[11])
    b2G(v, m, 2, 7, 8, 13, s[12], s[13])
    b2G(v, m, 3, 4, 9, 14, s[14], s[15])
  }
  for (let i = 0; i < 16; i++) h[i] ^= v[i] ^ v[i + 16]
}

/** BLAKE2b with digest length 1–64 bytes and optional key (≤ 64 bytes). */
export function blake2b(input: Uint8Array, outLen = 64, key: Uint8Array = new Uint8Array(0)): Uint8Array {
  const h = new Uint32Array(B2_IV)
  h[0] ^= 0x01010000 ^ (key.length << 8) ^ outLen
  const data = key.length ? concat(key, new Uint8Array(128 - key.length), input) : input
  let t = 0
  const blocks = Math.max(1, Math.ceil(data.length / 128))
  const buf = new Uint8Array(128)
  for (let i = 0; i < blocks; i++) {
    const last = i === blocks - 1
    const chunk = data.subarray(i * 128, i * 128 + 128)
    buf.fill(0)
    buf.set(chunk)
    t += chunk.length
    b2Compress(h, buf, t, last)
  }
  const out = new Uint8Array(outLen)
  for (let i = 0; i < outLen; i++) out[i] = h[i >> 2] >>> (8 * (i & 3))
  return out
}

// ---------------------------------------------------------------- Argon2

export type Argon2Type = 'argon2d' | 'argon2i' | 'argon2id'
const TYPE_ID: Record<Argon2Type, number> = { argon2d: 0, argon2i: 1, argon2id: 2 }

/** Variable-length hash H′ (RFC 9106 §3.3). */
export function hPrime(x: Uint8Array, T: number): Uint8Array {
  const xx = concat(le32(T), x)
  if (T <= 64) return blake2b(xx, T)
  const r = Math.ceil(T / 32) - 2
  const out = new Uint8Array(T)
  let v = blake2b(xx, 64)
  out.set(v.subarray(0, 32), 0)
  for (let i = 1; i < r; i++) {
    v = blake2b(v, 64)
    out.set(v.subarray(0, 32), i * 32)
  }
  out.set(blake2b(v, T - 32 * r), r * 32)
  return out
}

/** High 32 bits of the exact 64-bit product of two u32 values. */
function mulHi(x: number, y: number): number {
  const xl = x & 0xffff, xh = x >>> 16, yl = y & 0xffff, yh = y >>> 16
  const ll = xl * yl, lh = xl * yh, hl = xh * yl, hh = xh * yh
  const mid = (ll >>> 16) + (lh & 0xffff) + (hl & 0xffff)
  return (hh + (lh >>> 16) + (hl >>> 16) + Math.floor(mid / 65536)) >>> 0
}

/** fBlaMka: a = a + b + 2·lo32(a)·lo32(b) on 64-bit (lo, hi) words inside one Uint32Array. */
function fBla(v: Uint32Array, a: number, b: number) {
  const x = v[a], y = v[b]
  // 32×32 → 64 multiplication via 16-bit halves
  const xl = x & 0xffff, xh = x >>> 16, yl = y & 0xffff, yh = y >>> 16
  const ll = xl * yl, lh = xl * yh, hl = xh * yl, hh = xh * yh
  const mid = (ll >>> 16) + (lh & 0xffff) + (hl & 0xffff)
  let pLo = ((mid << 16) | (ll & 0xffff)) >>> 0
  let pHi = (hh + (lh >>> 16) + (hl >>> 16) + Math.floor(mid / 65536)) >>> 0
  pHi = ((pHi << 1) | (pLo >>> 31)) >>> 0
  pLo = (pLo << 1) >>> 0
  const lo = v[a] + v[b] + pLo
  v[a + 1] = v[a + 1] + v[b + 1] + pHi + Math.floor(lo / 4294967296)
  v[a] = lo
}
function rot(v: Uint32Array, d: number, a: number, n: number) {
  const lo = v[d] ^ v[a], hi = v[d + 1] ^ v[a + 1]
  if (n === 32) { v[d] = hi; v[d + 1] = lo }
  else if (n === 63) { v[d] = (lo << 1) | (hi >>> 31); v[d + 1] = (hi << 1) | (lo >>> 31) }
  else { v[d] = (lo >>> n) | (hi << (32 - n)); v[d + 1] = (hi >>> n) | (lo << (32 - n)) }
}
/** GB on u32 offsets a, b, c, d (each the lo index of a 64-bit word). */
function GB(v: Uint32Array, a: number, b: number, c: number, d: number) {
  fBla(v, a, b); rot(v, d, a, 32)
  fBla(v, c, d); rot(v, b, c, 24)
  fBla(v, a, b); rot(v, d, a, 16)
  fBla(v, c, d); rot(v, b, c, 63)
}
/** Permutation P over 16 words given by their u32 offsets. */
function P16(v: Uint32Array, o: number[]) {
  GB(v, o[0], o[4], o[8], o[12]); GB(v, o[1], o[5], o[9], o[13]); GB(v, o[2], o[6], o[10], o[14]); GB(v, o[3], o[7], o[11], o[15])
  GB(v, o[0], o[5], o[10], o[15]); GB(v, o[1], o[6], o[11], o[12]); GB(v, o[2], o[7], o[8], o[13]); GB(v, o[3], o[4], o[9], o[14])
}
const ROW_OFF = Array.from({ length: 8 }, (_, i) => Array.from({ length: 16 }, (_, k) => 2 * (16 * i + k)))
const COL_OFF = Array.from({ length: 8 }, (_, j) => Array.from({ length: 16 }, (_, k) => 2 * (16 * (k >> 1) + 2 * j + (k & 1))))

const R = new Uint32Array(256), Q = new Uint32Array(256)
/** out = G(X, Y) (xor into out when `xor`). Blocks are 256-u32 views. */
function compress(out: Uint32Array, X: Uint32Array, Y: Uint32Array, xor: boolean) {
  for (let i = 0; i < 256; i++) R[i] = X[i] ^ Y[i]
  Q.set(R)
  for (let i = 0; i < 8; i++) P16(Q, ROW_OFF[i])
  for (let j = 0; j < 8; j++) P16(Q, COL_OFF[j])
  if (xor) for (let i = 0; i < 256; i++) out[i] ^= Q[i] ^ R[i]
  else for (let i = 0; i < 256; i++) out[i] = Q[i] ^ R[i]
}

export interface Argon2Params { type: Argon2Type; password: Uint8Array; salt: Uint8Array; t: number; m: number; p: number; tagLen: number; secret?: Uint8Array; ad?: Uint8Array }

export function argon2(o: Argon2Params): Uint8Array {
  const { t, p, tagLen } = o
  if (p < 1 || p > 255 || t < 1 || o.m < 8 * p || o.salt.length < 8 || tagLen < 4) throw new Error('Invalid Argon2 parameters (salt ≥ 8 bytes, m ≥ 8·p KiB, t ≥ 1)')
  const K = o.secret ?? new Uint8Array(0), X = o.ad ?? new Uint8Array(0)
  const y = TYPE_ID[o.type]
  const H0 = blake2b(concat(le32(p), le32(tagLen), le32(o.m), le32(t), le32(0x13), le32(y), le32(o.password.length), o.password, le32(o.salt.length), o.salt, le32(K.length), K, le32(X.length), X), 64)
  const mp = 4 * p * Math.floor(o.m / (4 * p))
  const q = mp / p, seg = q / 4
  const mem = new Uint32Array(mp * 256)
  const blk = (lane: number, col: number) => mem.subarray((lane * q + col) * 256, (lane * q + col + 1) * 256)
  const bytesToBlock = (b: Uint8Array, dst: Uint32Array) => { for (let i = 0; i < 256; i++) dst[i] = b[4 * i] | (b[4 * i + 1] << 8) | (b[4 * i + 2] << 16) | (b[4 * i + 3] << 24) }
  for (let l = 0; l < p; l++) {
    bytesToBlock(hPrime(concat(H0, le32(0), le32(l)), 1024), blk(l, 0))
    bytesToBlock(hPrime(concat(H0, le32(1), le32(l)), 1024), blk(l, 1))
  }
  const zero = new Uint32Array(256), input = new Uint32Array(256), addr = new Uint32Array(256), tmp = new Uint32Array(256)
  for (let pass = 0; pass < t; pass++) {
    for (let slice = 0; slice < 4; slice++) {
      for (let lane = 0; lane < p; lane++) {
        const indep = o.type === 'argon2i' || (o.type === 'argon2id' && pass === 0 && slice < 2)
        if (indep) {
          input.fill(0)
          input[0] = pass; input[2] = lane; input[4] = slice; input[6] = mp; input[8] = t; input[10] = y
        }
        const start = pass === 0 && slice === 0 ? 2 : 0
        const nextAddr = () => {
          input[12]++
          compress(tmp, zero, input, false)
          compress(addr, zero, tmp, false)
        }
        if (indep && start === 2) nextAddr()
        for (let idx = start; idx < seg; idx++) {
          const col = slice * seg + idx
          const prevCol = col === 0 ? q - 1 : col - 1
          const prev = blk(lane, prevCol)
          let J1: number, J2: number
          if (indep) {
            if (idx % 128 === 0 && !(start === 2 && idx === 2)) nextAddr()
            J1 = addr[2 * (idx % 128)]
            J2 = addr[2 * (idx % 128) + 1]
          } else {
            J1 = prev[0]
            J2 = prev[1]
          }
          let refLane = J2 % p
          if (pass === 0 && slice === 0) refLane = lane
          const same = refLane === lane
          let area: number
          if (pass === 0) area = same ? slice * seg + idx - 1 : slice * seg - (idx === 0 ? 1 : 0)
          else area = same ? q - seg + idx - 1 : q - seg - (idx === 0 ? 1 : 0)
          // map J1 to a position, biased towards recent blocks
          const x = mulHi(J1, J1)
          const yy = mulHi(area, x)
          const rel = area - 1 - yy
          const startPos = pass === 0 || slice === 3 ? 0 : (slice + 1) * seg
          const refCol = (startPos + rel) % q
          compress(blk(lane, col), prev, blk(refLane, refCol), pass > 0)
        }
      }
    }
  }
  const C = new Uint32Array(blk(0, q - 1))
  for (let l = 1; l < p; l++) {
    const b = blk(l, q - 1)
    for (let i = 0; i < 256; i++) C[i] ^= b[i]
  }
  const cb = new Uint8Array(1024)
  for (let i = 0; i < 256; i++) {
    cb[4 * i] = C[i]; cb[4 * i + 1] = C[i] >>> 8; cb[4 * i + 2] = C[i] >>> 16; cb[4 * i + 3] = C[i] >>> 24
  }
  return hPrime(cb, tagLen)
}

// ---------------------------------------------------------------- bcrypt

let PI_WORDS: Uint32Array | null = null
/** First 1042 32-bit words of π's fractional hex expansion (Blowfish's P-array and S-boxes), via Machin's formula. */
export function piWords(): Uint32Array {
  if (PI_WORDS) return PI_WORDS
  const words = 18 + 1024
  const bits = BigInt(32 * words + 64)
  const one = 1n << bits
  const atanInv = (x: bigint) => {
    const x2 = x * x
    let term = one / x, sum = term, k = 1n, sign = -1n
    while (term !== 0n) {
      term /= x2
      sum += (sign * term) / (2n * k + 1n)
      sign = -sign
      k++
    }
    return sum
  }
  const pi = 16n * atanInv(5n) - 4n * atanInv(239n)
  let frac = (pi - (3n << bits)) >> 64n
  const out = new Uint32Array(words)
  for (let i = words - 1; i >= 0; i--) {
    out[i] = Number(frac & 0xffffffffn)
    frac >>= 32n
  }
  PI_WORDS = out
  return out
}

const BC64 = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
export function bcryptB64Encode(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 3) {
    const c1 = b[i], c2 = b[i + 1], c3 = b[i + 2]
    s += BC64[c1 >> 2]
    s += BC64[((c1 & 3) << 4) | ((c2 ?? 0) >> 4)]
    if (c2 === undefined) break
    s += BC64[((c2 & 15) << 2) | ((c3 ?? 0) >> 6)]
    if (c3 === undefined) break
    s += BC64[c3 & 63]
  }
  return s
}
export function bcryptB64Decode(s: string, n: number): Uint8Array {
  const v = Array.from(s, (c) => BC64.indexOf(c))
  if (v.some((x) => x < 0)) throw new Error('Invalid bcrypt base64')
  const out: number[] = []
  for (let i = 0; i < v.length && out.length < n; i += 4) {
    out.push(((v[i] << 2) | (v[i + 1] >> 4)) & 255)
    if (out.length < n && i + 2 < v.length) out.push(((v[i + 1] << 4) | (v[i + 2] >> 2)) & 255)
    if (out.length < n && i + 3 < v.length) out.push(((v[i + 2] << 6) | v[i + 3]) & 255)
  }
  return new Uint8Array(out)
}

class Blowfish {
  P: Uint32Array
  S: Uint32Array
  constructor() {
    const pw = piWords()
    this.P = pw.slice(0, 18)
    this.S = pw.slice(18)
  }
  F(x: number) {
    const S = this.S
    return (((S[x >>> 24] + S[256 + ((x >>> 16) & 255)]) ^ S[512 + ((x >>> 8) & 255)]) + S[768 + (x & 255)]) >>> 0
  }
  enc(lr: Uint32Array) {
    let L = lr[0], Rr = lr[1]
    const P = this.P
    for (let i = 0; i < 16; i += 2) {
      L ^= P[i]
      Rr ^= this.F(L)
      Rr ^= P[i + 1]
      L ^= this.F(Rr)
    }
    lr[0] = Rr ^ P[17]
    lr[1] = L ^ P[16]
  }
  /** Blowfish key schedule, optionally salted (EksBlowfish ExpandKey). */
  expand(key: Uint8Array, salt?: Uint8Array) {
    let kp = 0, sp = 0
    const word = (d: Uint8Array, pos: number): [number, number] => {
      let w = 0
      for (let i = 0; i < 4; i++) {
        w = (w << 8) | d[pos]
        pos = (pos + 1) % d.length
      }
      return [w >>> 0, pos]
    }
    for (let i = 0; i < 18; i++) {
      const [w, np] = word(key, kp)
      kp = np
      this.P[i] ^= w
    }
    const lr = new Uint32Array(2)
    const fill = (arr: Uint32Array) => {
      for (let i = 0; i < arr.length; i += 2) {
        if (salt) {
          const [a, p1] = word(salt, sp)
          const [b, p2] = word(salt, p1)
          sp = p2
          lr[0] ^= a
          lr[1] ^= b
        }
        this.enc(lr)
        arr[i] = lr[0]
        arr[i + 1] = lr[1]
      }
    }
    fill(this.P)
    fill(this.S)
  }
}

/** Raw bcrypt: 23-byte digest. Password is UTF-8 + NUL, truncated to 72 bytes. */
export function bcryptRaw(password: Uint8Array, salt: Uint8Array, cost: number): Uint8Array {
  if (cost < 4 || cost > 31) throw new Error('bcrypt cost must be 4–31')
  if (salt.length !== 16) throw new Error('bcrypt salt must be 16 bytes')
  const key = concat(password, new Uint8Array([0])).slice(0, 72)
  const bf = new Blowfish()
  bf.expand(key, salt)
  const rounds = 2 ** cost
  for (let i = 0; i < rounds; i++) {
    bf.expand(key)
    bf.expand(salt)
  }
  const ctext = new Uint32Array(6)
  const magic = utf8('OrpheanBeholderScryDoubt')
  for (let i = 0; i < 6; i++) ctext[i] = ((magic[4 * i] << 24) | (magic[4 * i + 1] << 16) | (magic[4 * i + 2] << 8) | magic[4 * i + 3]) >>> 0
  const lr = new Uint32Array(2)
  for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 6; j += 2) {
      lr[0] = ctext[j]
      lr[1] = ctext[j + 1]
      bf.enc(lr)
      ctext[j] = lr[0]
      ctext[j + 1] = lr[1]
    }
  }
  const out = new Uint8Array(24)
  for (let i = 0; i < 6; i++) {
    out[4 * i] = ctext[i] >>> 24; out[4 * i + 1] = ctext[i] >>> 16; out[4 * i + 2] = ctext[i] >>> 8; out[4 * i + 3] = ctext[i]
  }
  return out.slice(0, 23)
}

export function bcryptHash(password: string, salt: Uint8Array, cost: number, variant: '2a' | '2b' | '2y' = '2b'): string {
  const raw = bcryptRaw(utf8(password), salt, cost)
  return `$${variant}$${String(cost).padStart(2, '0')}$${bcryptB64Encode(salt).slice(0, 22)}${bcryptB64Encode(raw).slice(0, 31)}`
}

export interface BcryptParsed { variant: string; cost: number; salt: Uint8Array; saltText: string; hash: string }
export function parseBcrypt(h: string): BcryptParsed | null {
  const m = /^\$(2[abxy]?)\$(\d{2})\$([./A-Za-z0-9]{22})([./A-Za-z0-9]{31})$/.exec(h.trim())
  if (!m) return null
  return { variant: m[1], cost: Number(m[2]), saltText: m[3], salt: bcryptB64Decode(m[3], 16), hash: m[4] }
}

// ---------------------------------------------------------------- SHA-256, HMAC, PBKDF2, scrypt

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

export function sha256(msg: Uint8Array): Uint8Array {
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const len = msg.length
  const padded = new Uint8Array(Math.ceil((len + 9) / 64) * 64)
  padded.set(msg)
  padded[len] = 0x80
  const bitLen = len * 8
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296))
  dv.setUint32(padded.length - 4, bitLen >>> 0)
  const W = new Uint32Array(64)
  const rr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let o = 0; o < padded.length; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + 4 * i)
    for (let i = 16; i < 64; i++) {
      const s0 = rr(W[i - 15], 7) ^ rr(W[i - 15], 18) ^ (W[i - 15] >>> 3)
      const s1 = rr(W[i - 2], 17) ^ rr(W[i - 2], 19) ^ (W[i - 2] >>> 10)
      W[i] = W[i - 16] + s0 + W[i - 7] + s1
    }
    let [a, b, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + W[i]) >>> 0
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h
  }
  const out = new Uint8Array(32)
  const ov = new DataView(out.buffer)
  H.forEach((v, i) => ov.setUint32(4 * i, v))
  return out
}

export function hmacSha256(key: Uint8Array, msg: Uint8Array): Uint8Array {
  let k = key.length > 64 ? sha256(key) : key
  k = concat(k, new Uint8Array(64 - k.length))
  const ipad = k.map((b) => b ^ 0x36), opad = k.map((b) => b ^ 0x5c)
  return sha256(concat(opad, sha256(concat(ipad, msg))))
}

/** PBKDF2-HMAC-SHA256 (synchronous; used inside scrypt and for small iteration counts). */
export function pbkdf2Sha256(pw: Uint8Array, salt: Uint8Array, iters: number, dkLen: number): Uint8Array {
  const out = new Uint8Array(dkLen)
  for (let blockI = 1, o = 0; o < dkLen; blockI++, o += 32) {
    let u = hmacSha256(pw, concat(salt, new Uint8Array([blockI >>> 24, blockI >>> 16, blockI >>> 8, blockI])))
    const t = u.slice()
    for (let i = 1; i < iters; i++) {
      u = hmacSha256(pw, u)
      for (let j = 0; j < 32; j++) t[j] ^= u[j]
    }
    out.set(t.subarray(0, Math.min(32, dkLen - o)), o)
  }
  return out
}

function salsa208(B: Uint32Array, o: number) {
  const x = B.slice(o, o + 16)
  const R = (a: number, b: number) => (a << b) | (a >>> (32 - b))
  for (let i = 0; i < 8; i += 2) {
    x[4] ^= R(x[0] + x[12], 7); x[8] ^= R(x[4] + x[0], 9); x[12] ^= R(x[8] + x[4], 13); x[0] ^= R(x[12] + x[8], 18)
    x[9] ^= R(x[5] + x[1], 7); x[13] ^= R(x[9] + x[5], 9); x[1] ^= R(x[13] + x[9], 13); x[5] ^= R(x[1] + x[13], 18)
    x[14] ^= R(x[10] + x[6], 7); x[2] ^= R(x[14] + x[10], 9); x[6] ^= R(x[2] + x[14], 13); x[10] ^= R(x[6] + x[2], 18)
    x[3] ^= R(x[15] + x[11], 7); x[7] ^= R(x[3] + x[15], 9); x[11] ^= R(x[7] + x[3], 13); x[15] ^= R(x[11] + x[7], 18)
    x[1] ^= R(x[0] + x[3], 7); x[2] ^= R(x[1] + x[0], 9); x[3] ^= R(x[2] + x[1], 13); x[0] ^= R(x[3] + x[2], 18)
    x[6] ^= R(x[5] + x[4], 7); x[7] ^= R(x[6] + x[5], 9); x[4] ^= R(x[7] + x[6], 13); x[5] ^= R(x[4] + x[7], 18)
    x[11] ^= R(x[10] + x[9], 7); x[8] ^= R(x[11] + x[10], 9); x[9] ^= R(x[8] + x[11], 13); x[10] ^= R(x[9] + x[8], 18)
    x[12] ^= R(x[15] + x[14], 7); x[13] ^= R(x[12] + x[15], 9); x[14] ^= R(x[13] + x[12], 13); x[15] ^= R(x[14] + x[13], 18)
  }
  for (let i = 0; i < 16; i++) B[o + i] += x[i]
}

function blockMix(B: Uint32Array, Y: Uint32Array, r: number) {
  const X = B.slice((2 * r - 1) * 16, 2 * r * 16)
  for (let i = 0; i < 2 * r; i++) {
    for (let j = 0; j < 16; j++) X[j] ^= B[i * 16 + j]
    salsa208(X, 0)
    Y.set(X, (i % 2 === 0 ? i / 2 : r + (i - 1) / 2) * 16)
  }
  B.set(Y)
}

export function scrypt(pw: Uint8Array, salt: Uint8Array, N: number, r: number, p: number, dkLen: number): Uint8Array {
  if (N < 2 || (N & (N - 1)) !== 0) throw new Error('scrypt N must be a power of two ≥ 2')
  const blen = 128 * r
  const B = pbkdf2Sha256(pw, salt, 1, p * blen)
  const words = 32 * r
  const X = new Uint32Array(words), Y = new Uint32Array(words), V = new Uint32Array(N * words)
  for (let k = 0; k < p; k++) {
    const dv = new DataView(B.buffer, B.byteOffset + k * blen, blen)
    for (let i = 0; i < words; i++) X[i] = dv.getUint32(4 * i, true)
    for (let i = 0; i < N; i++) {
      V.set(X, i * words)
      blockMix(X, Y, r)
    }
    for (let i = 0; i < N; i++) {
      const j = X[(2 * r - 1) * 16] & (N - 1)
      for (let w = 0; w < words; w++) X[w] ^= V[j * words + w]
      blockMix(X, Y, r)
    }
    for (let i = 0; i < words; i++) dv.setUint32(4 * i, X[i], true)
  }
  return pbkdf2Sha256(pw, B, 1, dkLen)
}

// ---------------------------------------------------------------- PHC strings

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
/** Standard base64 without padding (PHC string format). */
export function b64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0)
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    if (i + 1 < b.length) s += B64[(n >> 6) & 63]
    if (i + 2 < b.length) s += B64[n & 63]
  }
  return s
}
export function unb64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '').replace(/\./g, '+') // accept passlib's adapted base64
  const out: number[] = []
  let acc = 0, bits = 0
  for (const c of clean) {
    const v = B64.indexOf(c === '-' ? '+' : c === '_' ? '/' : c)
    if (v < 0) throw new Error('Invalid base64')
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 255)
    }
  }
  return new Uint8Array(out)
}

export interface Phc { id: string; version?: number; params: Record<string, string>; salt: Uint8Array; hash: Uint8Array }

/** Parses $id[$v=version][$k=v,…][$salt[$hash]]. */
export function parsePhc(s: string): Phc | null {
  const parts = s.trim().split('$')
  if (parts[0] !== '' || parts.length < 4) return null
  const id = parts[1]
  let i = 2, version: number | undefined
  if (/^v=\d+$/.test(parts[i])) version = Number(parts[i++].slice(2))
  const params: Record<string, string> = {}
  if (parts[i] && parts[i].includes('=')) {
    for (const kv of parts[i++].split(',')) {
      const [k, v] = kv.split('=')
      params[k] = v
    }
  } else if (/^\d+$/.test(parts[i] ?? '')) params.i = parts[i++] // passlib "$pbkdf2-sha256$29000$…"
  try {
    return { id, version, params, salt: unb64(parts[i] ?? ''), hash: unb64(parts[i + 1] ?? '') }
  } catch {
    return null
  }
}

export function encodePhc(id: string, params: Record<string, number | string>, salt: Uint8Array, hash: Uint8Array, version?: number): string {
  const ps = Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')
  return `$${id}${version !== undefined ? `$v=${version}` : ''}$${ps}$${b64(salt)}$${b64(hash)}`
}

export const argon2Phc = (o: Argon2Params, tag: Uint8Array) => encodePhc(o.type, { m: o.m, t: o.t, p: o.p }, o.salt, tag, 19)

// ---------------------------------------------------------------- high-level API

export type Alg = 'bcrypt' | 'argon2id' | 'argon2i' | 'argon2d' | 'scrypt' | 'pbkdf2-sha256' | 'pbkdf2-sha512'
export interface HashReq {
  alg: Alg; password: string; salt: Uint8Array
  cost: number; variant: '2a' | '2b' | '2y' // bcrypt
  m: number; t: number; p: number // argon2 (m in KiB)
  ln: number; r: number; sp: number // scrypt N = 2^ln
  iters: number // pbkdf2
  len: number // output bytes (argon2/scrypt/pbkdf2)
}

/** PBKDF2 through WebCrypto (fast native HMAC); falls back to the JS version for SHA-256. */
export async function pbkdf2(hash: 'SHA-256' | 'SHA-512', pw: Uint8Array, salt: Uint8Array, iters: number, len: number): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    if (hash === 'SHA-256') return pbkdf2Sha256(pw, salt, iters, len)
    throw new Error('WebCrypto is not available')
  }
  const key = await subtle.importKey('raw', pw as BufferSource, 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash, salt: salt as BufferSource, iterations: iters }, key, len * 8))
}

export async function makeHash(q: HashReq): Promise<string> {
  const pw = utf8(q.password)
  if (q.alg === 'bcrypt') return bcryptHash(q.password, q.salt, q.cost, q.variant)
  if (q.alg.startsWith('argon2')) {
    const o: Argon2Params = { type: q.alg as Argon2Type, password: pw, salt: q.salt, m: q.m, t: q.t, p: q.p, tagLen: q.len }
    return argon2Phc(o, argon2(o))
  }
  if (q.alg === 'scrypt') return encodePhc('scrypt', { ln: q.ln, r: q.r, p: q.sp }, q.salt, scrypt(pw, q.salt, 2 ** q.ln, q.r, q.sp, q.len))
  const h = q.alg === 'pbkdf2-sha256' ? 'SHA-256' : 'SHA-512'
  return encodePhc(q.alg, { i: q.iters }, q.salt, await pbkdf2(h, pw, q.salt, q.iters, q.len))
}

export interface Verified { match: boolean; alg: string; fields: [string, string][] }

/** Recomputes the hash with the parameters stored in `encoded` and compares in constant time. */
export async function verifyHash(encoded: string, password: string): Promise<Verified> {
  const s = encoded.trim()
  const bc = parseBcrypt(s)
  if (bc) {
    if (bc.variant === '2x') throw new Error('$2x$ hashes come from a buggy PHP implementation and cannot be verified reliably')
    const again = bcryptHash(password, bc.salt, bc.cost, (bc.variant === '2' ? '2a' : bc.variant) as '2a')
    return { match: equalCT(utf8(again.slice(-31)), utf8(bc.hash)), alg: `bcrypt ($${bc.variant}$)`, fields: [['cost', `${bc.cost} (2^${bc.cost} = ${(2 ** bc.cost).toLocaleString('en-US')} rounds)`], ['salt', bc.saltText], ['hash', bc.hash]] }
  }
  const p = parsePhc(s)
  if (!p) throw new Error('Unrecognised format: expected $2b$… (bcrypt) or a PHC string like $argon2id$v=19$m=…,t=…,p=…$salt$hash')
  const pw = utf8(password)
  const n = (k: string) => Number(p.params[k])
  const fields: [string, string][] = Object.entries(p.params).map(([k, v]) => [k, v])
  fields.push(['salt', `${b64(p.salt)} (${p.salt.length} bytes)`], ['hash', `${p.hash.length} bytes`])
  let got: Uint8Array
  if (p.id.startsWith('argon2')) {
    if (!['argon2d', 'argon2i', 'argon2id'].includes(p.id)) throw new Error(`Unknown Argon2 variant ${p.id}`)
    if (p.version !== undefined && p.version !== 19) throw new Error('Only Argon2 version 19 (0x13) is supported')
    got = argon2({ type: p.id as Argon2Type, password: pw, salt: p.salt, m: n('m'), t: n('t'), p: n('p'), tagLen: p.hash.length })
    fields.unshift(['version', String(p.version ?? 19)])
  } else if (p.id === 'scrypt') {
    got = scrypt(pw, p.salt, 2 ** n('ln'), n('r'), n('p'), p.hash.length)
  } else if (p.id === 'pbkdf2-sha256' || p.id === 'pbkdf2-sha512') {
    got = await pbkdf2(p.id === 'pbkdf2-sha256' ? 'SHA-256' : 'SHA-512', pw, p.salt, n('i') || n('rounds'), p.hash.length)
  } else throw new Error(`Unsupported algorithm “${p.id}”`)
  return { match: equalCT(got, p.hash), alg: p.id, fields }
}

/** Self-test against published vectors; each entry is [name, passed]. */
export function selfTest(): [string, boolean][] {
  const out: [string, boolean][] = []
  const t = (name: string, f: () => boolean) => {
    try { out.push([name, f()]) } catch { out.push([name, false]) }
  }
  t('BLAKE2b-512("abc") — RFC 7693', () => toHex(blake2b(utf8('abc'))).startsWith('ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d1'))
  const rfc = (type: Argon2Type) => toHex(argon2({ type, password: new Uint8Array(32).fill(1), salt: new Uint8Array(16).fill(2), secret: new Uint8Array(8).fill(3), ad: new Uint8Array(12).fill(4), t: 3, m: 32, p: 4, tagLen: 32 }))
  t('Argon2d — RFC 9106 §5.1', () => rfc('argon2d') === '512b391b6f1162975371d30919734294f868e3be3984f3c1a13a4db9fabe4acb')
  t('Argon2i — RFC 9106 §5.2', () => rfc('argon2i') === 'c814d9d1dc7f37aa13f0d77f2494bda1c8de6b016dd388d29952a4c4672b6ce8')
  t('Argon2id — RFC 9106 §5.3', () => rfc('argon2id') === '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659')
  for (const [pw, h] of [['U*U', '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW'], ['U*U*U', '$2a$05$XXXXXXXXXXXXXXXXXXXXXOAcXxm9kjPGEMsLznoKqmqw7tc8WCx4a'], ['', '$2a$05$CCCCCCCCCCCCCCCCCCCCC.7uG0VCzI2bS7j6ymqJi9CdcdxiRTWNy']]) {
    t(`bcrypt "${pw}" cost 5`, () => bcryptHash(pw, parseBcrypt(h)!.salt, 5, '2a') === h)
  }
  t('scrypt N=16 r=1 p=1 — RFC 7914', () => toHex(scrypt(new Uint8Array(0), new Uint8Array(0), 16, 1, 1, 64)).startsWith('77d6576238657b203b19ca42c18a0497'))
  t('PBKDF2-HMAC-SHA256 c=2 — RFC 7914 / 6070 style', () => toHex(pbkdf2Sha256(utf8('password'), utf8('salt'), 2, 32)) === 'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43')
  return out
}
