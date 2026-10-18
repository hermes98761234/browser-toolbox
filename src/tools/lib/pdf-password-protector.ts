// PDF Standard Security Handler (ISO 32000-1 §7.6.3, ISO 32000-2 §7.6.4) on top of pdf-lib objects.
// Encrypts with AES-256 (V5/R6), AES-128 (V4/R4) or RC4-128 (V2/R3); decrypts R2–R6.
// Primitives: own MD5 and RC4; SHA-2 and AES-CBC via Web Crypto.

// ---------- primitives ----------

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]
const KT = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)

export function md5(data: Uint8Array): Uint8Array {
  const n = data.length
  const len = ((n + 8) >> 6 << 6) + 64
  const buf = new Uint8Array(len)
  buf.set(data)
  buf[n] = 0x80
  const dv = new DataView(buf.buffer)
  dv.setUint32(len - 8, (n * 8) >>> 0, true)
  dv.setUint32(len - 4, Math.floor(n / 0x20000000), true)
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  const M = new Uint32Array(16)
  for (let off = 0; off < len; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true)
    let A = a0, B = b0, C = c0, D = d0
    for (let i = 0; i < 64; i++) {
      let F: number, g: number
      if (i < 16) { F = (B & C) | (~B & D); g = i }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15 }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15 }
      else { F = C ^ (B | ~D); g = (7 * i) & 15 }
      F = (F + A + KT[i] + M[g]) >>> 0
      A = D; D = C; C = B
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0
  }
  const out = new Uint8Array(16)
  const ov = new DataView(out.buffer)
  ;[a0, b0, c0, d0].forEach((v, i) => ov.setUint32(i * 4, v, true))
  return out
}

export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256)
  for (let i = 0; i < 256; i++) s[i] = i
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255
    const t = s[i]; s[i] = s[j]; s[j] = t
  }
  const out = new Uint8Array(data.length)
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 255
    j = (j + s[i]) & 255
    const t = s[i]; s[i] = s[j]; s[j] = t
    out[k] = data[k] ^ s[(s[i] + s[j]) & 255]
  }
  return out
}

export const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
export const hexOf = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i])
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n))
const ab = (b: Uint8Array) => b.slice().buffer as ArrayBuffer

export async function sha(bits: 256 | 384 | 512, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest(`SHA-${bits}`, ab(data)))
}

const keyCache = new Map<string, Promise<CryptoKey>>()
function aesKey(key: Uint8Array): Promise<CryptoKey> {
  const id = hexOf(key)
  let k = keyCache.get(id)
  if (!k) {
    if (keyCache.size > 256) keyCache.clear()
    k = crypto.subtle.importKey('raw', ab(key), 'AES-CBC', false, ['encrypt', 'decrypt'])
    keyCache.set(id, k)
  }
  return k
}

/** AES-CBC encrypt. pad=false requires data.length % 16 === 0 and drops Web Crypto's PKCS#7 block. */
export async function aesEnc(key: Uint8Array, iv: Uint8Array, data: Uint8Array, pad = true): Promise<Uint8Array> {
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: ab(iv) }, await aesKey(key), ab(data)))
  return pad ? out : out.subarray(0, data.length)
}

/** AES-CBC decrypt. pad=false: append a forged block that decrypts to valid padding, so Web Crypto accepts raw blocks. */
export async function aesDec(key: Uint8Array, iv: Uint8Array, data: Uint8Array, pad = true): Promise<Uint8Array> {
  const k = await aesKey(key)
  if (pad) return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ab(iv) }, k, ab(data)))
  const last = data.length ? data.subarray(data.length - 16) : iv
  const forged = (await aesEnc(key, last, new Uint8Array(16).fill(16), false)).subarray(0, 16)
  const out = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ab(iv) }, k, ab(cat(data, forged))))
  return out.subarray(0, data.length)
}

// ---------- permissions ----------

