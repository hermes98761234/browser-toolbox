// Minimal ASN.1 DER codec and X.509 certificate decoder (no external PKI library),
// plus WebCrypto signature verification and an in-browser sample chain generator.

export interface Node {
  cls: number // 0 universal, 1 application, 2 context, 3 private
  tag: number
  constructed: boolean
  start: number // offset of the identifier byte
  hdr: number // header length
  len: number
  bytes: Uint8Array // whole input
  children?: Node[]
}
export const body = (n: Node) => n.bytes.subarray(n.start + n.hdr, n.start + n.hdr + n.len)
export const whole = (n: Node) => n.bytes.subarray(n.start, n.start + n.hdr + n.len)

export function parseDer(bytes: Uint8Array, start = 0, end = bytes.length, depth = 0): Node {
  if (start + 2 > end) throw new Error(`Truncated DER at offset ${start}`)
  const id = bytes[start]
  let tag = id & 0x1f, p = start + 1
  if (tag === 0x1f) {
    tag = 0
    while (p < end && bytes[p] & 0x80) tag = (tag << 7) | (bytes[p++] & 0x7f)
    tag = (tag << 7) | bytes[p++]
  }
  let len = bytes[p++]
  if (len === 0x80) throw new Error('Indefinite length is not allowed in DER')
  if (len & 0x80) {
    const n = len & 0x7f
    if (n > 4) throw new Error('Length too large')
    len = 0
    for (let i = 0; i < n; i++) len = len * 256 + bytes[p++]
  }
  const hdr = p - start
  if (p + len > end) throw new Error(`Length ${len} at offset ${start} runs past the end of the data`)
  const node: Node = { cls: id >> 6, tag, constructed: !!(id & 0x20), start, hdr, len, bytes }
  if (depth > 40) throw new Error('Nesting too deep')
  // primitive BIT/OCTET STRINGs often wrap DER (keys, extensions): children decoded on demand via `inner`
  if (node.constructed) {
    node.children = []
    let q = p
    while (q < p + len) {
      const c = parseDer(bytes, q, p + len, depth + 1)
      node.children.push(c)
      q = c.start + c.hdr + c.len
    }
  }
  return node
}

/** Tries to decode the contents of an OCTET/BIT STRING as nested DER. */
export function inner(n: Node): Node | null {
  let b = body(n)
  if (n.cls === 0 && n.tag === 3) b = b.subarray(1)
  if (b.length < 2 || ![0x30, 0x31, 0x02, 0x04, 0x03, 0x06].includes(b[0])) return null
  try {
    const c = parseDer(b)
    return c.hdr + c.len === b.length ? c : null
  } catch {
    return null
  }
}

export const hex = (b: Uint8Array, sep = ':') => [...b].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(sep)

export function oid(b: Uint8Array): string {
  const out: number[] = [Math.floor(b[0] / 40) > 2 ? 2 : Math.floor(b[0] / 40), b[0] >= 80 ? b[0] - 80 : b[0] % 40]
  let v = 0
  for (let i = 1; i < b.length; i++) {
    v = v * 128 + (b[i] & 0x7f)
    if (!(b[i] & 0x80)) { out.push(v); v = 0 }
  }
  return out.join('.')
}

