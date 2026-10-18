// Font Inspector: a small OpenType/TrueType reader written from the OpenType specification.
// Reads the sfnt table directory (TTF/OTF, WOFF via DecompressionStream, first font of a TTC),
// name/head/hhea/maxp/hmtx/OS/2/post/cmap/fvar, TrueType glyf outlines (incl. composites) as SVG
// paths, and GSUB/GPOS script + feature tags. Also a tiny TrueType writer for tests and the demo.

import { parseCff, type Cff } from './font-inspector-cff'
import { woff2Tables } from './font-inspector-woff2'

export class FontError extends Error {}

export interface TableRec { tag: string; offset: number; length: number; checksum: number }
export type Tables = Map<string, DataView>

const tagAt = (d: DataView, o: number) => String.fromCharCode(d.getUint8(o), d.getUint8(o + 1), d.getUint8(o + 2), d.getUint8(o + 3))

export function sniff(b: Uint8Array): 'ttf' | 'otf' | 'woff' | 'woff2' | 'ttc' | null {
  if (b.length < 12) return null
  const t = String.fromCharCode(b[0], b[1], b[2], b[3])
  if (t === 'wOFF') return 'woff'
  if (t === 'wOF2') return 'woff2'
  if (t === 'ttcf') return 'ttc'
  if (t === 'OTTO') return 'otf'
  if ((b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) || t === 'true') return 'ttf'
  return null
}

/** Table directory of an sfnt starting at `base` (0 for plain fonts, the font offset inside a TTC). */
export function sfntTables(b: Uint8Array, base = 0): { recs: TableRec[]; tables: Tables } {
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const n = d.getUint16(base + 4)
  if (12 + n * 16 > b.length) throw new FontError('Truncated table directory')
  const recs: TableRec[] = []
  const tables: Tables = new Map()
  for (let i = 0; i < n; i++) {
    const o = base + 12 + i * 16
    const rec = { tag: tagAt(d, o), checksum: d.getUint32(o + 4), offset: d.getUint32(o + 8), length: d.getUint32(o + 12) }
    if (rec.offset + rec.length > b.length) throw new FontError(`Table ${rec.tag} points outside the file`)
    recs.push(rec)
    tables.set(rec.tag, new DataView(b.buffer, b.byteOffset + rec.offset, rec.length))
  }
  return { recs, tables }
}

async function inflate(data: Uint8Array, format: string): Promise<Uint8Array> {
  const ds = new DecompressionStream(format as CompressionFormat)
  const out = new Response(new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(ds))
  return new Uint8Array(await out.arrayBuffer())
}

/** WOFF 1.0: per-table zlib streams. */
export async function woffTables(b: Uint8Array): Promise<{ recs: TableRec[]; tables: Tables; flavor: string }> {
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const flavor = tagAt(d, 4)
  const n = d.getUint16(12)
  const recs: TableRec[] = []
  const tables: Tables = new Map()
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20
    const tag = tagAt(d, o), offset = d.getUint32(o + 4), comp = d.getUint32(o + 8), orig = d.getUint32(o + 12), checksum = d.getUint32(o + 16)
    if (offset + comp > b.length) throw new FontError(`WOFF table ${tag} points outside the file`)
    const raw = b.subarray(offset, offset + comp)
    const data = comp < orig ? await inflate(raw, 'deflate') : raw.slice()
    if (data.length !== orig) throw new FontError(`WOFF table ${tag} has the wrong size after decompression`)
    recs.push({ tag, offset, length: orig, checksum })
    tables.set(tag, new DataView(data.buffer, data.byteOffset, data.byteLength))
  }
  return { recs, tables, flavor: flavor === 'OTTO' ? 'otf' : 'ttf' }
}

// ---------- individual tables ----------

const MAC_ROMAN_HI = 'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ'

export function parseName(d: DataView): Record<number, string> {
  const count = d.getUint16(2), strOff = d.getUint16(4)
  const best: Record<number, { s: string; score: number }> = {}
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 12
    const pid = d.getUint16(o), eid = d.getUint16(o + 2), lang = d.getUint16(o + 4), nid = d.getUint16(o + 6), len = d.getUint16(o + 8), off = d.getUint16(o + 10)
    const start = strOff + off
    if (start + len > d.byteLength) continue
    let s = ''
    if (pid === 0 || pid === 3) {
      for (let k = 0; k + 1 < len; k += 2) s += String.fromCharCode(d.getUint16(start + k))
    } else if (pid === 1 && eid === 0) {
      for (let k = 0; k < len; k++) {
        const c = d.getUint8(start + k)
        s += c < 128 ? String.fromCharCode(c) : MAC_ROMAN_HI[c - 128]
      }
    } else continue
    const score = pid === 3 && (lang === 0x409 || lang === 0) ? 3 : pid === 3 ? 1 : pid === 0 ? 2 : lang === 0 ? 1.5 : 0.5
    if (!best[nid] || score > best[nid].score) best[nid] = { s, score }
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.s]))
}