export const PERMS = [
  { bit: 3, key: 'print', label: 'Print' },
  { bit: 12, key: 'printHigh', label: 'Print in high quality' },
  { bit: 4, key: 'modify', label: 'Modify contents' },
  { bit: 5, key: 'copy', label: 'Copy text & graphics' },
  { bit: 6, key: 'annotate', label: 'Add comments / annotations' },
  { bit: 9, key: 'fillForms', label: 'Fill form fields' },
  { bit: 10, key: 'accessibility', label: 'Extract for accessibility' },
  { bit: 11, key: 'assemble', label: 'Assemble (insert, rotate, delete pages)' },
] as const
export type PermKey = (typeof PERMS)[number]['key']
export type Perms = Record<PermKey, boolean>

/** P value: reserved bits 7,8,13–32 set, bits 1–2 clear. */
export function permsToP(p: Perms): number {
  let v = 0xfffff0c0
  for (const d of PERMS) if (p[d.key]) v |= 1 << (d.bit - 1)
  return v | 0
}
export function pToPerms(P: number): Perms {
  const o = {} as Perms
  for (const d of PERMS) o[d.key] = ((P >>> (d.bit - 1)) & 1) === 1
  return o
}
const le32 = (P: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, P, true); return b }

// ---------- R2–R4 (RC4 / AES-128) ----------

const PAD = new Uint8Array([0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a])

/** Legacy passwords are PDFDocEncoding ≈ Latin-1; non-Latin-1 characters fall back to UTF-8 bytes. */
function legacyBytes(pw: string): Uint8Array {
  return [...pw].every((c) => c.charCodeAt(0) < 256) ? Uint8Array.from([...pw], (c) => c.charCodeAt(0)) : new TextEncoder().encode(pw)
}
function padPw(pw: string): Uint8Array {
  const out = new Uint8Array(32)
  const b = legacyBytes(pw).subarray(0, 32)
  out.set(b)
  out.set(PAD.subarray(0, 32 - b.length), b.length)
  return out
}

export interface Legacy { R: number; n: number; O: Uint8Array; P: number; id0: Uint8Array; encMeta: boolean }

/** Algorithm 2: file key from a padded 32-byte password. */
function keyFromPadded(padded: Uint8Array, e: Legacy): Uint8Array {
  let h = md5(cat(padded, e.O, le32(e.P), e.id0, e.R >= 4 && !e.encMeta ? new Uint8Array([255, 255, 255, 255]) : new Uint8Array(0)))
  if (e.R >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, e.n))
  return h.slice(0, e.n)
}
export const legacyKey = (pw: string, e: Legacy) => keyFromPadded(padPw(pw), e)
function ownerRc4Key(owner: string, R: number, n: number): Uint8Array {
  let h = md5(padPw(owner))
  if (R >= 3) for (let i = 0; i < 50; i++) h = md5(h)
  return h.slice(0, R === 2 ? 5 : n)
}
const xorKey = (k: Uint8Array, i: number) => k.map((b) => b ^ i)

/** Algorithm 3: O entry. */
export function legacyO(owner: string, user: string, R: number, n: number): Uint8Array {
  const k = ownerRc4Key(owner || user, R, n)
  let o = rc4(k, padPw(user))
  if (R >= 3) for (let i = 1; i <= 19; i++) o = rc4(xorKey(k, i), o)
  return o
}
/** Algorithms 4/5: U entry. */
export function legacyU(key: Uint8Array, e: Legacy): Uint8Array {
  if (e.R === 2) return rc4(key, PAD)
  let u = rc4(key, md5(cat(PAD, e.id0)))
  for (let i = 1; i <= 19; i++) u = rc4(xorKey(key, i), u)
  return cat(u, new Uint8Array(16))
}
/** Algorithms 6/7: returns the file key and which password matched, or null. */
export function legacyAuth(pw: string, e: Legacy, U: Uint8Array): { key: Uint8Array; as: 'user' | 'owner' } | null {
  const check = (padded: Uint8Array) => {
    const key = keyFromPadded(padded, e)
    const u = legacyU(key, e)
    return (e.R === 2 ? eq(u, U.subarray(0, 32)) : eq(u.subarray(0, 16), U.subarray(0, 16))) ? key : null
  }
  const ku = check(padPw(pw))
  if (ku) return { key: ku, as: 'user' }
  const k = ownerRc4Key(pw, e.R, e.n)
  let up: Uint8Array = e.O.slice(0, 32)
  if (e.R === 2) up = rc4(k, up)
  else for (let i = 19; i >= 0; i--) up = rc4(xorKey(k, i), up)
  const ko = check(up)
  return ko ? { key: ko, as: 'owner' } : null
}
/** Algorithm 1: per-object key. */
export function objectKey(key: Uint8Array, num: number, gen: number, aes: boolean): Uint8Array {
  const ext = cat(key, new Uint8Array([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]), aes ? new Uint8Array([0x73, 0x41, 0x6c, 0x54]) : new Uint8Array(0))
  return md5(ext).slice(0, Math.min(key.length + 5, 16))
}