export const OIDS: Record<string, string> = {
  '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.5': 'serialNumber', '2.5.4.9': 'street',
  '2.5.4.17': 'postalCode', '2.5.4.4': 'SN', '2.5.4.42': 'GN', '2.5.4.12': 'title', '2.5.4.15': 'businessCategory', '1.2.840.113549.1.9.1': 'emailAddress',
  '0.9.2342.19200300.100.1.25': 'DC', '1.3.6.1.4.1.311.60.2.1.3': 'jurisdictionC',
  '1.2.840.113549.1.1.1': 'RSA', '1.2.840.10045.2.1': 'EC', '1.3.101.112': 'Ed25519', '1.3.101.113': 'Ed448',
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption', '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption', '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
  '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption', '1.2.840.113549.1.1.10': 'RSASSA-PSS', '1.2.840.113549.1.1.4': 'md5WithRSAEncryption',
  '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256', '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384', '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
  '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521',
  '2.5.29.17': 'Subject Alternative Name', '2.5.29.19': 'Basic Constraints', '2.5.29.15': 'Key Usage', '2.5.29.37': 'Extended Key Usage',
  '2.5.29.14': 'Subject Key Identifier', '2.5.29.35': 'Authority Key Identifier', '2.5.29.31': 'CRL Distribution Points', '2.5.29.32': 'Certificate Policies',
  '1.3.6.1.5.5.7.1.1': 'Authority Information Access', '1.3.6.1.4.1.11129.2.4.2': 'Signed Certificate Timestamps', '2.5.29.30': 'Name Constraints', '1.3.6.1.5.5.7.1.24': 'TLS Feature (OCSP must-staple)',
  '1.3.6.1.5.5.7.3.1': 'TLS Web Server Authentication', '1.3.6.1.5.5.7.3.2': 'TLS Web Client Authentication', '1.3.6.1.5.5.7.3.3': 'Code Signing',
  '1.3.6.1.5.5.7.3.4': 'E-mail Protection', '1.3.6.1.5.5.7.3.8': 'Time Stamping', '1.3.6.1.5.5.7.3.9': 'OCSP Signing',
  '1.3.6.1.5.5.7.48.1': 'OCSP', '1.3.6.1.5.5.7.48.2': 'CA Issuers', '2.23.140.1.2.1': 'Domain Validated', '2.23.140.1.2.2': 'Organization Validated', '2.23.140.1.1': 'Extended Validation', '2.5.29.32.0': 'Any Policy',
}
const name = (o: string) => OIDS[o] ?? o
const KU = ['Digital Signature', 'Non Repudiation', 'Key Encipherment', 'Data Encipherment', 'Key Agreement', 'Certificate Sign', 'CRL Sign', 'Encipher Only', 'Decipher Only']

export function str(n: Node): string {
  const b = body(n)
  if (n.tag === 30) { let s = ''; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]); return s } // BMPString
  if (n.tag === 12) return new TextDecoder().decode(b)
  return String.fromCharCode(...b)
}

export function time(n: Node): Date {
  const s = str(n)
  const m = n.tag === 23 ? /^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?Z$/.exec(s) : /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?(?:\.\d+)?Z$/.exec(s)
  if (!m) throw new Error(`Bad time ${s}`)
  let y = +m[1]
  if (n.tag === 23) y += y < 50 ? 2000 : 1900
  return new Date(Date.UTC(y, +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)))
}

export type RDN = [string, string]
export function parseName(n: Node): RDN[] {
  return (n.children ?? []).flatMap((set) => (set.children ?? []).map((atv) => [name(oid(body(atv.children![0]))), str(atv.children![1])] as RDN))
}
export const dnString = (rdns: RDN[]) => rdns.map(([k, v]) => `${k}=${v}`).join(', ')

function bigBits(b: Uint8Array): number {
  let i = 0
  while (i < b.length && b[i] === 0) i++
  if (i === b.length) return 0
  return (b.length - i - 1) * 8 + (32 - Math.clz32(b[i]))
}
const toInt = (b: Uint8Array) => b.reduce((a, x) => a * 256 + x, 0)

export interface Extension { oid: string; name: string; critical: boolean; values: string[] }
export interface Cert {
  der: Uint8Array
  version: number
  serial: string
  sigAlg: string
  sigAlgOid: string
  issuer: RDN[]
  subject: RDN[]
  notBefore: Date
  notAfter: Date
  keyAlg: string
  keySize: number
  keyDetail: string
  spki: Uint8Array
  tbs: Uint8Array
  signature: Uint8Array
  extensions: Extension[]
  san: string[]
  isCA: boolean
  ski: string
  aki: string
  selfSigned: boolean
}

