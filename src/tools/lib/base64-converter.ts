// Base64 encode/decode helpers (RFC 4648 standard and URL-safe alphabets), independent of btoa/atob
// so they work on arbitrary bytes and report precise errors.

const STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export interface EncodeOpts {
  urlSafe?: boolean
  pad?: boolean
  /** Insert a line break every N characters (0 = none; MIME uses 76, PEM uses 64). */
  wrap?: number
}

export function bytesToBase64(bytes: Uint8Array, o: EncodeOpts = {}): string {
  const A = o.urlSafe ? URL : STD
  const pad = o.pad ?? !o.urlSafe
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += A[n >> 18] + A[(n >> 12) & 63] + A[(n >> 6) & 63] + A[n & 63]
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i] << 16
    out += A[n >> 18] + A[(n >> 12) & 63] + (pad ? '==' : '')
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += A[n >> 18] + A[(n >> 12) & 63] + A[(n >> 6) & 63] + (pad ? '=' : '')
  }
  if (o.wrap && o.wrap > 0) out = out.match(new RegExp(`.{1,${o.wrap}}`, 'g'))?.join('\n') ?? ''
  return out
}

export type DecodeResult = { ok: true; bytes: Uint8Array; urlSafe: boolean; mime?: string } | { ok: false; error: string }

/** Decodes standard or URL-safe Base64 (auto-detected), ignoring whitespace; accepts data: URIs. */
export function base64ToBytes(input: string): DecodeResult {
  let s = input.trim()
  let mime: string | undefined
  const m = /^data:([^;,]*)(;[^,]*)?,/i.exec(s)
  if (m) {
    if (!/;base64/i.test(m[2] ?? '')) return { ok: false, error: 'This data URI is not Base64-encoded (no ;base64 flag).' }
    mime = m[1] || undefined
    s = s.slice(m[0].length)
  }
  s = s.replace(/\s+/g, '')
  const urlSafe = /[-_]/.test(s)
  if (urlSafe && /[+/]/.test(s)) return { ok: false, error: 'Mixed standard (+/) and URL-safe (-_) characters.' }
  const body = s.replace(/=+$/, '')
  if (s.length - body.length > 2) return { ok: false, error: 'Too much padding (more than two "=").' }
  const A = urlSafe ? URL : STD
  const bad = [...body].findIndex((c) => !A.includes(c))
  if (bad >= 0) return { ok: false, error: `Invalid character "${body[bad]}" at position ${bad + 1}.` }
  if (body.length % 4 === 1) return { ok: false, error: 'Invalid length: a single trailing character cannot encode a byte.' }
  if (s.length !== body.length && s.length % 4 !== 0) return { ok: false, error: 'Padding does not line up to a multiple of 4 characters.' }
  const out = new Uint8Array(Math.floor((body.length * 3) / 4))
  let buf = 0, bits = 0, j = 0
  for (const c of body) {
    buf = (buf << 6) | A.indexOf(c)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[j++] = (buf >> bits) & 255
    }
  }
  return { ok: true, bytes: out, urlSafe, mime }
}

export const textToBytes = (t: string) => new TextEncoder().encode(t)

/** UTF-8 decode; returns null when the bytes are not valid UTF-8 or look binary. */
export function bytesToText(b: Uint8Array): string | null {
  try {
    const t = new TextDecoder('utf-8', { fatal: true }).decode(b)
    let ctrl = 0
    for (const ch of t) {
      const c = ch.charCodeAt(0)
      if (c < 32 && c !== 9 && c !== 10 && c !== 13) ctrl++
    }
    return ctrl > Math.max(2, t.length * 0.02) ? null : t
  } catch {
    return null
  }
}

const SIGS: [number[], string, string][] = [
  [[0x89, 0x50, 0x4e, 0x47], 'image/png', 'png'],
  [[0xff, 0xd8, 0xff], 'image/jpeg', 'jpg'],
  [[0x47, 0x49, 0x46, 0x38], 'image/gif', 'gif'],
  [[0x42, 0x4d], 'image/bmp', 'bmp'],
  [[0x00, 0x00, 0x01, 0x00], 'image/x-icon', 'ico'],
  [[0x25, 0x50, 0x44, 0x46], 'application/pdf', 'pdf'],
  [[0x50, 0x4b, 0x03, 0x04], 'application/zip', 'zip'],
  [[0x1f, 0x8b], 'application/gzip', 'gz'],
  [[0x49, 0x44, 0x33], 'audio/mpeg', 'mp3'],
  [[0x4f, 0x67, 0x67, 0x53], 'audio/ogg', 'ogg'],
  [[0x7b], 'application/json', 'json'],
]

/** Sniffs a MIME type from magic bytes. */
export function sniffMime(b: Uint8Array): { mime: string; ext: string } | null {
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF') {
    const k = String.fromCharCode(...b.slice(8, 12))
    if (k === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
    if (k === 'WAVE') return { mime: 'audio/wav', ext: 'wav' }
  }
  const head = String.fromCharCode(...b.slice(0, 256)).trimStart()
  if (/^<svg|^<\?xml[^>]*>\s*<svg/i.test(head)) return { mime: 'image/svg+xml', ext: 'svg' }
  for (const [sig, mime, ext] of SIGS) if (sig.every((v, i) => b[i] === v)) return { mime, ext }
  return null
}

export function hexDump(b: Uint8Array, max = 256): string {
  const lines: string[] = []
  for (let o = 0; o < Math.min(b.length, max); o += 16) {
    const row = [...b.slice(o, Math.min(o + 16, max))]
    const hex = row.map((x) => x.toString(16).padStart(2, '0')).join(' ')
    const asc = row.map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('')
    lines.push(`${o.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${asc}`)
  }
  return lines.join('\n')
}
