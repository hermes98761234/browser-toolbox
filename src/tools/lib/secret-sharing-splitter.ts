// Shamir's secret sharing over GF(2^8) (AES polynomial x^8 + x^4 + x^3 + x + 1).
// Share text format: SSS1-<threshold>-<x>-<HEX payload>; payload = secret bytes + 4-byte FNV-1a tag.

const EXP = new Uint8Array(510)
const LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    // multiply by generator 3: x*2 ^ x
    let x2 = x << 1
    if (x2 & 0x100) x2 ^= 0x11b
    x = x2 ^ x
  }
  for (let i = 255; i < 510; i++) EXP[i] = EXP[i - 255]
}

export const gfAdd = (a: number, b: number) => a ^ b
export const gfMul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0)
export function gfDiv(a: number, b: number) {
  if (!b) throw new Error('Division by zero in GF(256)')
  return a ? EXP[LOG[a] + 255 - LOG[b]] : 0
}
export const gfInv = (a: number) => gfDiv(1, a)

/** Evaluate polynomial with coefficients c[0] + c[1]x + … at x (Horner). */
export function evalPoly(c: Uint8Array | number[], x: number) {
  let y = 0
  for (let i = c.length - 1; i >= 0; i--) y = gfMul(y, x) ^ c[i]
  return y
}

/** Lagrange interpolation at x = 0 for one byte position. */
export function interpolate0(xs: number[], ys: number[]) {
  let s = 0
  for (let i = 0; i < xs.length; i++) {
    let num = 1, den = 1
    for (let j = 0; j < xs.length; j++) {
      if (i === j) continue
      num = gfMul(num, xs[j])
      den = gfMul(den, xs[i] ^ xs[j])
    }
    s ^= gfMul(ys[i], gfDiv(num, den))
  }
  return s
}

export function fnv1a(b: Uint8Array) {
  let h = 0x811c9dc5
  for (const x of b) { h ^= x; h = Math.imul(h, 0x01000193) >>> 0 }
  return new Uint8Array([h >>> 24, (h >>> 16) & 255, (h >>> 8) & 255, h & 255])
}

export interface Share { k: number; x: number; data: Uint8Array }

export function split(secret: Uint8Array, n: number, k: number, rand: (len: number) => Uint8Array = (l) => crypto.getRandomValues(new Uint8Array(l))): Share[] {
  if (k < 2 || n < k || n > 255) throw new Error('Need 2 ≤ threshold ≤ shares ≤ 255')
  const tag = fnv1a(secret)
  const payload = new Uint8Array(secret.length + 4)
  payload.set(secret); payload.set(tag, secret.length)
  const shares: Share[] = Array.from({ length: n }, (_, i) => ({ k, x: i + 1, data: new Uint8Array(payload.length) }))
  const coeff = new Uint8Array(k)
  for (let b = 0; b < payload.length; b++) {
    coeff[0] = payload[b]
    coeff.set(rand(k - 1), 1)
    for (const sh of shares) sh.data[b] = evalPoly(coeff, sh.x)
  }
  return shares
}

export function combine(shares: Share[]): { secret: Uint8Array; ok: boolean } {
  const uniq = shares.filter((s, i) => shares.findIndex((t) => t.x === s.x) === i)
  if (uniq.length < 2) throw new Error('Need at least two different shares')
  const len = uniq[0].data.length
  if (uniq.some((s) => s.data.length !== len)) throw new Error('Shares have different lengths — they belong to different secrets')
  const use = uniq.slice(0, Math.max(2, uniq[0].k || uniq.length))
  const xs = use.map((s) => s.x)
  const out = new Uint8Array(len)
  for (let b = 0; b < len; b++) out[b] = interpolate0(xs, use.map((s) => s.data[b]))
  const secret = out.slice(0, len - 4)
  const tag = fnv1a(secret)
  const ok = tag.every((v, i) => v === out[len - 4 + i])
  return { secret, ok }
}

const HEX = '0123456789ABCDEF'
export const toHex = (b: Uint8Array) => Array.from(b, (x) => HEX[x >> 4] + HEX[x & 15]).join('')
export const fromHex = (h: string) => {
  const c = h.replace(/[^0-9a-f]/gi, '')
  if (c.length % 2) throw new Error('Odd number of hex digits')
  return new Uint8Array(c.match(/../g)?.map((p) => parseInt(p, 16)) ?? [])
}

export const encodeShare = (s: Share) => `SSS1-${s.k}-${s.x}-${toHex(s.data)}`
export function decodeShare(t: string): Share {
  const m = /^SSS1-(\d{1,3})-(\d{1,3})-([0-9A-F]+)$/i.exec(t.trim())
  if (!m) throw new Error('Not a share (expected SSS1-k-x-HEX)')
  const k = +m[1], x = +m[2]
  if (x < 1 || x > 255 || k < 2) throw new Error('Share index or threshold out of range')
  return { k, x, data: fromHex(m[3]) }
}