export const NAME_IDS: Record<number, string> = { 0: 'Copyright', 1: 'Family', 2: 'Subfamily', 3: 'Unique ID', 4: 'Full name', 5: 'Version', 6: 'PostScript name', 7: 'Trademark', 8: 'Manufacturer', 9: 'Designer', 10: 'Description', 11: 'Vendor URL', 12: 'Designer URL', 13: 'License', 14: 'License URL', 16: 'Typographic family', 17: 'Typographic subfamily', 19: 'Sample text' }

const fixed = (d: DataView, o: number) => d.getInt32(o) / 65536
const longDate = (d: DataView, o: number) => {
  const secs = d.getUint32(o) * 2 ** 32 + d.getUint32(o + 4)
  const ms = (secs - 2082844800) * 1000
  return Number.isFinite(ms) && ms > -1e13 && ms < 1e14 ? new Date(ms).toISOString().slice(0, 10) : ''
}

export interface Head { unitsPerEm: number; xMin: number; yMin: number; xMax: number; yMax: number; indexToLoc: number; revision: number; created: string; modified: string; macStyle: number }
export function parseHead(d: DataView): Head {
  if (d.getUint32(12) !== 0x5f0f3cf5) throw new FontError('head table has a bad magic number')
  return { revision: fixed(d, 4), unitsPerEm: d.getUint16(18), created: longDate(d, 20), modified: longDate(d, 28), xMin: d.getInt16(36), yMin: d.getInt16(38), xMax: d.getInt16(40), yMax: d.getInt16(42), macStyle: d.getUint16(44), indexToLoc: d.getInt16(50) }
}

export interface Hhea { ascender: number; descender: number; lineGap: number; advanceWidthMax: number; numberOfHMetrics: number }
export const parseHhea = (d: DataView): Hhea => ({ ascender: d.getInt16(4), descender: d.getInt16(6), lineGap: d.getInt16(8), advanceWidthMax: d.getUint16(10), numberOfHMetrics: d.getUint16(34) })

export interface OS2 { version: number; weight: number; width: number; fsType: number; vendor: string; typoAscender: number; typoDescender: number; typoLineGap: number; winAscent: number; winDescent: number; xHeight: number | null; capHeight: number | null; fsSelection: number; panose: number[]; avgWidth: number }
export function parseOS2(d: DataView): OS2 {
  const v = d.getUint16(0)
  return {
    version: v, avgWidth: d.getInt16(2), weight: d.getUint16(4), width: d.getUint16(6), fsType: d.getUint16(8),
    panose: Array.from({ length: 10 }, (_, i) => d.getUint8(32 + i)), vendor: tagAt(d, 58).trim(), fsSelection: d.getUint16(62),
    typoAscender: d.getInt16(68), typoDescender: d.getInt16(70), typoLineGap: d.getInt16(72), winAscent: d.getUint16(74), winDescent: d.getUint16(76),
    xHeight: v >= 2 && d.byteLength >= 90 ? d.getInt16(86) : null, capHeight: v >= 2 && d.byteLength >= 90 ? d.getInt16(88) : null,
  }
}

export function embedding(fsType: number): string {
  const t = fsType & 0xf
  if (t === 0) return 'Installable — no embedding restrictions'
  if (t & 2) return 'Restricted license — must not be embedded'
  if (t & 4) return 'Preview & print embedding only'
  if (t & 8) return 'Editable embedding'
  return `fsType ${fsType}`
}

export interface Post { italicAngle: number; underlinePosition: number; underlineThickness: number; isFixedPitch: boolean; version: number }
export const parsePost = (d: DataView): Post => ({ version: fixed(d, 0), italicAngle: fixed(d, 4), underlinePosition: d.getInt16(8), underlineThickness: d.getInt16(10), isFixedPitch: d.getUint32(12) !== 0 })