// ---------- R6 (AES-256) ----------

function utf8Pw(pw: string): Uint8Array {
  return new TextEncoder().encode(pw.normalize('NFKC')).subarray(0, 127)
}

/** Algorithm 2.B (ISO 32000-2): hardened hash. */
export async function hash2B(pw: Uint8Array, salt: Uint8Array, udata: Uint8Array): Promise<Uint8Array> {
  let K = await sha(256, cat(pw, salt, udata))
  for (let round = 0; ; round++) {
    const one = cat(pw, K, udata)
    const K1 = new Uint8Array(one.length * 64)
    for (let i = 0; i < 64; i++) K1.set(one, i * one.length)
    const E = await aesEnc(K.subarray(0, 16), K.subarray(16, 32), K1, false)
    let sum = 0
    for (let i = 0; i < 16; i++) sum += E[i]
    const m = sum % 3
    K = await sha(m === 0 ? 256 : m === 1 ? 384 : 512, E)
    if (round >= 63 && E[E.length - 1] <= round - 31) break
  }
  return K.slice(0, 32)
}

export interface R6 { O: Uint8Array; U: Uint8Array; OE: Uint8Array; UE: Uint8Array; Perms: Uint8Array }
const ZERO16 = new Uint8Array(16)

/** Algorithms 8, 9 and 10. */
export async function makeR6(fileKey: Uint8Array, user: string, owner: string, P: number, encMeta: boolean): Promise<R6> {
  const up = utf8Pw(user), op = utf8Pw(owner || user)
  const uv = rand(8), uk = rand(8), ov = rand(8), ok = rand(8)
  const U = cat(await hash2B(up, uv, new Uint8Array(0)), uv, uk)
  const UE = await aesEnc(await hash2B(up, uk, new Uint8Array(0)), ZERO16, fileKey, false)
  const O = cat(await hash2B(op, ov, U), ov, ok)
  const OE = await aesEnc(await hash2B(op, ok, U), ZERO16, fileKey, false)
  const pb = cat(le32(P), new Uint8Array([255, 255, 255, 255, encMeta ? 0x54 : 0x46, 0x61, 0x64, 0x62]), rand(4))
  const Perms = await aesEnc(fileKey, ZERO16, pb, false)
  return { O, U, OE, UE, Perms }
}

/** Algorithm 2.A: returns the file key, which password matched and whether Perms validated. */
export async function r6Auth(pw: string, e: R6): Promise<{ key: Uint8Array; as: 'user' | 'owner'; permsOk: boolean; P?: number } | null> {
  const p = utf8Pw(pw)
  const U48 = e.U.subarray(0, 48)
  let key: Uint8Array | null = null, as: 'user' | 'owner' = 'owner'
  if (eq(await hash2B(p, e.O.subarray(32, 40), U48), e.O.subarray(0, 32))) {
    key = await aesDec(await hash2B(p, e.O.subarray(40, 48), U48), ZERO16, e.OE.subarray(0, 32), false)
  } else if (eq(await hash2B(p, e.U.subarray(32, 40), new Uint8Array(0)), e.U.subarray(0, 32))) {
    as = 'user'
    key = await aesDec(await hash2B(p, e.U.subarray(40, 48), new Uint8Array(0)), ZERO16, e.UE.subarray(0, 32), false)
  }
  if (!key) return null
  let permsOk = false, P: number | undefined
  if (e.Perms.length >= 16) {
    const d = await aesDec(key, ZERO16, e.Perms.subarray(0, 16), false)
    permsOk = d[9] === 0x61 && d[10] === 0x64 && d[11] === 0x62
    P = new DataView(d.buffer, d.byteOffset).getInt32(0, true)
  }
  return { key: key.slice(), as, permsOk, P }
}