function generalName(g: Node): string {
  const b = body(g)
  switch (g.tag) {
    case 1: return `email:${String.fromCharCode(...b)}`
    case 2: return `DNS:${String.fromCharCode(...b)}`
    case 6: return `URI:${String.fromCharCode(...b)}`
    case 7: return b.length === 4 ? `IP:${[...b].join('.')}` : `IP:${[...Array(b.length / 2)].map((_, i) => ((b[i * 2] << 8) | b[i * 2 + 1]).toString(16)).join(':').replace(/(^|:)0(:0)+(:|$)/, '::')}`
    case 4: return `DirName:${dnString(parseName(g.children![0]))}`
    default: return `[${g.tag}] ${hex(b)}`
  }
}

function decodeExt(o: string, v: Node | null, raw: Uint8Array): string[] {
  if (!v) return [hex(raw)]
  const ch = v.children ?? []
  switch (o) {
    case '2.5.29.17': return ch.map(generalName)
    case '2.5.29.19': {
      const ca = ch[0]?.tag === 1 && body(ch[0])[0] !== 0
      const pl = ch.find((c) => c.tag === 2)
      return [`CA: ${ca ? 'TRUE' : 'FALSE'}`, ...(pl ? [`Path length: ${toInt(body(pl))}`] : [])]
    }
    case '2.5.29.15': {
      const b = body(v), unused = b[0], bits: string[] = []
      for (let i = 0; i < (b.length - 1) * 8 - unused; i++) if (b[1 + (i >> 3)] & (0x80 >> (i & 7))) bits.push(KU[i] ?? `bit ${i}`)
      return bits
    }
    case '2.5.29.37': return ch.map((c) => name(oid(body(c))))
    case '2.5.29.14': return [hex(body(v))]
    case '2.5.29.35': return ch.filter((c) => c.cls === 2).map((c) => (c.tag === 0 ? `keyid:${hex(body(c))}` : c.tag === 2 ? `serial:${hex(body(c))}` : 'issuer name'))
    case '2.5.29.31': {
      const out: string[] = []
      const walk = (n: Node) => { if (n.cls === 2 && n.tag === 6 && !n.constructed) out.push(String.fromCharCode(...body(n))); n.children?.forEach(walk) }
      walk(v)
      return out
    }
    case '1.3.6.1.5.5.7.1.1': return ch.map((ad) => `${name(oid(body(ad.children![0])))}: ${generalName(ad.children![1]).replace(/^URI:/, '')}`)
    case '2.5.29.32': return ch.map((pi) => name(oid(body(pi.children![0]))))
    case '1.3.6.1.4.1.11129.2.4.2': {
      const b = body(v)
      let n = 0, p = 2
      while (p + 2 <= b.length) { const l = (b[p] << 8) | b[p + 1]; p += 2 + l; n++ }
      return [`${n} SCT${n === 1 ? '' : 's'} embedded`]
    }
    default: return [hex(raw).slice(0, 120)]
  }
}