/** Unicode → glyph index from the best cmap subtable (format 12, 4, 6 or 0). */
export function parseCmap(d: DataView): Map<number, number> {
  const n = d.getUint16(2)
  const subs: { pid: number; eid: number; off: number; fmt: number }[] = []
  for (let i = 0; i < n; i++) {
    const o = 4 + i * 8
    const off = d.getUint32(o + 4)
    if (off + 2 <= d.byteLength) subs.push({ pid: d.getUint16(o), eid: d.getUint16(o + 2), off, fmt: d.getUint16(off) })
  }
  const rank = (s: (typeof subs)[number]) => (s.fmt === 12 && (s.pid === 3 || s.pid === 0) ? 5 : s.fmt === 4 && s.pid === 3 && s.eid === 1 ? 4 : s.fmt === 4 && s.pid === 0 ? 3 : s.fmt === 6 ? 2 : s.fmt === 0 ? 1 : 0)
  const sub = subs.filter((s) => rank(s) > 0).sort((a, b) => rank(b) - rank(a))[0]
  const map = new Map<number, number>()
  if (!sub) return map
  const o = sub.off
  if (sub.fmt === 4) {
    const segX2 = d.getUint16(o + 6)
    const ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2
    for (let s = 0; s < segX2 / 2; s++) {
      const end = d.getUint16(ends + s * 2), start = d.getUint16(starts + s * 2), delta = d.getInt16(deltas + s * 2), ro = d.getUint16(ranges + s * 2)
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g: number
        if (ro === 0) g = (c + delta) & 0xffff
        else {
          const at = ranges + s * 2 + ro + (c - start) * 2
          if (at + 2 > d.byteLength) continue
          g = d.getUint16(at)
          if (g) g = (g + delta) & 0xffff
        }
        if (g) map.set(c, g)
      }
    }
  } else if (sub.fmt === 12) {
    const groups = d.getUint32(o + 12)
    for (let i = 0; i < groups; i++) {
      const p = o + 16 + i * 12
      const sc = d.getUint32(p), ec = d.getUint32(p + 4), sg = d.getUint32(p + 8)
      for (let c = sc; c <= ec && c - sc < 0x30000; c++) map.set(c, sg + (c - sc))
    }
  } else if (sub.fmt === 6) {
    const first = d.getUint16(o + 6), cnt = d.getUint16(o + 8)
    for (let i = 0; i < cnt; i++) {
      const g = d.getUint16(o + 10 + i * 2)
      if (g) map.set(first + i, g)
    }
  } else if (sub.fmt === 0) {
    for (let c = 0; c < 256; c++) {
      const g = d.getUint8(o + 6 + c)
      if (g) map.set(c, g)
    }
  }
  return map
}

export function parseHmtx(d: DataView, numH: number, numGlyphs: number): { adv: Uint16Array; lsb: Int16Array } {
  const adv = new Uint16Array(numGlyphs), lsb = new Int16Array(numGlyphs)
  let last = 0
  for (let i = 0; i < numGlyphs; i++) {
    if (i < numH) {
      if (i * 4 + 4 > d.byteLength) break
      last = adv[i] = d.getUint16(i * 4)
      lsb[i] = d.getInt16(i * 4 + 2)
    } else {
      adv[i] = last
      const o = numH * 4 + (i - numH) * 2
      if (o + 2 <= d.byteLength) lsb[i] = d.getInt16(o)
    }
  }
  return { adv, lsb }
}

/** Script and feature tags of a GSUB or GPOS table. */
export function layoutTags(d: DataView): { scripts: string[]; features: string[] } {
  const sl = d.getUint16(4), fl = d.getUint16(6)
  const scripts: string[] = [], features: string[] = []
  const sc = d.getUint16(sl)
  for (let i = 0; i < sc; i++) scripts.push(tagAt(d, sl + 2 + i * 6))
  const fc = d.getUint16(fl)
  for (let i = 0; i < fc; i++) features.push(tagAt(d, fl + 2 + i * 6))
  return { scripts: [...new Set(scripts)], features: [...new Set(features)] }
}

export interface Axis { tag: string; min: number; def: number; max: number; nameId: number }
export function parseFvar(d: DataView): Axis[] {
  const off = d.getUint16(4), count = d.getUint16(8), size = d.getUint16(10)
  return Array.from({ length: count }, (_, i) => {
    const o = off + i * size
    return { tag: tagAt(d, o), min: fixed(d, o + 4), def: fixed(d, o + 8), max: fixed(d, o + 12), nameId: d.getUint16(o + 18) }
  })
}

// ---------- glyf outlines ----------

export interface Pt { x: number; y: number; on: boolean }
export interface Outline { contours: Pt[][]; xMin: number; yMin: number; xMax: number; yMax: number; composite: number[]; /** Precomputed path (CFF cubic outlines). */ d?: string }

export function glyfLocations(loca: DataView, numGlyphs: number, long: boolean): Uint32Array {
  const out = new Uint32Array(numGlyphs + 1)
  for (let i = 0; i <= numGlyphs; i++) {
    const o = long ? i * 4 : i * 2
    if (o + (long ? 4 : 2) > loca.byteLength) break
    out[i] = long ? loca.getUint32(o) : loca.getUint16(o) * 2
  }
  return out
}