// ---------- document walk ----------

type PdfLib = typeof import('pdf-lib')
type Obj = import('pdf-lib').PDFObject
type Ctx = import('pdf-lib').PDFContext

export type Method = 'AES-256' | 'AES-128' | 'RC4-128' | 'RC4-40'
export interface EncInfo {
  encrypted: boolean
  filter?: string
  V?: number
  R?: number
  method?: Method | string
  P?: number
  perms?: Perms
  encMeta?: boolean
  openWithoutPassword?: boolean
  supported: boolean
  note?: string
  pages?: number
}

type Cipher = (bytes: Uint8Array, num: number, gen: number) => Promise<Uint8Array>

function strBytes(lib: PdfLib, o: Obj | undefined): Uint8Array | null {
  if (o instanceof lib.PDFString || o instanceof lib.PDFHexString) return o.asBytes()
  return null
}

/** Rewrites every string inside `o` (dicts, arrays) with `f`. Returns the replacement for `o` itself when it is a string. */
async function mapStrings(lib: PdfLib, o: Obj, f: (b: Uint8Array) => Promise<Uint8Array>): Promise<Obj | null> {
  const b = strBytes(lib, o)
  if (b) return lib.PDFHexString.of(hexOf(await f(b)))
  if (o instanceof lib.PDFDict) {
    const isSig = o.get(lib.PDFName.of('ByteRange')) !== undefined
    for (const [k, v] of o.entries()) {
      if (isSig && k === lib.PDFName.of('Contents')) continue
      const r = await mapStrings(lib, v, f)
      if (r) o.set(k, r)
    }
  } else if (o instanceof lib.PDFArray) {
    for (let i = 0; i < o.size(); i++) {
      const r = await mapStrings(lib, o.get(i), f)
      if (r) o.set(i, r)
    }
  }
  return null
}

async function transformAll(lib: PdfLib, ctx: Ctx, opts: { str: Cipher; stm: Cipher; skip: Set<string>; encMeta: boolean; skipPlainXmp?: boolean }) {
  let strings = 0, streams = 0
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (opts.skip.has(ref.toString())) continue
    const { objectNumber: num, generationNumber: gen } = ref
    const f = async (b: Uint8Array) => { strings++; return opts.str(b, num, gen) }
    if (obj instanceof lib.PDFStream) {
      const dict = obj.dict
      const type = dict.lookup(lib.PDFName.of('Type'))
      if (type === lib.PDFName.of('XRef')) continue
      await mapStrings(lib, dict, f)
      const data = obj.getContents()
      // Metadata may be left in clear (EncryptMetadata false, or writers that skip it): never touch plain XMP.
      if (type === lib.PDFName.of('Metadata') && (!opts.encMeta || (opts.skipPlainXmp && new TextDecoder('latin1').decode(data.subarray(0, 64)).includes('<?xpacket')))) continue
      let out: Uint8Array
      try { out = await opts.stm(data, num, gen) } catch { continue }
      streams++
      ctx.assign(ref, lib.PDFRawStream.of(dict, out))
    } else {
      const r = await mapStrings(lib, obj, f)
      if (r) ctx.assign(ref, r)
    }
  }
  return { strings, streams }
}

