// Lossless metadata removal for JPEG / PNG / WebP + a tiny store-only ZIP writer.

export type Fmt = 'jpeg' | 'png' | 'webp' | 'other'

export interface Block {
  kind: string // human label: "EXIF", "XMP", "IPTC", "ICC profile", "Comment", "Text", ...
  bytes: number
  detail?: string
  sensitive: boolean
}

export function detect(b: Uint8Array): Fmt {
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp'
  return 'other'
}

const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n))
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
const u32le = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

interface Seg { start: number; end: number; kind: string | null; sensitive: boolean; detail?: string }

function jpegSegs(b: Uint8Array): { segs: Seg[]; tail: number } {
  const segs: Seg[] = []
  let o = 2
  while (o + 4 <= b.length && b[o] === 0xff) {
    const m = b[o + 1]
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) {
      o += 2
      continue
    }
    if (m === 0xda || m === 0xd9) break
    const len = (b[o + 2] << 8) | b[o + 3]
    const end = Math.min(b.length, o + 2 + len)
    const id = ascii(b, o + 4, Math.min(30, len - 2))
    let kind: string | null = null
    let sensitive = true
    let detail: string | undefined
    if (m === 0xe1 && id.startsWith('Exif')) kind = 'EXIF'
    else if (m === 0xe1 && id.startsWith('http://ns.adobe.com/xap')) kind = 'XMP'
    else if (m === 0xe1) kind = 'APP1 data'
    else if (m === 0xed) kind = 'IPTC / Photoshop'
    else if (m === 0xe2 && id.startsWith('ICC_PROFILE')) {
      kind = 'ICC profile'
      sensitive = false
    } else if (m === 0xe2) kind = 'APP2 (FlashPix/MPF)'
    else if (m === 0xfe) {
      kind = 'Comment'
      detail = new TextDecoder().decode(b.subarray(o + 4, end)).slice(0, 80)
    } else if (m >= 0xe3 && m <= 0xef && m !== 0xee) kind = `APP${m - 0xe0} (vendor)`
    if (kind) segs.push({ start: o, end, kind, sensitive, detail })
    o = end
  }
  return { segs, tail: o }
}

const PNG_META: Record<string, [string, boolean]> = {
  tEXt: ['Text', true], iTXt: ['International text / XMP', true], zTXt: ['Compressed text', true], eXIf: ['EXIF', true],
  tIME: ['Modification time', true], iCCP: ['ICC profile', false], dSIG: ['Digital signature', true],
}

function pngSegs(b: Uint8Array): Seg[] {
  const segs: Seg[] = []
  let o = 8
  while (o + 12 <= b.length) {
    const len = u32be(b, o)
    const type = ascii(b, o + 4, 4)
    const end = o + 12 + len
    const m = PNG_META[type]
    if (m) {
      let detail: string | undefined
      if (type === 'tEXt' || type === 'iTXt') {
        const body = b.subarray(o + 8, o + 8 + Math.min(len, 200))
        const z = body.indexOf(0)
        detail = ascii(body, 0, z < 0 ? body.length : z)
      }
      segs.push({ start: o, end, kind: m[0], sensitive: m[1], detail })
    }
    if (type === 'IEND') break
    o = end
  }
  return segs
}

function webpSegs(b: Uint8Array): Seg[] {
  const segs: Seg[] = []
  let o = 12
  while (o + 8 <= b.length) {
    const type = ascii(b, o, 4)
    const len = u32le(b, o + 4)
    const end = o + 8 + len + (len & 1)
    if (type === 'EXIF') segs.push({ start: o, end, kind: 'EXIF', sensitive: true })
    else if (type === 'XMP ') segs.push({ start: o, end, kind: 'XMP', sensitive: true })
    else if (type === 'ICCP') segs.push({ start: o, end, kind: 'ICC profile', sensitive: false })
    o = end
  }
  return segs
}

function segsOf(b: Uint8Array): Seg[] {
  const f = detect(b)
  return f === 'jpeg' ? jpegSegs(b).segs : f === 'png' ? pngSegs(b) : f === 'webp' ? webpSegs(b) : []
}