/** Decodes glyph `gid`; composites are flattened with their x/y offsets and 2×2 transforms. */
export function readGlyph(glyf: DataView, locs: Uint32Array, gid: number, depth = 0): Outline | null {
  const start = locs[gid], end = locs[gid + 1]
  if (end <= start || end > glyf.byteLength) return null
  const nc = glyf.getInt16(start)
  const box = { xMin: glyf.getInt16(start + 2), yMin: glyf.getInt16(start + 4), xMax: glyf.getInt16(start + 6), yMax: glyf.getInt16(start + 8) }
  let p = start + 10
  if (nc >= 0) {
    const endPts: number[] = []
    for (let i = 0; i < nc; i++, p += 2) endPts.push(glyf.getUint16(p))
    const nPts = nc ? endPts[nc - 1] + 1 : 0
    p += 2 + glyf.getUint16(p) // instructions
    const flags: number[] = []
    while (flags.length < nPts) {
      const f = glyf.getUint8(p++)
      flags.push(f)
      if (f & 8) {
        const r = glyf.getUint8(p++)
        for (let k = 0; k < r; k++) flags.push(f)
      }
    }
    const xs: number[] = [], ys: number[] = []
    let v = 0
    for (const f of flags) {
      if (f & 2) {
        const dx = glyf.getUint8(p++)
        v += f & 16 ? dx : -dx
      } else if (!(f & 16)) {
        v += glyf.getInt16(p)
        p += 2
      }
      xs.push(v)
    }
    v = 0
    for (const f of flags) {
      if (f & 4) {
        const dy = glyf.getUint8(p++)
        v += f & 32 ? dy : -dy
      } else if (!(f & 32)) {
        v += glyf.getInt16(p)
        p += 2
      }
      ys.push(v)
    }
    const contours: Pt[][] = []
    let s = 0
    for (const e of endPts) {
      contours.push(Array.from({ length: e - s + 1 }, (_, k) => ({ x: xs[s + k], y: ys[s + k], on: !!(flags[s + k] & 1) })))
      s = e + 1
    }
    return { ...box, contours, composite: [] }
  }
  if (depth > 8) return null
  const contours: Pt[][] = []
  const comps: number[] = []
  let more = true
  while (more) {
    const f = glyf.getUint16(p), g = glyf.getUint16(p + 2)
    p += 4
    let dx: number, dy: number
    if (f & 1) {
      dx = f & 2 ? glyf.getInt16(p) : glyf.getUint16(p)
      dy = f & 2 ? glyf.getInt16(p + 2) : glyf.getUint16(p + 2)
      p += 4
    } else {
      dx = f & 2 ? glyf.getInt8(p) : glyf.getUint8(p)
      dy = f & 2 ? glyf.getInt8(p + 1) : glyf.getUint8(p + 1)
      p += 2
    }
    let a = 1, b = 0, c = 0, dd = 1
    const f2 = (o: number) => glyf.getInt16(o) / 16384
    if (f & 8) {
      a = dd = f2(p)
      p += 2
    } else if (f & 0x40) {
      a = f2(p)
      dd = f2(p + 2)
      p += 4
    } else if (f & 0x80) {
      a = f2(p); b = f2(p + 2); c = f2(p + 4); dd = f2(p + 6)
      p += 8
    }
    comps.push(g)
    const sub = readGlyph(glyf, locs, g, depth + 1)
    if (sub && f & 2) for (const ct of sub.contours) contours.push(ct.map((q) => ({ x: a * q.x + c * q.y + dx, y: b * q.x + dd * q.y + dy, on: q.on })))
    more = !!(f & 0x20)
  }
  return { ...box, contours, composite: comps }
}

