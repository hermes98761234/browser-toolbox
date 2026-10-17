// Password-based file encryption: PBKDF2-SHA256 → AES-256-GCM, self-describing container.
//
// Layout (all integers big-endian):
//   0  magic "BTENC" (5)      5  version = 1 (1)      6  kdf id: 1 = PBKDF2-SHA256 (1)
//   7  iterations (4)        11  salt length S (1)   12  salt (S)   12+S  iv (12)
//   …  ciphertext + 16-byte GCM tag. The header bytes are authenticated as additional data.
// Plaintext = [meta length (4)][meta JSON (name, type, size, created)][file bytes].

export const MAGIC = 'BTENC'
export interface Meta { name: string; type: string; size: number; created: string }
export interface Header { version: number; kdf: string; iterations: number; salt: Uint8Array; iv: Uint8Array; headerLen: number }

const enc = new TextEncoder()
const dec = new TextDecoder()

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encrypt(data: Uint8Array, meta: Meta, password: string, iterations = 600000): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const header = new Uint8Array(12 + salt.length + iv.length)
  header.set(enc.encode(MAGIC), 0)
  header[5] = 1
  header[6] = 1
  new DataView(header.buffer).setUint32(7, iterations)
  header[11] = salt.length
  header.set(salt, 12)
  header.set(iv, 12 + salt.length)
  const m = enc.encode(JSON.stringify(meta))
  const plain = new Uint8Array(4 + m.length + data.length)
  new DataView(plain.buffer).setUint32(0, m.length)
  plain.set(m, 4)
  plain.set(data, 4 + m.length)
  const key = await deriveKey(password, salt, iterations)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, plain))
  const out = new Uint8Array(header.length + ct.length)
  out.set(header, 0)
  out.set(ct, header.length)
  return out
}

export function parseHeader(buf: Uint8Array): Header {
  if (buf.length < 12 + 12 + 16 || dec.decode(buf.subarray(0, 5)) !== MAGIC) throw new Error('Not a BTENC file (missing magic bytes).')
  if (buf[5] !== 1) throw new Error(`Unsupported container version ${buf[5]}.`)
  if (buf[6] !== 1) throw new Error(`Unknown key-derivation id ${buf[6]}.`)
  const iterations = new DataView(buf.buffer, buf.byteOffset).getUint32(7)
  const sl = buf[11]
  const salt = buf.slice(12, 12 + sl)
  const iv = buf.slice(12 + sl, 24 + sl)
  return { version: 1, kdf: 'PBKDF2-HMAC-SHA256', iterations, salt, iv, headerLen: 24 + sl }
}

export async function decrypt(buf: Uint8Array, password: string): Promise<{ meta: Meta; data: Uint8Array }> {
  const h = parseHeader(buf)
  const key = await deriveKey(password, h.salt, h.iterations)
  let plain: Uint8Array
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: h.iv as BufferSource, additionalData: buf.subarray(0, h.headerLen) as BufferSource }, key, buf.subarray(h.headerLen) as BufferSource))
  } catch {
    throw new Error('Wrong password, or the file was modified (authentication failed).')
  }
  const ml = new DataView(plain.buffer).getUint32(0)
  const meta = JSON.parse(dec.decode(plain.subarray(4, 4 + ml))) as Meta
  return { meta, data: plain.slice(4 + ml) }
}

export function toBase64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s.replace(/[^A-Za-z0-9+/=]/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export const armor = (b: Uint8Array) => `-----BEGIN BTENC-----\n${toBase64(b).replace(/(.{64})/g, '$1\n').trim()}\n-----END BTENC-----`
export const unarmor = (t: string) => fromBase64(t.replace(/-----(BEGIN|END) BTENC-----/g, ''))

/** Rough entropy estimate in bits (character-pool model, penalising repeats and short length). */
export function entropyBits(pw: string): number {
  if (!pw) return 0
  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/\d/.test(pw)) pool += 10
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33
  const unique = new Set(pw).size
  return Math.round(Math.log2(pool || 1) * Math.min(pw.length, unique * 1.5 + 1))
}

/** Random passphrase-like password from a 62-char alphabet (rejection sampling, no modulo bias). */
export function randomPassword(len = 20): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const out: string[] = []
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) if (b < Math.floor(256 / A.length) * A.length && out.length < len) out.push(A[b % A.length])
  }
  return out.join('').replace(/(.{5})(?=.)/g, '$1-')
}