/** Lists metadata blocks found in the file. */
export function scan(b: Uint8Array): Block[] {
  return segsOf(b).map((s) => ({ kind: s.kind!, bytes: s.end - s.start, detail: s.detail, sensitive: s.sensitive }))
}

function cut(b: Uint8Array, drop: Seg[]): Uint8Array {
  const parts: Uint8Array[] = []
  let o = 0
  for (const s of [...drop].sort((x, y) => x.start - y.start)) {
    parts.push(b.subarray(o, s.start))
    o = s.end
  }
  parts.push(b.subarray(o))
  return concat(parts)
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let k = 0
  for (const p of parts) {
    out.set(p, k)
    k += p.length
  }
  return out
}

/**
 * Removes metadata without re-encoding pixels. Returns null for unsupported formats.
 * `orientation` (1–8) re-inserts a minimal EXIF with only the Orientation tag into JPEGs.
 */
export function stripLossless(b: Uint8Array, opts: { keepIcc?: boolean; orientation?: number } = {}): Uint8Array | null {
  const f = detect(b)
  if (f === 'other') return null
  const drop = segsOf(b).filter((s) => s.sensitive || !opts.keepIcc)
  let out = cut(b, drop)
  if (f === 'webp') {
    // fix RIFF size and VP8X flags (ICC=0x20, EXIF=0x08, XMP=0x04)
    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength)
    dv.setUint32(4, out.length - 8, true)
    if (ascii(out, 12, 4) === 'VP8X') out[20] &= ~(0x08 | 0x04 | (opts.keepIcc ? 0 : 0x20))
  }
  if (f === 'jpeg' && opts.orientation && opts.orientation > 1) {
    const tiff = orientationTiff(opts.orientation)
    const len = tiff.length + 8
    const seg = new Uint8Array([0xff, 0xe1, len >> 8, len & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff])
    // insert after SOI and APP0 (JFIF) if present
    let at = 2
    if (out[2] === 0xff && out[3] === 0xe0) at = 4 + ((out[4] << 8) | out[5])
    out = concat([out.subarray(0, at), seg, out.subarray(at)])
  }
  return out
}

/** Little-endian TIFF with a single IFD0 entry: Orientation. */
export function orientationTiff(o: number): Uint8Array {
  return new Uint8Array([0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, o & 255, 0, 0, 0, 0, 0, 0, 0])
}

// ---------- ZIP (store, no compression) ----------

const CRC_T = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zip(files: { name: string; data: Uint8Array }[], date = new Date()): Uint8Array {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const enc = new TextEncoder()
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, 0x04034b50, true)
    h.setUint16(4, 20, true)
    h.setUint16(6, 0x0800, true) // UTF-8 names
    h.setUint16(10, dosTime, true)
    h.setUint16(12, dosDate, true)
    h.setUint32(14, crc, true)
    h.setUint32(18, f.data.length, true)
    h.setUint32(22, f.data.length, true)
    h.setUint16(26, name.length, true)
    local.push(new Uint8Array(h.buffer), name, f.data)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(12, dosTime, true)
    c.setUint16(14, dosDate, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, f.data.length, true)
    c.setUint32(24, f.data.length, true)
    c.setUint16(28, name.length, true)
    c.setUint32(42, offset, true)
    central.push(new Uint8Array(c.buffer), name)
    offset += 30 + name.length + f.data.length
  }
  const cd = concat(central)
  const e = new DataView(new ArrayBuffer(22))
  e.setUint32(0, 0x06054b50, true)
  e.setUint16(8, files.length, true)
  e.setUint16(10, files.length, true)
  e.setUint32(12, cd.length, true)
  e.setUint32(16, offset, true)
  return concat([...local, cd, new Uint8Array(e.buffer)])
}

/** Makes names unique inside a ZIP: a.jpg, a (2).jpg … */
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>()
  return names.map((n) => {
    let out = n
    for (let i = 2; used.has(out.toLowerCase()); i++) out = n.replace(/(\.[^.]*)?$/, (ext) => ` (${i})${ext}`)
    used.add(out.toLowerCase())
    return out
  })
}