/** SVG path (y up in font units → caller flips) using quadratic Béziers with implied on-curve points. */
export function toPath(o: Outline): string {
  if (o.d !== undefined) return o.d
  const parts: string[] = []
  const f = (n: number) => +n.toFixed(2)
  for (const c of o.contours) {
    if (!c.length) continue
    const n = c.length
    let si = c.findIndex((q) => q.on)
    let start: { x: number; y: number }
    if (si < 0) {
      start = { x: (c[0].x + c[n - 1].x) / 2, y: (c[0].y + c[n - 1].y) / 2 }
      si = 0
      parts.push(`M${f(start.x)} ${f(start.y)}`)
      for (let k = 0; k < n; k++) {
        const cur = c[k], nxt = c[(k + 1) % n]
        parts.push(`Q${f(cur.x)} ${f(cur.y)} ${f((cur.x + nxt.x) / 2)} ${f((cur.y + nxt.y) / 2)}`)
      }
      parts.push('Z')
      continue
    }
    start = c[si]
    parts.push(`M${f(start.x)} ${f(start.y)}`)
    let ctrl: Pt | null = null
    for (let k = 1; k <= n; k++) {
      const q = c[(si + k) % n]
      if (q.on) {
        if (k === n && !ctrl) break
        parts.push(ctrl ? `Q${f(ctrl.x)} ${f(ctrl.y)} ${f(q.x)} ${f(q.y)}` : `L${f(q.x)} ${f(q.y)}`)
        ctrl = null
      } else {
        if (ctrl) parts.push(`Q${f(ctrl.x)} ${f(ctrl.y)} ${f((ctrl.x + q.x) / 2)} ${f((ctrl.y + q.y) / 2)}`)
        ctrl = q
      }
    }
    parts.push('Z')
  }
  return parts.join('')
}

// ---------- whole font ----------

export interface Font {
  format: string
  recs: TableRec[]
  names: Record<number, string>
  head: Head
  hhea: Hhea | null
  os2: OS2 | null
  post: Post | null
  numGlyphs: number
  cmap: Map<number, number>
  adv: Uint16Array
  outlines: 'glyf' | 'CFF' | 'CFF2' | 'none'
  gsub: { scripts: string[]; features: string[] } | null
  gpos: { scripts: string[]; features: string[] } | null
  axes: Axis[]
  hasKern: boolean
  glyph: (gid: number) => Outline | null
  note: string
}

export function readTables(format: string, recs: TableRec[], tables: Tables): Font {
  const need = (t: string) => {
    const v = tables.get(t)
    if (!v) throw new FontError(`Required table “${t}” is missing`)
    return v
  }
  const head = parseHead(need('head'))
  const numGlyphs = need('maxp').getUint16(4)
  const hhea = tables.get('hhea') ? parseHhea(tables.get('hhea')!) : null
  const adv = hhea && tables.get('hmtx') ? parseHmtx(tables.get('hmtx')!, hhea.numberOfHMetrics, numGlyphs).adv : new Uint16Array(numGlyphs)
  const glyf = tables.get('glyf'), loca = tables.get('loca')
  const locs = glyf && loca ? glyfLocations(loca, numGlyphs, head.indexToLoc === 1) : null
  const safe = <T>(f: () => T, d: T) => {
    try {
      return f()
    } catch {
      return d
    }
  }
  let note = ''
  let cff: Cff | null = null
  const cffT = tables.get('CFF ')
  if (!glyf && cffT) {
    try {
      cff = parseCff(new Uint8Array(cffT.buffer, cffT.byteOffset, cffT.byteLength))
    } catch (e) {
      note = `CFF outlines could not be read (${(e as Error).message}); glyphs are drawn by the browser instead.`
    }
  } else if (tables.has('CFF2')) note = 'CFF2 (variable PostScript) outlines are drawn by the browser’s font engine.'
  return {
    format,
    recs,
    head,
    hhea,
    numGlyphs,
    adv,
    names: tables.get('name') ? safe(() => parseName(tables.get('name')!), {}) : {},
    os2: tables.get('OS/2') ? safe(() => parseOS2(tables.get('OS/2')!), null) : null,
    post: tables.get('post') ? safe(() => parsePost(tables.get('post')!), null) : null,
    cmap: tables.get('cmap') ? safe(() => parseCmap(tables.get('cmap')!), new Map()) : new Map(),
    outlines: glyf ? 'glyf' : tables.get('CFF ') ? 'CFF' : tables.get('CFF2') ? 'CFF2' : 'none',
    gsub: tables.get('GSUB') ? safe(() => layoutTags(tables.get('GSUB')!), null) : null,
    gpos: tables.get('GPOS') ? safe(() => layoutTags(tables.get('GPOS')!), null) : null,
    axes: tables.get('fvar') ? safe(() => parseFvar(tables.get('fvar')!), []) : [],
    hasKern: tables.has('kern'),
    glyph: (gid) => (gid < 0 || gid >= numGlyphs ? null : glyf && locs ? safe(() => readGlyph(glyf, locs, gid), null) : cff ? safe(() => cff.glyph(gid), null) : null),
    note,
  }
}