export function decodeCert(der: Uint8Array): Cert {
  const root = parseDer(der)
  const [tbsN, algN, sigN] = root.children ?? []
  if (!tbsN?.children || !algN || !sigN) throw new Error('Not an X.509 certificate (expected SEQUENCE of tbsCertificate, signatureAlgorithm, signature).')
  const t = [...tbsN.children]
  let version = 1
  if (t[0].cls === 2 && t[0].tag === 0) version = toInt(body(t.shift()!.children![0])) + 1
  const [serialN, , issuerN, validityN, subjectN, spkiN, ...rest] = t
  const sigAlgOid = oid(body(algN.children![0]))
  const keyAlgOid = oid(body(spkiN.children![0].children![0]))
  const keyParam = spkiN.children![0].children![1]
  const keyBits = spkiN.children![1]
  let keySize = 0, keyDetail = ''
  if (keyAlgOid === '1.2.840.113549.1.1.1') {
    const k = inner(keyBits)
    if (k?.children) { keySize = bigBits(body(k.children[0])); keyDetail = `e = ${toInt(body(k.children[1]))}` }
  } else if (keyAlgOid === '1.2.840.10045.2.1') {
    const curve = keyParam?.tag === 6 ? name(oid(body(keyParam))) : 'explicit'
    keySize = curve === 'P-256' ? 256 : curve === 'P-384' ? 384 : curve === 'P-521' ? 521 : 0
    keyDetail = curve
  } else if (keyAlgOid === '1.3.101.112') { keySize = 256; keyDetail = 'Curve25519' }
  const extensions: Extension[] = []
  const extWrap = rest.find((n) => n.cls === 2 && n.tag === 3)
  for (const e of extWrap?.children?.[0]?.children ?? []) {
    const c = e.children!
    const o = oid(body(c[0]))
    const critical = c.length === 3 && c[1].tag === 1 && body(c[1])[0] !== 0
    const octet = c[c.length - 1]
    extensions.push({ oid: o, name: name(o), critical, values: decodeExt(o, inner(octet), body(octet)) })
  }
  const issuer = parseName(issuerN), subject = parseName(subjectN)
  const ext = (o: string) => extensions.find((e) => e.oid === o)
  const ski = ext('2.5.29.14')?.values[0] ?? ''
  const aki = (ext('2.5.29.35')?.values.find((v) => v.startsWith('keyid:')) ?? '').slice(6)
  const sigBody = body(sigN)
  return {
    der, version, serial: hex(body(serialN)), sigAlg: name(sigAlgOid), sigAlgOid, issuer, subject,
    notBefore: time(validityN.children![0]), notAfter: time(validityN.children![1]),
    keyAlg: name(keyAlgOid), keySize, keyDetail, spki: whole(spkiN), tbs: whole(tbsN), signature: sigBody.subarray(1),
    extensions, san: ext('2.5.29.17')?.values ?? [], isCA: ext('2.5.29.19')?.values[0] === 'CA: TRUE', ski, aki,
    selfSigned: dnString(issuer) === dnString(subject) && (!aki || !ski || aki === ski),
  }
}

/** Finds PEM blocks; falls back to raw base64 or hex DER. */
export function readInput(text: string): { label: string; der: Uint8Array }[] {
  const out: { label: string; der: Uint8Array }[] = []
  const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g
  let m
  while ((m = re.exec(text))) out.push({ label: m[1], der: b64(m[2]) })
  if (out.length) return out
  const t = text.trim()
  if (/^[0-9a-fA-F:\s]+$/.test(t) && t.replace(/[:\s]/g, '').length % 2 === 0 && t.length > 20) return [{ label: 'HEX', der: Uint8Array.from(t.replace(/[:\s]/g, '').match(/../g)!.map((h) => parseInt(h, 16))) }]
  if (/^[A-Za-z0-9+/=\s]+$/.test(t) && t.length > 20) return [{ label: 'BASE64', der: b64(t) }]
  return []
}
export function b64(s: string): Uint8Array {
  const bin = atob(s.replace(/[^A-Za-z0-9+/=]/g, ''))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
export const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
export const toPem = (der: Uint8Array, label = 'CERTIFICATE') => `-----BEGIN ${label}-----\n${toB64(der).replace(/(.{64})/g, '$1\n').replace(/\n$/, '')}\n-----END ${label}-----`

// ---------- WebCrypto: digests and signature verification ----------

const buf = (b: Uint8Array) => b.slice().buffer as ArrayBuffer

export async function digest(alg: 'SHA-1' | 'SHA-256', b: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest(alg, buf(b))))
}

function derSigToRaw(sig: Uint8Array, size: number): Uint8Array {
  const n = parseDer(sig)
  const fix = (b: Uint8Array) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; const x = b.subarray(i); const o = new Uint8Array(size); o.set(x, size - x.length); return o }
  const out = new Uint8Array(size * 2)
  out.set(fix(body(n.children![0])), 0)
  out.set(fix(body(n.children![1])), size)
  return out
}

