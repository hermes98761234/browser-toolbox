// Key Pair Generator helpers: PEM armour, base64url, SSH wire encoding (RFC 4251 string/mpint),
// OpenSSH public keys (RFC 4253 ssh-rsa, RFC 5656 ecdsa-sha2-*, RFC 8709 ssh-ed25519),
// the unencrypted openssh-key-v1 private key container, fingerprints and JWK thumbprints (RFC 7638).

export const b64 = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}
export const b64urlDecode = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
export const b64url = (b: Uint8Array) => b64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const hex = (b: Uint8Array, sep = ':') => [...b].map((x) => x.toString(16).padStart(2, '0')).join(sep)

export const pem = (der: Uint8Array, label: string) => `-----BEGIN ${label}-----\n${b64(der).replace(/(.{64})/g, '$1\n').replace(/\n$/, '')}\n-----END ${label}-----\n`

const utf8 = (s: string) => new TextEncoder().encode(s)
export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}
export const u32 = (n: number) => Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255)
/** SSH "string": uint32 length + bytes. */
export const sshString = (b: Uint8Array | string) => {
  const x = typeof b === 'string' ? utf8(b) : b
  return concat(u32(x.length), x)
}
/** SSH "mpint" for a non-negative big-endian magnitude: strip leading zeros, add 0x00 if the top bit is set. */
export function mpint(mag: Uint8Array): Uint8Array {
  let i = 0
  while (i < mag.length && mag[i] === 0) i++
  let x = mag.subarray(i)
  if (x.length && x[0] & 0x80) x = concat(Uint8Array.of(0), x)
  return sshString(x)
}

export interface Jwk { kty: string; crv?: string; n?: string; e?: string; d?: string; p?: string; q?: string; qi?: string; x?: string; y?: string }

const CURVES: Record<string, string> = { 'P-256': 'nistp256', 'P-384': 'nistp384', 'P-521': 'nistp521' }

/** OpenSSH public key blob, or null when the key type has no SSH form (e.g. ECDH, X25519, RSA-OAEP still works as ssh-rsa). */
export function sshPublicBlob(jwk: Jwk): { type: string; blob: Uint8Array } | null {
  if (jwk.kty === 'RSA' && jwk.n && jwk.e) return { type: 'ssh-rsa', blob: concat(sshString('ssh-rsa'), mpint(b64urlDecode(jwk.e)), mpint(b64urlDecode(jwk.n))) }
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519' && jwk.x) return { type: 'ssh-ed25519', blob: concat(sshString('ssh-ed25519'), sshString(b64urlDecode(jwk.x))) }
  if (jwk.kty === 'EC' && jwk.crv && CURVES[jwk.crv] && jwk.x && jwk.y) {
    const id = CURVES[jwk.crv], type = `ecdsa-sha2-${id}`
    const Q = concat(Uint8Array.of(4), b64urlDecode(jwk.x), b64urlDecode(jwk.y))
    return { type, blob: concat(sshString(type), sshString(id), sshString(Q)) }
  }
  return null
}

export function sshPublicLine(jwk: Jwk, comment: string): string | null {
  const k = sshPublicBlob(jwk)
  return k ? `${k.type} ${b64(k.blob)}${comment ? ' ' + comment : ''}` : null
}

/**
 * Unencrypted "openssh-key-v1" private key (the format `ssh-keygen` writes by default).
 * `check` is the random 32-bit check value repeated twice in the private section.
 */
export function opensshPrivate(jwk: Jwk, comment: string, check: number): string | null {
  const pub = sshPublicBlob(jwk)
  if (!pub || !jwk.d) return null
  const d = b64urlDecode(jwk.d)
  let body: Uint8Array
  if (jwk.kty === 'RSA') {
    const [n, e, p, q, qi] = [jwk.n!, jwk.e!, jwk.p!, jwk.q!, jwk.qi!].map(b64urlDecode)
    body = concat(sshString('ssh-rsa'), mpint(n), mpint(e), mpint(d), mpint(qi), mpint(p), mpint(q))
  } else if (jwk.kty === 'OKP') {
    const x = b64urlDecode(jwk.x!)
    body = concat(sshString('ssh-ed25519'), sshString(x), sshString(concat(d, x)))
  } else {
    const id = CURVES[jwk.crv!]
    const Q = concat(Uint8Array.of(4), b64urlDecode(jwk.x!), b64urlDecode(jwk.y!))
    body = concat(sshString(`ecdsa-sha2-${id}`), sshString(id), sshString(Q), mpint(d))
  }
  let priv = concat(u32(check), u32(check), body, sshString(comment))
  const pad = (8 - (priv.length % 8)) % 8
  priv = concat(priv, Uint8Array.from({ length: pad }, (_, i) => i + 1))
  const all = concat(utf8('openssh-key-v1\0'), sshString('none'), sshString('none'), sshString(new Uint8Array(0)), u32(1), sshString(pub.blob), sshString(priv))
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${b64(all).replace(/(.{70})/g, '$1\n').replace(/\n$/, '')}\n-----END OPENSSH PRIVATE KEY-----\n`
}

const sha256 = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource))

/** OpenSSH-style fingerprint: "SHA256:" + unpadded base64 of SHA-256(blob). */
export async function sshFingerprint(blob: Uint8Array): Promise<string> {
  return 'SHA256:' + b64(await sha256(blob)).replace(/=+$/, '')
}

/** RFC 7638 JWK thumbprint (SHA-256, base64url). */
export async function jwkThumbprint(jwk: Jwk): Promise<string> {
  const req = jwk.kty === 'RSA' ? { e: jwk.e, kty: 'RSA', n: jwk.n } : jwk.kty === 'EC' ? { crv: jwk.crv, kty: 'EC', x: jwk.x, y: jwk.y } : { crv: jwk.crv, kty: 'OKP', x: jwk.x }
  return b64url(await sha256(utf8(JSON.stringify(req))))
}

export async function spkiFingerprint(spki: Uint8Array): Promise<string> {
  return hex(await sha256(spki))
}

/** Random-art style visual: deterministic colour grid from a hash (handy to compare keys at a glance). */
export function hashGrid(h: Uint8Array, n = 8): string[] {
  return Array.from({ length: n * n }, (_, i) => {
    const b = h[i % h.length], c = h[(i * 7 + 3) % h.length]
    return `hsl(${Math.round((b / 255) * 360)} ${45 + (c % 40)}% ${35 + (c % 30)}%)`
  })
}