/** Parses any supported font file. WOFF2 needs Brotli; when the browser lacks it the caller falls back to FontFace. */
export async function parseFont(b: Uint8Array): Promise<Font> {
  const kind = sniff(b)
  if (!kind) throw new FontError('Not a font file (unknown signature)')
  if (kind === 'woff') {
    const w = await woffTables(b)
    return readTables(`WOFF (${w.flavor === 'otf' ? 'CFF' : 'TrueType'})`, w.recs, w.tables)
  }
  if (kind === 'woff2') {
    let w: Awaited<ReturnType<typeof woff2Tables>>
    try {
      w = await woff2Tables(b)
    } catch (e) {
      const m = (e as Error).message
      throw new FontError(m === 'NO_BROTLI' ? 'WOFF2 tables are Brotli-compressed and this browser has no DecompressionStream("brotli"), so the tables can’t be read here. The preview below still uses the browser’s own WOFF2 support.' : `WOFF2: ${m}`)
    }
    return readTables(`WOFF2 (${w.flavor === 'otf' ? 'CFF' : 'TrueType'})`, w.recs, w.tables)
  }
  if (kind === 'ttc') {
    const d = new DataView(b.buffer, b.byteOffset, b.byteLength)
    const n = d.getUint32(8)
    const { recs, tables } = sfntTables(b, d.getUint32(12))
    const f = readTables(`TrueType Collection (font 1 of ${n})`, recs, tables)
    return f
  }
  const { recs, tables } = sfntTables(b)
  return readTables(kind === 'otf' ? 'OpenType (CFF outlines)' : 'TrueType', recs, tables)
}

export const FEATURES: Record<string, string> = {
  aalt: 'Access all alternates', calt: 'Contextual alternates', case: 'Case-sensitive forms', ccmp: 'Glyph composition', clig: 'Contextual ligatures', cpsp: 'Capital spacing', c2sc: 'Caps to small caps', dlig: 'Discretionary ligatures', dnom: 'Denominators', frac: 'Fractions', hlig: 'Historical ligatures', kern: 'Kerning', liga: 'Standard ligatures', lnum: 'Lining figures', locl: 'Localized forms', mark: 'Mark positioning', mkmk: 'Mark-to-mark', numr: 'Numerators', onum: 'Oldstyle figures', ordn: 'Ordinals', pnum: 'Proportional figures', salt: 'Stylistic alternates', sinf: 'Scientific inferiors', smcp: 'Small caps', subs: 'Subscript', sups: 'Superscript', swsh: 'Swash', tnum: 'Tabular figures', zero: 'Slashed zero', rlig: 'Required ligatures', init: 'Initial forms', medi: 'Medial forms', fina: 'Final forms', isol: 'Isolated forms', cpct: 'Centered CJK punctuation', vert: 'Vertical alternates', ss01: 'Stylistic set 1', ss02: 'Stylistic set 2', ss03: 'Stylistic set 3', cv01: 'Character variant 1',
}
export const featureLabel = (t: string) => FEATURES[t] ?? (/^ss\d\d$/.test(t) ? `Stylistic set ${+t.slice(2)}` : /^cv\d\d$/.test(t) ? `Character variant ${+t.slice(2)}` : '')

// ---------- writer (tests and the demo font) ----------

export interface WGlyph { advance: number; contours?: Pt[][]; components?: { glyph: number; dx: number; dy: number }[] }

class W {
  a: number[] = []
  u8(v: number) { this.a.push(v & 255); return this }
  u16(v: number) { this.a.push((v >> 8) & 255, v & 255); return this }
  i16(v: number) { return this.u16(v < 0 ? v + 65536 : v) }
  u32(v: number) { this.a.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); return this }
  tag(s: string) { for (let i = 0; i < 4; i++) this.a.push(s.charCodeAt(i)); return this }
  pad() { while (this.a.length % 4) this.a.push(0); return this }
}

const checksum = (b: number[], off = 0, len = b.length) => {
  let s = 0
  for (let i = off; i < off + len; i += 4) s = (s + (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0))) >>> 0
  return s
}