// pdf-lib parses object streams eagerly; for encrypted files we must decrypt them before parsing.
type StreamHook = (stream: import('pdf-lib').PDFRawStream, ref: import('pdf-lib').PDFRef | undefined) => import('pdf-lib').PDFRawStream | null
async function loadWithHook(lib: PdfLib, bytes: Uint8Array, hook: StreamHook) {
  const OSP = lib.PDFObjectStreamParser as unknown as { forStream: (s: unknown, cb?: unknown) => { parseIntoContext: () => Promise<void> } }
  const PP = lib.PDFParser.prototype as unknown as { parseIndirectObjectHeader: () => import('pdf-lib').PDFRef }
  const origFor = OSP.forStream, origHead = PP.parseIndirectObjectHeader
  let last: import('pdf-lib').PDFRef | undefined
  PP.parseIndirectObjectHeader = function (this: unknown) { last = origHead.call(this); return last }
  OSP.forStream = (s, cb) => {
    const r = hook(s as import('pdf-lib').PDFRawStream, last)
    return r ? origFor(r, cb) : { parseIntoContext: async () => {} }
  }
  try {
    return await lib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  } finally {
    OSP.forStream = origFor
    PP.parseIndirectObjectHeader = origHead
  }
}

interface Handler {
  info: EncInfo
  legacy?: Legacy
  U?: Uint8Array
  r6?: R6
  strAes: boolean
  stmAes: boolean
  strNone: boolean
  stmNone: boolean
  encRef?: string
}

function readHandler(lib: PdfLib, ctx: Ctx): Handler {
  const encObj = ctx.trailerInfo.Encrypt
  const enc = encObj ? ctx.lookup(encObj) : undefined
  const info: EncInfo = { encrypted: !!enc, supported: false }
  const h: Handler = { info, strAes: false, stmAes: false, strNone: false, stmNone: false, encRef: encObj instanceof lib.PDFRef ? encObj.toString() : undefined }
  if (!(enc instanceof lib.PDFDict)) { info.supported = true; return h }
  const N = (k: string) => { const v = enc.lookup(lib.PDFName.of(k)); return v instanceof lib.PDFNumber ? v.asNumber() : undefined }
  const B = (k: string) => { const v = enc.lookup(lib.PDFName.of(k)); return v ? strBytes(lib, v) ?? new Uint8Array(0) : new Uint8Array(0) }
  const filter = enc.lookup(lib.PDFName.of('Filter'))
  info.filter = filter instanceof lib.PDFName ? filter.decodeText() : '?'
  info.V = N('V') ?? 0
  info.R = N('R') ?? 0
  info.P = N('P') ?? -1
  info.perms = pToPerms(info.P)
  const em = enc.lookup(lib.PDFName.of('EncryptMetadata'))
  info.encMeta = !(em instanceof lib.PDFBool) || em.asBoolean()
  if (info.filter !== 'Standard') { info.note = `Security handler /${info.filter} (certificate or DRM) is not supported — only password (/Standard) encryption.`; return h }
  const cfm = (name: 'StmF' | 'StrF') => {
    const sel = enc.lookup(lib.PDFName.of(name))
    const selName = sel instanceof lib.PDFName ? sel.decodeText() : 'Identity'
    if (selName === 'Identity') return 'None'
    const cf = enc.lookup(lib.PDFName.of('CF'))
    const f = cf instanceof lib.PDFDict ? cf.lookup(lib.PDFName.of(selName)) : undefined
    const m = f instanceof lib.PDFDict ? f.lookup(lib.PDFName.of('CFM')) : undefined
    return m instanceof lib.PDFName ? m.decodeText() : 'None'
  }
  const len = N('Length') ?? 40
  if (info.V === 1 || info.V === 2) {
    h.strAes = h.stmAes = false
    info.method = info.V === 1 || len <= 40 ? 'RC4-40' : `RC4-${len}`
  } else if (info.V === 4 || info.V === 5) {
    const st = cfm('StmF'), sr = cfm('StrF')
    h.stmNone = st === 'None'; h.strNone = sr === 'None'
    h.stmAes = st !== 'V2'; h.strAes = sr !== 'V2'
    info.method = st === 'AESV3' ? 'AES-256' : st === 'AESV2' ? 'AES-128' : st === 'V2' ? 'RC4-128' : st
    if (![st, sr].every((x) => ['None', 'V2', 'AESV2', 'AESV3'].includes(x))) { info.note = `Crypt filter ${st}/${sr} is not supported.`; return h }
  } else { info.note = `Encryption version V=${info.V} is not supported.`; return h }
  if (info.R! >= 5) {
    if (info.R === 5) info.note = 'R5 (deprecated Adobe extension) uses a plain SHA-256 hash; supported.'
    h.r6 = { O: B('O'), U: B('U'), OE: B('OE'), UE: B('UE'), Perms: B('Perms') }
  } else {
    const idArr = ctx.trailerInfo.ID ? ctx.lookup(ctx.trailerInfo.ID) : undefined
    const id0 = idArr instanceof lib.PDFArray && idArr.size() ? strBytes(lib, idArr.get(0)) ?? new Uint8Array(0) : new Uint8Array(0)
    h.legacy = { R: info.R!, n: info.R === 2 ? 5 : Math.min(16, Math.floor(len / 8)), O: B('O').subarray(0, 32), P: info.P!, id0, encMeta: info.encMeta }
    h.U = B('U')
  }
  info.supported = true
  return h
}

