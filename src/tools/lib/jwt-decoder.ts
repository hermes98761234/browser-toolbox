// JWT (JWS compact) decoding, claim explanations, time checks and WebCrypto signature verification.

export function b64urlToBytes(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '')
  if (/[^A-Za-z0-9+/=]/.test(t)) throw new Error('invalid base64url characters')
  const pad = t + '='.repeat((4 - (t.length % 4)) % 4)
  const bin = atob(pad)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
export const bytesToB64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const utf8 = (b: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(b)

export interface Decoded {
  header: Record<string, unknown> | null
  payload: Record<string, unknown> | string | null
  headerRaw: string
  payloadRaw: string
  signature: Uint8Array
  signingInput: string
  errors: string[]
}

export function decodeJwt(input: string): Decoded {
  const token = input.trim().replace(/^bearer\s+/i, '').replace(/\s+/g, '')
  const parts = token.split('.')
  const out: Decoded = { header: null, payload: null, headerRaw: '', payloadRaw: '', signature: new Uint8Array(), signingInput: parts.slice(0, 2).join('.'), errors: [] }
  if (!token) return { ...out, errors: ['Paste a token.'] }
  if (parts.length === 5) return { ...out, errors: ['This is an encrypted JWE (5 parts). Its payload cannot be read without the decryption key.'] }
  if (parts.length !== 3) return { ...out, errors: [`A JWT has 3 dot-separated parts; this has ${parts.length}.`] }
  const seg = (s: string, name: string) => {
    try {
      return utf8(b64urlToBytes(s))
    } catch (e) {
      out.errors.push(`${name}: ${(e as Error).message}`)
      return ''
    }
  }
  out.headerRaw = seg(parts[0], 'Header')
  out.payloadRaw = seg(parts[1], 'Payload')
  try {
    out.header = JSON.parse(out.headerRaw)
  } catch {
    if (out.headerRaw) out.errors.push('Header is not valid JSON.')
  }
  try {
    out.payload = JSON.parse(out.payloadRaw)
  } catch {
    out.payload = out.payloadRaw || null // JWS may carry a non-JSON payload
  }
  try {
    out.signature = b64urlToBytes(parts[2])
  } catch {
    out.errors.push('Signature is not valid base64url.')
  }
  return out
}

export const CLAIMS: Record<string, string> = {
  iss: 'Issuer: who created and signed the token', sub: 'Subject: whom the token is about (user id)', aud: 'Audience: who the token is intended for',
  exp: 'Expiration time: reject the token after this', nbf: 'Not before: reject the token before this', iat: 'Issued at: when the token was created',
  jti: 'JWT ID: unique id, used to prevent replay', name: 'Full name', given_name: 'Given name', family_name: 'Family name', email: 'Email address',
  email_verified: 'Whether the email was verified', phone_number: 'Phone number', picture: 'Profile picture URL', locale: 'Locale', zoneinfo: 'Time zone',
  scope: 'OAuth 2.0 scopes granted', scp: 'Scopes (array form)', roles: 'Roles granted to the subject', groups: 'Groups', azp: 'Authorized party: client the token was issued to',
  client_id: 'OAuth client id', sid: 'Session id', nonce: 'Nonce from the auth request (replay protection)', auth_time: 'When the user authenticated',
  acr: 'Authentication context class', amr: 'Authentication methods used', at_hash: 'Access-token hash (OIDC)', c_hash: 'Code hash (OIDC)', tid: 'Tenant id (Azure AD)', oid: 'Object id (Azure AD)',
  alg: 'Signing algorithm', typ: 'Token type', kid: 'Key id: which key signed it', cty: 'Content type', jku: 'JWK Set URL', x5u: 'X.509 URL', x5t: 'X.509 thumbprint', jwk: 'Embedded public key', crit: 'Critical extensions',
}
export const TIME_CLAIMS = ['exp', 'nbf', 'iat', 'auth_time', 'updated_at']

/** "in 2 h 5 min" / "3 days ago". */
export function relative(sec: number): string {
  const a = Math.abs(sec)
  const units: [number, string][] = [[31536000, 'y'], [86400, 'd'], [3600, 'h'], [60, 'min'], [1, 's']]
  const parts: string[] = []
  let r = Math.round(a)
  for (const [u, n] of units) {
    if (r >= u && parts.length < 2) {
      parts.push(`${Math.floor(r / u)} ${n}`)
      r %= u
    }
  }
  const t = parts.join(' ') || '0 s'
  return sec >= 0 ? `in ${t}` : `${t} ago`
}

export type TimeStatus = { state: 'valid' | 'expired' | 'early' | 'no-exp'; lifetime: number | null; remaining: number | null }

export function timeStatus(p: Record<string, unknown>, nowSec: number, leeway = 0): TimeStatus {
  const exp = typeof p.exp === 'number' ? p.exp : null
  const nbf = typeof p.nbf === 'number' ? p.nbf : null
  const iat = typeof p.iat === 'number' ? p.iat : null
  const lifetime = exp !== null && iat !== null ? exp - iat : null
  if (nbf !== null && nowSec + leeway < nbf) return { state: 'early', lifetime, remaining: exp !== null ? exp - nowSec : null }
  if (exp === null) return { state: 'no-exp', lifetime, remaining: null }
  return { state: nowSec - leeway >= exp ? 'expired' : 'valid', lifetime, remaining: exp - nowSec }
}

/** Security notes about the header/payload. */
export function warnings(h: Record<string, unknown> | null, p: unknown): string[] {
  const w: string[] = []
  const alg = String(h?.alg ?? '')
  if (/^none$/i.test(alg)) w.push('alg is "none": the token is unsigned and must never be accepted.')
  if (h?.jku || h?.x5u) w.push('Header points to a remote key URL (jku/x5u). Only trust allow-listed URLs.')
  if (h?.jwk) w.push('Header embeds its own key (jwk). Never verify a token with a key it supplies itself.')
  if (p && typeof p === 'object') {
    const o = p as Record<string, unknown>
    if (o.exp === undefined) w.push('No exp claim: the token never expires.')
    const s = JSON.stringify(o).toLowerCase()
    if (/"(password|passwd|secret|ssn|card(number)?)"/.test(s)) w.push('Payload seems to contain sensitive data. JWT payloads are only encoded, not encrypted; anyone can read them.')
  }
  return w
}

type Algo = { kind: 'hmac' | 'rsa' | 'pss' | 'ec' | 'ed'; hash?: string; curve?: string; salt?: number }
export function algInfo(alg: string): Algo | null {
  const m = /^(HS|RS|PS|ES)(256|384|512)$/.exec(alg)
  if (alg === 'EdDSA') return { kind: 'ed' }
  if (!m) return null
  const hash = `SHA-${m[2]}`
  if (m[1] === 'HS') return { kind: 'hmac', hash }
  if (m[1] === 'RS') return { kind: 'rsa', hash }
  if (m[1] === 'PS') return { kind: 'pss', hash, salt: Number(m[2]) / 8 }
  return { kind: 'ec', hash, curve: m[2] === '512' ? 'P-521' : `P-${m[2]}` }
}

function pemToDer(pem: string): Uint8Array {
  const b = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0))
}