/** Builds a valid little TrueType font: glyph 0 must be .notdef. `cmap` maps code points (BMP) to glyphs. */
export function buildFont(o: { family: string; style?: string; upm?: number; ascender: number; descender: number; xHeight: number; capHeight: number; glyphs: WGlyph[]; cmap: Map<number, number>; features?: string[] }): Uint8Array {
  const upm = o.upm ?? 1000
  const tables: Record<string, number[]> = {}
  // glyf + loca
  const glyf = new W()
  const loca: number[] = []
  let maxPts = 0, maxCont = 0, maxComp = 0
  const bbox = { xMin: 32767, yMin: 32767, xMax: -32768, yMax: -32768 }
  const boxes: { xMin: number; yMin: number; xMax: number; yMax: number }[] = []
  for (const g of o.glyphs) {
    loca.push(glyf.a.length)
    const pts = (g.contours ?? []).flat()
    if (g.components?.length) {
      const sub = g.components.map((c) => ({ c, b: boxes[c.glyph] })).filter((x) => x.b)
      const b = sub.length ? { xMin: Math.min(...sub.map((x) => x.b.xMin + x.c.dx)), yMin: Math.min(...sub.map((x) => x.b.yMin + x.c.dy)), xMax: Math.max(...sub.map((x) => x.b.xMax + x.c.dx)), yMax: Math.max(...sub.map((x) => x.b.yMax + x.c.dy)) } : { xMin: 0, yMin: 0, xMax: 0, yMax: 0 }
      boxes.push(b)
      glyf.i16(-1).i16(b.xMin).i16(b.yMin).i16(b.xMax).i16(b.yMax)
      g.components.forEach((c, i) => glyf.u16(0x0001 | 0x0002 | (i < g.components!.length - 1 ? 0x20 : 0)).u16(c.glyph).i16(c.dx).i16(c.dy))
      maxComp = Math.max(maxComp, g.components.length)
    } else if (pts.length) {
      const b = { xMin: Math.min(...pts.map((p) => p.x)), yMin: Math.min(...pts.map((p) => p.y)), xMax: Math.max(...pts.map((p) => p.x)), yMax: Math.max(...pts.map((p) => p.y)) }
      boxes.push(b)
      glyf.i16(g.contours!.length).i16(b.xMin).i16(b.yMin).i16(b.xMax).i16(b.yMax)
      let e = -1
      for (const c of g.contours!) glyf.u16((e += c.length))
      glyf.u16(0)
      for (const p of pts) glyf.u8(p.on ? 1 : 0)
      let prev = 0
      for (const p of pts) { glyf.i16(p.x - prev); prev = p.x }
      prev = 0
      for (const p of pts) { glyf.i16(p.y - prev); prev = p.y }
      maxPts = Math.max(maxPts, pts.length)
      maxCont = Math.max(maxCont, g.contours!.length)
    } else boxes.push({ xMin: 0, yMin: 0, xMax: 0, yMax: 0 })
    const bx = boxes[boxes.length - 1]
    if (bx.xMax > bx.xMin || bx.yMax > bx.yMin) {
      bbox.xMin = Math.min(bbox.xMin, bx.xMin); bbox.yMin = Math.min(bbox.yMin, bx.yMin); bbox.xMax = Math.max(bbox.xMax, bx.xMax); bbox.yMax = Math.max(bbox.yMax, bx.yMax)
    }
    glyf.pad()
  }
  loca.push(glyf.a.length)
  tables.glyf = glyf.a
  const lw = new W()
  for (const v of loca) lw.u32(v)
  tables.loca = lw.a
  const n = o.glyphs.length
  tables.head = new W().u32(0x10000).u32(0x10000).u32(0).u32(0x5f0f3cf5).u16(0b1011).u16(upm).u32(0).u32(0xe0000000).u32(0).u32(0xe0000000).i16(bbox.xMin).i16(bbox.yMin).i16(bbox.xMax).i16(bbox.yMax).u16(0).u16(8).i16(2).i16(1).i16(0).a
  const advMax = Math.max(...o.glyphs.map((g) => g.advance))
  tables.hhea = new W().u32(0x10000).i16(o.ascender).i16(o.descender).i16(0).u16(advMax).i16(0).i16(0).i16(advMax).i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(n).a
  tables.maxp = new W().u32(0x10000).u16(n).u16(maxPts).u16(maxCont).u16(maxPts * Math.max(1, maxComp)).u16(maxCont * Math.max(1, maxComp)).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(maxComp).u16(maxComp ? 1 : 0).a
  const hm = new W()
  o.glyphs.forEach((g, i) => hm.u16(g.advance).i16(boxes[i].xMin))
  tables.hmtx = hm.a
  // cmap format 4 (one segment per code point run)
  const cps = [...o.cmap.keys()].filter((c) => c < 0xffff).sort((a, b) => a - b)
  const segs: { s: number; e: number; delta: number }[] = []
  for (const c of cps) {
    const g = o.cmap.get(c)!
    const last = segs[segs.length - 1]
    if (last && c === last.e + 1 && ((c + last.delta) & 0xffff) === g) last.e = c
    else segs.push({ s: c, e: c, delta: (g - c + 65536) & 0xffff })
  }
  segs.push({ s: 0xffff, e: 0xffff, delta: 1 })
  const sc = segs.length
  const es = 2 ** Math.floor(Math.log2(sc))
  const f4 = new W().u16(4).u16(16 + sc * 8).u16(0).u16(sc * 2).u16(es * 2).u16(Math.log2(es)).u16(sc * 2 - es * 2)
  segs.forEach((s) => f4.u16(s.e))
  f4.u16(0)
  segs.forEach((s) => f4.u16(s.s))
  segs.forEach((s) => f4.u16(s.delta))
  segs.forEach(() => f4.u16(0))
  tables.cmap = new W().u16(0).u16(1).u16(3).u16(1).u32(12).a.concat(f4.a)
  // name
  const style = o.style ?? 'Regular'
  const recs: [number, string][] = [[1, o.family], [2, style], [3, `${o.family}-${style}-demo`], [4, `${o.family} ${style}`], [5, 'Version 1.000'], [6, `${o.family.replace(/\s+/g, '')}-${style}`], [13, 'Generated in the browser for demonstration. Free to use.']]
  const strs: number[] = []
  const nm = new W().u16(0).u16(recs.length).u16(6 + recs.length * 12)
  for (const [id, s] of recs) {
    nm.u16(3).u16(1).u16(0x409).u16(id).u16(s.length * 2).u16(strs.length)
    for (const ch of s) strs.push(ch.charCodeAt(0) >> 8, ch.charCodeAt(0) & 255)
  }
  tables.name = nm.a.concat(strs)
  tables['OS/2'] = new W().u16(4).i16(Math.round(advMax * 0.6)).u16(400).u16(5).u16(0).i16(650).i16(600).i16(0).i16(75).i16(650).i16(600).i16(0).i16(350).i16(50).i16(250).i16(0)
    .u8(2).u8(0).u8(5).u8(0).u8(0).u8(0).u8(0).u8(0).u8(0).u8(0).u32(1).u32(0).u32(0).u32(0).tag('BTBX').u16(0x40).u16(Math.min(...cps, 0xffff)).u16(Math.max(...cps.filter((c) => c < 0xffff), 0))
    .i16(o.ascender).i16(o.descender).i16(0).u16(o.ascender).u16(-o.descender).u32(1).u32(0).i16(o.xHeight).i16(o.capHeight).u16(0).u16(32).u16(0).a
  tables.post = new W().u32(0x30000).u32(0).i16(-100).i16(50).u32(0).u32(0).u32(0).u32(0).u32(0).a
  if (o.features?.length) {
    const feats = o.features
    const g = new W().u16(1).u16(0).u16(10).u16(0).u16(0)
    // ScriptList at 10: 1 script DFLT → Script table → default LangSys listing every feature
    const scriptList = 10
    const scriptTable = scriptList + 2 + 6
    const langSysLen = 6 + feats.length * 2
    const featureList = scriptTable + 4 + langSysLen
    const lookupList = featureList + 2 + feats.length * 6 + feats.length * 4
    g.a[6] = (featureList >> 8) & 255; g.a[7] = featureList & 255
    g.a[8] = (lookupList >> 8) & 255; g.a[9] = lookupList & 255
    g.u16(1).tag('DFLT').u16(scriptTable - scriptList)
    g.u16(4).u16(0)
    g.u16(0).u16(0xffff).u16(feats.length)
    feats.forEach((_, i) => g.u16(i))
    g.u16(feats.length)
    feats.forEach((t, i) => g.tag(t).u16(2 + feats.length * 6 + i * 4))
    feats.forEach(() => g.u16(0).u16(0))
    g.u16(0)
    tables.GSUB = g.a
  }
  // assemble
  const tags = Object.keys(tables).sort()
  const nt = tags.length
  const es2 = 2 ** Math.floor(Math.log2(nt))
  const out = new W().u32(0x10000).u16(nt).u16(es2 * 16).u16(Math.log2(es2)).u16(nt * 16 - es2 * 16)
  let off = 12 + nt * 16
  const body: number[] = []
  const dir: [string, number, number, number][] = []
  for (const t of tags) {
    const data = tables[t]
    dir.push([t, checksum(data), off + body.length, data.length])
    body.push(...data)
    while (body.length % 4) body.push(0)
  }
  for (const [t, cs, o2, len] of dir) out.tag(t).u32(cs).u32(o2).u32(len)
  off = out.a.length
  const all = out.a.concat(body)
  const headOff = dir.find((x) => x[0] === 'head')![2]
  const adj = (0xb1b0afba - checksum(all)) >>> 0
  all[headOff + 8] = adj >>> 24; all[headOff + 9] = (adj >>> 16) & 255; all[headOff + 10] = (adj >>> 8) & 255; all[headOff + 11] = adj & 255
  void off
  return new Uint8Array(all)
}