/** R5 uses plain SHA-256 instead of Algorithm 2.B. */
async function authR5(pw: string, e: R6) {
  const p = utf8Pw(pw), U48 = e.U.subarray(0, 48)
  if (eq(await sha(256, cat(p, e.O.subarray(32, 40), U48)), e.O.subarray(0, 32))) return { key: await aesDec(await sha(256, cat(p, e.O.subarray(40, 48), U48)), ZERO16, e.OE.subarray(0, 32), false), as: 'owner' as const }
  if (eq(await sha(256, cat(p, e.U.subarray(32, 40))), e.U.subarray(0, 32))) return { key: await aesDec(await sha(256, cat(p, e.U.subarray(40, 48))), ZERO16, e.UE.subarray(0, 32), false), as: 'user' as const }
  return null
}

async function authenticate(h: Handler, pw: string): Promise<{ key: Uint8Array; as: 'user' | 'owner' } | null> {
  if (h.r6) return h.info.R === 5 ? authR5(pw, h.r6) : r6Auth(pw, h.r6)
  if (h.legacy && h.U) return legacyAuth(pw, h.legacy, h.U)
  return null
}

function ciphers(h: Handler, key: Uint8Array, mode: 'enc' | 'dec'): { str: Cipher; stm: Cipher } {
  const make = (aes: boolean, none: boolean): Cipher => {
    if (none) return async (b) => b
    const v3 = !!h.r6
    return async (b, num, gen) => {
      const k = v3 ? key : objectKey(key, num, gen, aes)
      if (!aes) return rc4(k, b)
      if (mode === 'enc') { const iv = rand(16); return cat(iv, await aesEnc(k, iv, b)) }
      if (b.length < 32 || b.length % 16) return b.length === 16 || b.length === 0 ? new Uint8Array(0) : b
      return aesDec(k, b.subarray(0, 16), b.subarray(16))
    }
  }
  return { str: make(h.strAes, h.strNone), stm: make(h.stmAes, h.stmNone) }
}

export async function inspectPdf(bytes: Uint8Array): Promise<EncInfo> {
  const lib = await import('pdf-lib')
  const doc = await loadWithHook(lib, bytes, () => null)
  const h = readHandler(lib, doc.context)
  if (h.info.encrypted && h.info.supported) h.info.openWithoutPassword = !!(await authenticate(h, ''))
  try { h.info.pages = doc.getPageCount() } catch { /* page tree is fine but encrypted */ }
  return h.info
}

export interface DecryptResult { bytes: Uint8Array; as: 'user' | 'owner'; info: EncInfo; strings: number; streams: number }