/** true / false, or null when the algorithm is not supported by WebCrypto here. */
export async function verify(cert: Cert, issuer: Cert): Promise<boolean | null> {
  const hash = /SHA512|sha512/.test(cert.sigAlg) ? 'SHA-512' : /SHA384|sha384/.test(cert.sigAlg) ? 'SHA-384' : /SHA256|sha256/.test(cert.sigAlg) ? 'SHA-256' : /sha1/.test(cert.sigAlg) ? 'SHA-1' : ''
  try {
    if (/RSAEncryption$/.test(cert.sigAlg) && issuer.keyAlg === 'RSA' && hash) {
      const k = await crypto.subtle.importKey('spki', buf(issuer.spki), { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['verify'])
      return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', k, buf(cert.signature), buf(cert.tbs))
    }
    if (/^ecdsa/.test(cert.sigAlg) && issuer.keyAlg === 'EC' && /^P-/.test(issuer.keyDetail)) {
      const k = await crypto.subtle.importKey('spki', buf(issuer.spki), { name: 'ECDSA', namedCurve: issuer.keyDetail }, false, ['verify'])
      const size = Math.ceil(issuer.keySize / 8)
      return await crypto.subtle.verify({ name: 'ECDSA', hash }, k, buf(derSigToRaw(cert.signature, size)), buf(cert.tbs))
    }
  } catch {
    return null
  }
  return null
}

// ---------- DER encoder for generating a sample chain ----------

const lenBytes = (n: number) => (n < 128 ? [n] : n < 256 ? [0x81, n] : n < 65536 ? [0x82, n >> 8, n & 255] : [0x83, n >> 16, (n >> 8) & 255, n & 255])
const tlv = (tag: number, content: Uint8Array) => Uint8Array.from([tag, ...lenBytes(content.length), ...content])
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length } return o }
export const E = {
  seq: (...a: Uint8Array[]) => tlv(0x30, cat(...a)),
  set: (...a: Uint8Array[]) => tlv(0x31, cat(...a)),
  int: (b: Uint8Array | number) => { let x = typeof b === 'number' ? Uint8Array.from(b === 0 ? [0] : [...Array(Math.ceil(Math.log2(b + 1) / 8))].map((_, i, arr) => (b >> (8 * (arr.length - 1 - i))) & 255)) : b; if (x[0] & 0x80) x = cat(Uint8Array.from([0]), x); return tlv(0x02, x) },
  oid: (s: string) => { const p = s.split('.').map(Number); const out = [p[0] * 40 + p[1]]; for (const v of p.slice(2)) { const enc = [v & 127]; let r = v >> 7; while (r) { enc.unshift((r & 127) | 128); r >>= 7 } out.push(...enc) } return tlv(0x06, Uint8Array.from(out)) },
  utf8: (s: string) => tlv(0x0c, new TextEncoder().encode(s)),
  printable: (s: string) => tlv(0x13, new TextEncoder().encode(s)),
  ia5ctx: (tag: number, s: string) => tlv(0x80 | tag, new TextEncoder().encode(s)),
  time: (d: Date) => { const s = d.toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z'; return d.getUTCFullYear() < 2050 ? tlv(0x17, new TextEncoder().encode(s.slice(2))) : tlv(0x18, new TextEncoder().encode(s)) },
  bits: (b: Uint8Array, unused = 0) => tlv(0x03, cat(Uint8Array.from([unused]), b)),
  octet: (b: Uint8Array) => tlv(0x04, b),
  bool: (v: boolean) => tlv(0x01, Uint8Array.from([v ? 0xff : 0])),
  ctx: (tag: number, b: Uint8Array) => tlv(0xa0 | tag, b),
  null: () => Uint8Array.from([5, 0]),
}
const nameDer = (rdns: RDN[]) => E.seq(...rdns.map(([k, v]) => E.set(E.seq(E.oid(Object.keys(OIDS).find((o) => OIDS[o] === k)!), k === 'C' ? E.printable(v) : E.utf8(v)))))
const ext = (o: string, critical: boolean, v: Uint8Array) => E.seq(E.oid(o), ...(critical ? [E.bool(true)] : []), E.octet(v))

function rawSigToDer(raw: Uint8Array): Uint8Array {
  const h = raw.length / 2
  const trim = (b: Uint8Array) => { let i = 0; while (i < b.length - 1 && b[i] === 0 && !(b[i + 1] & 0x80)) i++; return b.subarray(i) }
  return E.seq(E.int(trim(raw.subarray(0, h))), E.int(trim(raw.subarray(h))))
}

interface Spec { subject: RDN[]; days: [number, number]; ca: boolean; san?: string[]; pathLen?: number }

/** Generates a real ECDSA P-256 chain (root → intermediate → leaf) signed with WebCrypto. */
export async function makeSampleChain(expired = false): Promise<string> {
  const gen = () => crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>
  const [kr, ki, kl] = await Promise.all([gen(), gen(), gen()])
  const spkiOf = async (k: CryptoKeyPair) => new Uint8Array(await crypto.subtle.exportKey('spki', k.publicKey))
  const skiOf = async (spki: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-1', buf(body(parseDer(spki).children![1]).subarray(1)))).subarray(0, 20)
  const day = 86400000, now = Date.now()
  const issue = async (spec: Spec, key: CryptoKeyPair, issuerName: RDN[], issuerKey: CryptoKeyPair, serial: number) => {
    const spki = await spkiOf(key), ski = await skiOf(spki), aki = await skiOf(await spkiOf(issuerKey))
    const sigAlg = E.seq(E.oid('1.2.840.10045.4.3.2'))
    const exts = [
      ext('2.5.29.19', true, E.seq(...(spec.ca ? [E.bool(true), ...(spec.pathLen !== undefined ? [E.int(spec.pathLen)] : [])] : []))),
      ext('2.5.29.15', true, spec.ca ? E.bits(Uint8Array.from([0x06]), 1) : E.bits(Uint8Array.from([0x80]), 7)),
      ext('2.5.29.14', false, E.octet(ski)),
      ext('2.5.29.35', false, E.seq(tlv(0x80, aki))),
      ...(spec.ca ? [] : [ext('2.5.29.37', false, E.seq(E.oid('1.3.6.1.5.5.7.3.1'), E.oid('1.3.6.1.5.5.7.3.2')))]),
      ...(spec.san ? [ext('2.5.29.17', false, E.seq(...spec.san.map((d) => (/^\d+\.\d+\.\d+\.\d+$/.test(d) ? tlv(0x87, Uint8Array.from(d.split('.').map(Number))) : E.ia5ctx(2, d)))))] : []),
      ...(spec.ca ? [] : [ext('1.3.6.1.5.5.7.1.1', false, E.seq(E.seq(E.oid('1.3.6.1.5.5.7.48.1'), E.ia5ctx(6, 'http://ocsp.example-ca.test')), E.seq(E.oid('1.3.6.1.5.5.7.48.2'), E.ia5ctx(6, 'http://ca.example-ca.test/int.crt')))),
        ext('2.5.29.32', false, E.seq(E.seq(E.oid('2.23.140.1.2.1'))))]),
    ]
    const tbs = E.seq(E.ctx(0, E.int(2)), E.int(serial), sigAlg, nameDer(issuerName), E.seq(E.time(new Date(now + spec.days[0] * day)), E.time(new Date(now + spec.days[1] * day))), nameDer(spec.subject), spki, E.ctx(3, E.seq(...exts)))
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, issuerKey.privateKey, buf(tbs)))
    return E.seq(tbs, sigAlg, E.bits(rawSigToDer(raw)))
  }
  const rootName: RDN[] = [['C', 'US'], ['O', 'Example Trust Services'], ['CN', 'Example Root CA R1']]
  const intName: RDN[] = [['C', 'US'], ['O', 'Example Trust Services'], ['CN', 'Example TLS Issuing CA 2026']]
  const root = await issue({ subject: rootName, days: [-900, 3000], ca: true }, kr, rootName, kr, 0x1001)
  const inter = await issue({ subject: intName, days: [-400, 1400], ca: true, pathLen: 0 }, ki, rootName, kr, 0x2a17)
  const leaf = await issue({ subject: [['CN', 'www.example.com']], days: expired ? [-120, -30] : [-20, 70], ca: false, san: ['www.example.com', 'example.com', 'api.example.com', '203.0.113.10'] }, kl, intName, ki, 0x5e9a71c3)
  return [leaf, inter, root].map((d) => toPem(d)).join('\n')
}