const buf = (b: Uint8Array) => b as Uint8Array<ArrayBuffer>

/**
 * Verifies the signature with WebCrypto. For HS*, `key` is the shared secret (utf8 / base64 / base64url);
 * for RS/PS/ES/EdDSA it is a PEM public key ("BEGIN PUBLIC KEY") or a JWK JSON object.
 */
export async function verify(token: string, key: string, secretEnc: 'utf8' | 'base64' | 'base64url' = 'utf8'): Promise<boolean> {
  const d = decodeJwt(token)
  const alg = String(d.header?.alg ?? '')
  const a = algInfo(alg)
  if (!a) throw new Error(`Algorithm "${alg}" is not supported for verification.`)
  const subtle = globalThis.crypto.subtle
  const data = new TextEncoder().encode(d.signingInput)
  if (a.kind === 'hmac') {
    const raw = secretEnc === 'utf8' ? new TextEncoder().encode(key) : secretEnc === 'base64url' ? b64urlToBytes(key) : Uint8Array.from(atob(key.trim()), (c) => c.charCodeAt(0))
    const k = await subtle.importKey('raw', buf(raw), { name: 'HMAC', hash: a.hash! }, false, ['verify'])
    return subtle.verify('HMAC', k, buf(d.signature), data)
  }
  const params = a.kind === 'rsa' ? { name: 'RSASSA-PKCS1-v1_5', hash: a.hash! } : a.kind === 'pss' ? { name: 'RSA-PSS', hash: a.hash! } : a.kind === 'ec' ? { name: 'ECDSA', namedCurve: a.curve! } : { name: 'Ed25519' }
  const trimmed = key.trim()
  const k = trimmed.startsWith('{')
    ? await subtle.importKey('jwk', JSON.parse(trimmed) as JsonWebKey, params, false, ['verify'])
    : await subtle.importKey('spki', buf(pemToDer(trimmed)), params, false, ['verify'])
  const vp = a.kind === 'pss' ? { name: 'RSA-PSS', saltLength: a.salt! } : a.kind === 'ec' ? { name: 'ECDSA', hash: a.hash! } : params
  return subtle.verify(vp, k, buf(d.signature), data)
}

/** Creates an HS256/384/512 token (used for the "fresh sample" button). */
export async function signHmac(header: Record<string, unknown>, payload: Record<string, unknown>, secret: string): Promise<string> {
  const a = algInfo(String(header.alg))
  if (a?.kind !== 'hmac') throw new Error('Only HS* signing is supported')
  const enc = (o: unknown) => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)))
  const si = `${enc(header)}.${enc(payload)}`
  const k = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: a.hash! }, false, ['sign'])
  const sig = new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', k, new TextEncoder().encode(si)))
  return `${si}.${bytesToB64url(sig)}`
}