export async function decryptPdf(bytes: Uint8Array, password: string): Promise<DecryptResult> {
  const lib = await import('pdf-lib')
  const first = await loadWithHook(lib, bytes, () => null)
  const h = readHandler(lib, first.context)
  if (!h.info.encrypted) throw new Error('This PDF is not encrypted.')
  if (!h.info.supported) throw new Error(h.info.note ?? 'Unsupported encryption.')
  const auth = await authenticate(h, password)
  if (!auth) throw new Error('Wrong password.')
  const { str, stm } = ciphers(h, auth.key, 'dec')
  // Second pass: decrypt object streams before pdf-lib parses them (async cipher → pre-collect).
  const pending = new Map<string, Uint8Array>()
  await loadWithHook(lib, bytes, (s, ref) => {
    if (ref) pending.set(ref.toString(), s.contents)
    return null
  })
  const plain = new Map<string, Uint8Array>()
  for (const [r, c] of pending) {
    const [n, g] = r.split(' ').map(Number)
    try { plain.set(r, await stm(c, n, g)) } catch { /* leave */ }
  }
  const inner = new Set<string>()
  const doc = await loadWithHook(lib, bytes, (s, ref) => {
    const p = ref && plain.get(ref.toString())
    if (!p) return null
    const raw = lib.PDFRawStream.of(s.dict, p)
    try {
      const txt = new TextDecoder('latin1').decode(lib.decodePDFRawStream(raw).decode())
      const n = (s.dict.lookup(lib.PDFName.of('N')) as import('pdf-lib').PDFNumber | undefined)?.asNumber() ?? 0
      const nums = txt.match(/\d+/g) ?? []
      for (let i = 0; i < n; i++) inner.add(`${nums[i * 2]} 0 R`)
    } catch { return null }
    return raw
  })
  const ctx = doc.context
  if (h.encRef) inner.add(h.encRef)
  const res = await transformAll(lib, ctx, { str, stm, skip: inner, encMeta: h.info.encMeta ?? true, skipPlainXmp: true })
  if (h.encRef) ctx.delete(ctx.trailerInfo.Encrypt as import('pdf-lib').PDFRef)
  delete ctx.trailerInfo.Encrypt
  const out = await doc.save({ useObjectStreams: true, updateFieldAppearances: false, addDefaultPage: false })
  return { bytes: out, as: auth.as, info: h.info, strings: res.strings, streams: res.streams }
}

export interface EncryptOptions { user: string; owner: string; perms: Perms; method: 'AES-256' | 'AES-128' | 'RC4-128'; encryptMetadata: boolean }
export interface EncryptResult { bytes: Uint8Array; strings: number; streams: number; P: number }

