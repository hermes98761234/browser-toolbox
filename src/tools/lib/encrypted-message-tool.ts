// Hybrid public-key messaging on WebCrypto: ECDH P-256 + HKDF + AES-KW key wrapping, AES-256-GCM
// content encryption, ECDSA P-256/SHA-256 signatures, PGP-style ASCII armor with CRC-24.
// Private keys are stored encrypted with PBKDF2-SHA256 (600k iterations) + AES-GCM.

const enc = new TextEncoder()
const dec = new TextDecoder()
const subtle = () => globalThis.crypto.subtle

export const b64 = (u: Uint8Array) => {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
export const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/\s+/g, '')), (c) => c.charCodeAt(0))
const rand = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n))
const buf = (u: Uint8Array) => u as Uint8Array<ArrayBuffer>

/** CRC-24 as used by OpenPGP armor (RFC 4880 §6.1). */
export function crc24(data: Uint8Array): number {
  let crc = 0xb704ce
  for (const byte of data) {
    crc ^= byte << 16
    for (let i = 0; i < 8; i++) {
      crc <<= 1
      if (crc & 0x1000000) crc ^= 0x1864cfb
    }
  }
  return crc & 0xffffff
}

export type ArmorType = 'PUBLIC KEY BLOCK' | 'PRIVATE KEY BLOCK' | 'MESSAGE' | 'SIGNATURE'
const ARMOR_PREFIX = 'BTX'

export function armor(type: ArmorType, data: Uint8Array, headers: Record<string, string> = {}): string {
  const body = b64(data).replace(/.{1,64}/g, '$&\n')
  const c = crc24(data)
  const crc = b64(new Uint8Array([(c >> 16) & 255, (c >> 8) & 255, c & 255]))
  const hdr = Object.entries({ Version: 'Browser Toolbox 1', ...headers }).map(([k, v]) => `${k}: ${v}`).join('\n')
  return `-----BEGIN ${ARMOR_PREFIX} ${type}-----\n${hdr}\n\n${body}=${crc}\n-----END ${ARMOR_PREFIX} ${type}-----`
}

export function dearmor(text: string): { type: ArmorType; data: Uint8Array } {
  const m = /-----BEGIN (?:BTX|PGP) ([A-Z ]+)-----\r?\n([\s\S]*?)-----END (?:BTX|PGP) \1-----/.exec(text)
  if (!m) throw new Error('No armored block found.')
  if (/BEGIN PGP/.test(text)) throw new Error('This is an OpenPGP block. This tool uses its own WebCrypto format and cannot read OpenPGP data.')
  const parts = m[2].split(/\r?\n\r?\n/)
  const body = (parts.length > 1 ? parts.slice(1).join('\n') : parts[0]).trim().split(/\r?\n/)
  const crcLine = body[body.length - 1].startsWith('=') ? body.pop()! : ''
  const data = unb64(body.join(''))
  if (crcLine) {
    const c = unb64(crcLine.slice(1))
    if (((c[0] << 16) | (c[1] << 8) | c[2]) !== crc24(data)) throw new Error('Armor checksum mismatch: the block was altered or truncated.')
  }
  return { type: m[1] as ArmorType, data }
}

// ---------------- keys ----------------

export interface PublicKey { v: 1; uid: string; created: string; enc: string; sig: string }
export interface StoredKey { pub: PublicKey; fp: string; priv?: { salt: string; iv: string; ct: string; iter: number; protected: boolean } }

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const

export async function fingerprint(pub: PublicKey): Promise<string> {
  const h = new Uint8Array(await subtle().digest('SHA-256', buf(new Uint8Array([...unb64(pub.enc), ...unb64(pub.sig), ...enc.encode(pub.uid)]))))
  return [...h.slice(0, 20)].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()
}
export const fpPretty = (fp: string) => fp.replace(/(.{4})/g, '$1 ').trim()

async function passKey(pass: string, salt: Uint8Array, iter: number) {
  const base = await subtle().importKey('raw', buf(enc.encode(pass)), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function generateKey(uid: string, pass: string, iter = 600000): Promise<StoredKey> {
  const e = await subtle().generateKey(ECDH, true, ['deriveBits'])
  const s = await subtle().generateKey(ECDSA, true, ['sign', 'verify'])
  const pub: PublicKey = {
    v: 1, uid, created: new Date().toISOString(),
    enc: b64(new Uint8Array(await subtle().exportKey('raw', e.publicKey))),
    sig: b64(new Uint8Array(await subtle().exportKey('raw', s.publicKey))),
  }
  const secret = enc.encode(JSON.stringify({ enc: await subtle().exportKey('jwk', e.privateKey), sig: await subtle().exportKey('jwk', s.privateKey) }))
  const salt = rand(16), iv = rand(12)
  const k = await passKey(pass, salt, iter)
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: buf(iv) }, k, buf(secret)))
  return { pub, fp: await fingerprint(pub), priv: { salt: b64(salt), iv: b64(iv), ct: b64(ct), iter, protected: pass !== '' } }
}

