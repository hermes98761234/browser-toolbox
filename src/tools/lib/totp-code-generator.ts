// HOTP (RFC 4226) / TOTP (RFC 6238) with Web Crypto, Base32 (RFC 4648) and otpauth:// URIs.

export type Algo = 'SHA1' | 'SHA256' | 'SHA512'
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '')
  if (/[^A-Z2-7]/.test(clean)) throw new Error('Secret contains characters outside Base32 (A–Z, 2–7).')
  const out: number[] = []
  let bits = 0, val = 0
  for (const ch of clean) {
    val = (val << 5) | ABC.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export function base32Encode(b: Uint8Array): string {
  let out = '', bits = 0, val = 0
  for (const x of b) {
    val = (val << 8) | x
    bits += 8
    while (bits >= 5) {
      out += ABC[(val >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ABC[(val << (5 - bits)) & 31]
  return out
}

export function randomSecret(bytes = 20): string {
  const b = new Uint8Array(bytes)
  crypto.getRandomValues(b)
  return base32Encode(b)
}

const HASH: Record<Algo, string> = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }

export async function hotp(key: Uint8Array, counter: number, digits = 6, algo: Algo = 'SHA1'): Promise<string> {
  const msg = new Uint8Array(8)
  let c = counter
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 255
    c = Math.floor(c / 256)
  }
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: HASH[algo] }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg))
  const off = mac[mac.length - 1] & 15
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3]
  return String(bin % 10 ** digits).padStart(digits, '0')
}

export const counterAt = (unixSec: number, period = 30, t0 = 0) => Math.floor((unixSec - t0) / period)

export function totp(key: Uint8Array, unixSec: number, period = 30, digits = 6, algo: Algo = 'SHA1'): Promise<string> {
  return hotp(key, counterAt(unixSec, period), digits, algo)
}

/** Returns the step offset (…, -1, 0, +1, …) at which `code` matches, or null. */
export async function verify(code: string, key: Uint8Array, unixSec: number, period: number, digits: number, algo: Algo, window = 1): Promise<number | null> {
  const c = code.replace(/\s/g, '')
  const base = counterAt(unixSec, period)
  for (let d = 0; d <= window; d++)
    for (const off of d ? [-d, d] : [0]) if ((await hotp(key, base + off, digits, algo)) === c) return off
  return null
}

export interface OtpAuth { type: 'totp' | 'hotp'; issuer: string; account: string; secret: string; algo: Algo; digits: number; period: number; counter: number }

export function parseOtpauth(uri: string): OtpAuth {
  const m = /^otpauth:\/\/(totp|hotp)\/([^?]*)\??(.*)$/i.exec(uri.trim())
  if (!m) throw new Error('Not an otpauth:// URI.')
  const label = decodeURIComponent(m[2])
  const q = new URLSearchParams(m[3])
  const [li, la] = label.includes(':') ? [label.slice(0, label.indexOf(':')), label.slice(label.indexOf(':') + 1)] : ['', label]
  const secret = (q.get('secret') ?? '').toUpperCase().replace(/=+$/, '')
  if (!secret) throw new Error('The URI has no secret parameter.')
  base32Decode(secret)
  const algo = (q.get('algorithm') ?? 'SHA1').toUpperCase().replace('-', '') as Algo
  return {
    type: m[1].toLowerCase() as 'totp' | 'hotp',
    issuer: q.get('issuer') ?? li.trim(),
    account: la.trim(),
    secret,
    algo: algo in HASH ? algo : 'SHA1',
    digits: Number(q.get('digits') ?? 6) || 6,
    period: Number(q.get('period') ?? 30) || 30,
    counter: Number(q.get('counter') ?? 0) || 0,
  }
}

export function buildOtpauth(o: OtpAuth): string {
  const label = encodeURIComponent(o.issuer ? `${o.issuer}:${o.account}` : o.account).replace('%3A', ':')
  const q = new URLSearchParams({ secret: o.secret.replace(/\s/g, '').toUpperCase() })
  if (o.issuer) q.set('issuer', o.issuer)
  if (o.algo !== 'SHA1') q.set('algorithm', o.algo)
  if (o.digits !== 6) q.set('digits', String(o.digits))
  if (o.type === 'totp' && o.period !== 30) q.set('period', String(o.period))
  if (o.type === 'hotp') q.set('counter', String(o.counter))
  return `otpauth://${o.type}/${label}?${q.toString()}`
}