export async function encryptPdf(bytes: Uint8Array, o: EncryptOptions): Promise<EncryptResult> {
  const lib = await import('pdf-lib')
  const doc = await loadWithHook(lib, bytes, (s) => s)
  if (doc.context.trailerInfo.Encrypt) throw new Error('This PDF is already encrypted — remove the password first.')
  const ctx = doc.context
  const P = permsToP(o.perms)
  let id0: Uint8Array = new Uint8Array(0)
  const idArr = ctx.trailerInfo.ID ? ctx.lookup(ctx.trailerInfo.ID) : undefined
  if (idArr instanceof lib.PDFArray && idArr.size()) id0 = strBytes(lib, idArr.get(0)) ?? id0
  if (id0.length === 0) {
    id0 = rand(16)
    const arr = ctx.obj([lib.PDFHexString.of(hexOf(id0)), lib.PDFHexString.of(hexOf(rand(16)))])
    ctx.trailerInfo.ID = arr
  }
  const N = (v: number) => lib.PDFNumber.of(v)
  const Hex = (b: Uint8Array) => lib.PDFHexString.of(hexOf(b))
  const Name = (s: string) => lib.PDFName.of(s)
  let key: Uint8Array
  const dict = new Map<string, Obj>([['Filter', Name('Standard')]])
  const h: Handler = { info: { encrypted: true, supported: true }, strAes: o.method !== 'RC4-128', stmAes: o.method !== 'RC4-128', strNone: false, stmNone: false }
  if (o.method === 'AES-256') {
    key = rand(32)
    const r6 = await makeR6(key, o.user, o.owner, P, o.encryptMetadata)
    h.r6 = r6
    const cf = ctx.obj({ StdCF: ctx.obj({ AuthEvent: Name('DocOpen'), CFM: Name('AESV3'), Length: N(32) }) })
    for (const [k, v] of [['V', N(5)], ['R', N(6)], ['Length', N(256)], ['CF', cf], ['StmF', Name('StdCF')], ['StrF', Name('StdCF')], ['O', Hex(r6.O)], ['U', Hex(r6.U)], ['OE', Hex(r6.OE)], ['UE', Hex(r6.UE)], ['P', N(P)], ['Perms', Hex(r6.Perms)]] as const) dict.set(k, v)
  } else {
    const R = o.method === 'AES-128' ? 4 : 3
    const O = legacyO(o.owner, o.user, R, 16)
    const e: Legacy = { R, n: 16, O, P, id0, encMeta: o.encryptMetadata }
    key = legacyKey(o.user, e)
    const U = legacyU(key, e)
    for (const [k, v] of [['V', N(R === 4 ? 4 : 2)], ['R', N(R)], ['Length', N(128)], ['O', Hex(O)], ['U', Hex(U)], ['P', N(P)]] as const) dict.set(k, v)
    if (R === 4) {
      dict.set('CF', ctx.obj({ StdCF: ctx.obj({ AuthEvent: Name('DocOpen'), CFM: Name('AESV2'), Length: N(16) }) }))
      dict.set('StmF', Name('StdCF'))
      dict.set('StrF', Name('StdCF'))
    }
  }
  if (!o.encryptMetadata && o.method !== 'RC4-128') dict.set('EncryptMetadata', lib.PDFBool.False)
  const { str, stm } = ciphers(h, key, 'enc')
  const res = await transformAll(lib, ctx, { str, stm, skip: new Set(), encMeta: o.encryptMetadata || o.method === 'RC4-128' })
  const encDict = lib.PDFDict.withContext(ctx)
  for (const [k, v] of dict) encDict.set(Name(k), v)
  ctx.trailerInfo.Encrypt = ctx.register(encDict)
  if (o.method === 'AES-256' && ctx.header.toString().match(/1\.[0-6]/)) ctx.header = lib.PDFHeader.forVersion(2, 0)
  else if (o.method === 'AES-128' && ctx.header.toString().match(/1\.[0-5]/)) ctx.header = lib.PDFHeader.forVersion(1, 6)
  const out = await lib.PDFWriter.forContext(ctx, 50).serializeToBuffer()
  return { bytes: out, strings: res.strings, streams: res.streams, P }
}

/** A small multi-page sample PDF with text, metadata and an outline-like title for the demo. */
export async function samplePdf(): Promise<Uint8Array> {
  const lib = await import('pdf-lib')
  const doc = await lib.PDFDocument.create()
  doc.setTitle('Quarterly report (sample)')
  doc.setAuthor('Browser Toolbox')
  doc.setSubject('Demo document for the PDF Password Protector')
  const font = await doc.embedFont(lib.StandardFonts.Helvetica)
  const bold = await doc.embedFont(lib.StandardFonts.HelveticaBold)
  const lines = [
    ['Quarterly report — Q3', 'Revenue grew 14% quarter over quarter, driven by subscriptions.', 'Operating margin improved to 21%.'],
    ['Customers', 'Active accounts: 4,812 (+9%). Churn fell to 1.8% per month.', 'Net promoter score: 47.'],
    ['Confidential', 'Salary bands and the 2027 hiring plan are attached for the board only.', 'Do not distribute.'],
  ]
  lines.forEach(([h, ...body], i) => {
    const page = doc.addPage([595, 842])
    page.drawText(h, { x: 60, y: 760, size: 24, font: bold, color: lib.rgb(0.2, 0.25, 0.6) })
    body.forEach((t, j) => page.drawText(t, { x: 60, y: 720 - j * 22, size: 12, font }))
    page.drawText(`Page ${i + 1} of ${lines.length}`, { x: 60, y: 40, size: 9, font, color: lib.rgb(0.5, 0.5, 0.5) })
  })
  return doc.save({ useObjectStreams: false })
}