export async function unlock(k: StoredKey, pass: string): Promise<{ enc: CryptoKey; sig: CryptoKey }> {
  if (!k.priv) throw new Error('No private key for this identity.')
  const key = await passKey(pass, unb64(k.priv.salt), k.priv.iter)
  let raw: ArrayBuffer
  try {
    raw = await subtle().decrypt({ name: 'AES-GCM', iv: buf(unb64(k.priv.iv)) }, key, buf(unb64(k.priv.ct)))
  } catch {
    throw new Error('Wrong passphrase.')
  }
  const j = JSON.parse(dec.decode(raw)) as { enc: JsonWebKey; sig: JsonWebKey }
  return { enc: await subtle().importKey('jwk', j.enc, ECDH, false, ['deriveBits']), sig: await subtle().importKey('jwk', j.sig, ECDSA, false, ['sign']) }
}

export function exportPublic(k: StoredKey): string {
  return armor('PUBLIC KEY BLOCK', enc.encode(JSON.stringify(k.pub)), { Comment: `${k.pub.uid} · ${fpPretty(k.fp)}` })
}
export function exportPrivate(k: StoredKey): string {
  return armor('PRIVATE KEY BLOCK', enc.encode(JSON.stringify({ pub: k.pub, priv: k.priv })), { Comment: `${k.pub.uid} · passphrase ${k.priv?.protected ? 'protected' : 'NOT set'}` })
}
export async function importKey(text: string): Promise<StoredKey> {
  const { type, data } = dearmor(text)
  const j = JSON.parse(dec.decode(data))
  if (type === 'PUBLIC KEY BLOCK') return { pub: j as PublicKey, fp: await fingerprint(j as PublicKey) }
  if (type === 'PRIVATE KEY BLOCK') return { pub: j.pub, priv: j.priv, fp: await fingerprint(j.pub) }
  throw new Error(`Expected a key block, got ${type}.`)
}

// ---------------- messages ----------------

interface Recipient { fp: string; epk: string; wrapped: string; salt: string }
interface Envelope { v: 1; mode: 'pk' | 'pw'; recipients?: Recipient[]; salt?: string; iter?: number; iv: string; ct: string }
interface Inner { text: string; ts: string; signer?: string; signerUid?: string; sig?: string }

async function wrapKeyFor(shared: ArrayBuffer, salt: Uint8Array, usage: KeyUsage[]) {
  const ikm = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(enc.encode('btx-wrap-v1')) }, ikm, { name: 'AES-KW', length: 256 }, false, usage)
}

const sigData = (text: string, ts: string) => enc.encode(`${ts}\n${text}`)

export async function sign(text: string, signer: StoredKey, sigKey: CryptoKey, ts = new Date().toISOString()): Promise<Inner> {
  const s = new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, sigKey, buf(sigData(text, ts))))
  return { text, ts, signer: signer.fp, signerUid: signer.pub.uid, sig: b64(s) }
}

export async function verify(inner: Inner, keyring: StoredKey[]): Promise<{ status: 'none' | 'valid' | 'invalid' | 'unknown'; uid?: string; fp?: string }> {
  if (!inner.sig || !inner.signer) return { status: 'none' }
  const k = keyring.find((x) => x.fp === inner.signer)
  if (!k) return { status: 'unknown', fp: inner.signer, uid: inner.signerUid }
  const pk = await subtle().importKey('raw', buf(unb64(k.pub.sig)), ECDSA, false, ['verify'])
  const ok = await subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, pk, buf(unb64(inner.sig)), buf(sigData(inner.text, inner.ts)))
  return { status: ok ? 'valid' : 'invalid', uid: k.pub.uid, fp: k.fp }
}

export async function encrypt(text: string, opts: { to?: StoredKey[]; password?: string; signWith?: { key: StoredKey; sig: CryptoKey }; iter?: number }): Promise<string> {
  const inner: Inner = opts.signWith ? await sign(text, opts.signWith.key, opts.signWith.sig) : { text, ts: new Date().toISOString() }
  const plain = enc.encode(JSON.stringify(inner))
  const iv = rand(12)
  let env: Envelope
  if (opts.password !== undefined) {
    const salt = rand(16), iter = opts.iter ?? 600000
    const k = await passKey(opts.password, salt, iter)
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: buf(iv) }, k, buf(plain)))
    env = { v: 1, mode: 'pw', salt: b64(salt), iter, iv: b64(iv), ct: b64(ct) }
  } else {
    if (!opts.to?.length) throw new Error('Choose at least one recipient.')
    const cek = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: buf(iv) }, cek, buf(plain)))
    const recipients: Recipient[] = []
    for (const r of opts.to) {
      const eph = await subtle().generateKey(ECDH, true, ['deriveBits'])
      const rpub = await subtle().importKey('raw', buf(unb64(r.pub.enc)), ECDH, false, [])
      const shared = await subtle().deriveBits({ name: 'ECDH', public: rpub }, eph.privateKey, 256)
      const salt = rand(16)
      const kek = await wrapKeyFor(shared, salt, ['wrapKey'])
      const wrapped = new Uint8Array(await subtle().wrapKey('raw', cek, kek, 'AES-KW'))
      recipients.push({ fp: r.fp, epk: b64(new Uint8Array(await subtle().exportKey('raw', eph.publicKey))), wrapped: b64(wrapped), salt: b64(salt) })
    }
    env = { v: 1, mode: 'pk', recipients, iv: b64(iv), ct: b64(ct) }
  }
  return armor('MESSAGE', enc.encode(JSON.stringify(env)), env.mode === 'pk' ? { Recipients: String(env.recipients!.length) } : { Comment: 'password-encrypted' })
}

/** Lists recipient fingerprints (or 'password') of an armored message without decrypting. */
export function inspect(text: string): { mode: 'pk' | 'pw'; recipients: string[] } {
  const { type, data } = dearmor(text)
  if (type !== 'MESSAGE') throw new Error(`Expected a MESSAGE block, got ${type}.`)
  const env = JSON.parse(dec.decode(data)) as Envelope
  return { mode: env.mode, recipients: env.recipients?.map((r) => r.fp) ?? [] }
}

export async function decrypt(text: string, keyring: StoredKey[], pass: (k: StoredKey) => Promise<string> | string, password?: string) {
  const { type, data } = dearmor(text)
  if (type !== 'MESSAGE') throw new Error(`Expected a MESSAGE block, got ${type}.`)
  const env = JSON.parse(dec.decode(data)) as Envelope
  let plain: ArrayBuffer
  let usedKey: StoredKey | undefined
  if (env.mode === 'pw') {
    const k = await passKey(password ?? '', unb64(env.salt!), env.iter!)
    try {
      plain = await subtle().decrypt({ name: 'AES-GCM', iv: buf(unb64(env.iv)) }, k, buf(unb64(env.ct)))
    } catch {
      throw new Error('Wrong password, or the message was modified.')
    }
  } else {
    const r = env.recipients!.find((x) => keyring.some((k) => k.fp === x.fp && k.priv))
    if (!r) throw new Error('None of your private keys can open this message.')
    usedKey = keyring.find((k) => k.fp === r.fp)!
    const { enc: ek } = await unlock(usedKey, await pass(usedKey))
    const epk = await subtle().importKey('raw', buf(unb64(r.epk)), ECDH, false, [])
    const shared = await subtle().deriveBits({ name: 'ECDH', public: epk }, ek, 256)
    const kek = await wrapKeyFor(shared, unb64(r.salt), ['unwrapKey'])
    const cek = await subtle().unwrapKey('raw', buf(unb64(r.wrapped)), kek, 'AES-KW', { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
    try {
      plain = await subtle().decrypt({ name: 'AES-GCM', iv: buf(unb64(env.iv)) }, cek, buf(unb64(env.ct)))
    } catch {
      throw new Error('Integrity check failed: the message was modified.')
    }
  }
  const inner = JSON.parse(dec.decode(plain)) as Inner
  return { text: inner.text, ts: inner.ts, usedKey, signature: await verify(inner, keyring) }
}

/** Clear-signed text: the readable message followed by an armored signature. */
export async function clearsign(text: string, key: StoredKey, sigKey: CryptoKey): Promise<string> {
  const inner = await sign(text, key, sigKey)
  return `-----BEGIN BTX SIGNED MESSAGE-----\n\n${text}\n${armor('SIGNATURE', enc.encode(JSON.stringify({ ts: inner.ts, signer: inner.signer, signerUid: inner.signerUid, sig: inner.sig })))}`
}

export async function verifyClearsigned(block: string, keyring: StoredKey[]) {
  const m = /-----BEGIN BTX SIGNED MESSAGE-----\r?\n\r?\n([\s\S]*?)\r?\n(-----BEGIN BTX SIGNATURE-----[\s\S]*?-----END BTX SIGNATURE-----)/.exec(block)
  if (!m) throw new Error('No signed message block found.')
  const s = JSON.parse(dec.decode(dearmor(m[2]).data)) as Omit<Inner, 'text'>
  return { text: m[1], ts: s.ts, ...(await verify({ ...s, text: m[1] }, keyring)) }
}
