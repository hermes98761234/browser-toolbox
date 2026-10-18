// WOFF2 reader written from the W3C WOFF 2.0 recommendation: header, table directory with
// UIntBase128 lengths, one Brotli stream (via DecompressionStream('brotli') where the browser has it),
// and reconstruction of the transformed glyf/loca (§5.1) and hmtx (§5.4) tables.
import type { TableRec, Tables } from './font-inspector'

const KNOWN = 'cmap,head,hhea,hmtx,maxp,name,OS/2,post,cvt ,fpgm,glyf,loca,prep,CFF ,VORG,EBDT,EBLC,gasp,hdmx,kern,LTSH,PCLT,VDMX,vhea,vmtx,BASE,GDEF,GPOS,GSUB,EBSC,JSTF,MATH,CBDT,CBLC,COLR,CPAL,SVG ,sbix,acnt,avar,bdat,bloc,bsln,cvar,fdsc,feat,fmtx,fvar,gvar,hsty,just,lcar,mort,morx,opbd,prop,trak,Zapf,Silf,Glat,Gloc,Feat,Sill'.split(',')

export function brotliSupported(): boolean {
  try {
    new DecompressionStream('brotli' as CompressionFormat)
    return true
  } catch {
    return false
  }
}

class Rd {
  b: Uint8Array
  p: number
  constructor(b: Uint8Array, p = 0) {
    this.b = b
    this.p = p
  }
  u8() {
    if (this.p >= this.b.length) throw new Error('WOFF2 stream ended early')
    return this.b[this.p++]
  }
  u16() { return (this.u8() << 8) | this.u8() }
  i16() { const v = this.u16(); return v & 0x8000 ? v - 65536 : v }
  u32() { return ((this.u16() << 16) >>> 0) + this.u16() }
  base128() {
    let v = 0
    for (let i = 0; i < 5; i++) {
      const c = this.u8()
      if (i === 0 && c === 0x80) throw new Error('Bad UIntBase128')
      v = v * 128 + (c & 0x7f)
      if (!(c & 0x80)) return v
    }
    throw new Error('UIntBase128 too long')
  }
  u255() {
    const c = this.u8()
    return c === 253 ? this.u16() : c === 255 ? this.u8() + 253 : c === 254 ? this.u8() + 506 : c
  }
  bytes(n: number) {
    if (this.p + n > this.b.length) throw new Error('WOFF2 stream ended early')
    const s = this.b.subarray(this.p, this.p + n)
    this.p += n
    return s
  }
}

class Out {
  a: number[] = []
  u8(v: number) { this.a.push(v & 255) }
  u16(v: number) { this.a.push((v >> 8) & 255, v & 255) }
  u32(v: number) { this.a.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255) }
}

/** Decodes one point-coordinate triplet (WOFF2 §5.2). */
export function triplet(flag: number, r: Rd): [number, number] {
  const sg = (f: number, v: number) => (f & 1 ? v : -v)
  if (flag < 10) return [0, sg(flag, ((flag & 14) << 7) + r.u8())]
  if (flag < 20) return [sg(flag, (((flag - 10) & 14) << 7) + r.u8()), 0]
  if (flag < 84) {
    const b0 = flag - 20, b1 = r.u8()
    return [sg(flag, 1 + (b0 & 0x30) + (b1 >> 4)), sg(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f))]
  }
  if (flag < 120) {
    const b0 = flag - 84
    return [sg(flag, 1 + (Math.floor(b0 / 12) << 8) + r.u8()), sg(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + r.u8())]
  }
  if (flag < 124) {
    const a = r.u8(), b = r.u8(), c = r.u8()
    return [sg(flag, (a << 4) + (b >> 4)), sg(flag >> 1, ((b & 15) << 8) + c)]
  }
  const a = r.u16(), b = r.u16()
  return [sg(flag, a), sg(flag >> 1, b)]
}

/** Rebuilds standard glyf + loca from the transformed glyf stream. Returns per-glyph xMin for hmtx too. */
export function untransformGlyf(t: Uint8Array): { glyf: Uint8Array; loca: Uint8Array; xMin: Int16Array; indexFormat: number } {
  const h = new Rd(t)
  h.u16()
  const option = h.u16(), numGlyphs = h.u16(), indexFormat = h.u16()
  const sizes = Array.from({ length: 7 }, () => h.u32())
  let p = h.p
  const streams = sizes.map((s) => {
    const r = new Rd(t.subarray(p, p + s))
    p += s
    return r
  })
  const [nCont, nPts, flags, glyphs, comp, bboxS, instr] = streams
  const bitmapLen = 4 * Math.floor((numGlyphs + 31) / 32)
  const bitmap = bboxS.bytes(bitmapLen)
  void option
  const out = new Out()
  const offs: number[] = []
  const xMin = new Int16Array(numGlyphs)
  for (let g = 0; g < numGlyphs; g++) {
    offs.push(out.a.length)
    const nc = nCont.i16()
    const hasBox = (bitmap[g >> 3] & (0x80 >> (g & 7))) !== 0
    if (nc === 0) continue
    if (nc < 0) {
      // composite: copy component records verbatim
      const start = comp.p
      let more = true, haveInstr = false
      while (more) {
        const f = comp.u16()
        comp.u16()
        comp.p += (f & 1 ? 4 : 2) + (f & 8 ? 2 : f & 0x40 ? 4 : f & 0x80 ? 8 : 0)
        if (f & 0x100) haveInstr = true
        more = !!(f & 0x20)
      }
      const recs = comp.b.subarray(start, comp.p)
      if (!hasBox) throw new Error(`Composite glyph ${g} has no bounding box`)
      const box = [bboxS.i16(), bboxS.i16(), bboxS.i16(), bboxS.i16()]
      xMin[g] = box[0]
      out.u16(0xffff)
      box.forEach((v) => out.u16(v))
      out.a.push(...recs)
      if (haveInstr) {
        const n = glyphs.u255()
        out.u16(n)
        out.a.push(...instr.bytes(n))
      }
    } else {
      const ends: number[] = []
      let total = 0
      for (let c = 0; c < nc; c++) {
        total += nPts.u255()
        ends.push(total - 1)
      }
      const xs: number[] = [], ys: number[] = [], on: boolean[] = []
      let x = 0, y = 0
      for (let k = 0; k < total; k++) {
        const fl = flags.u8()
        const [dx, dy] = triplet(fl & 0x7f, glyphs)
        x += dx
        y += dy
        xs.push(x)
        ys.push(y)
        on.push(!(fl & 0x80))
      }
      const n = glyphs.u255()
      const ins = instr.bytes(n)
      const box = hasBox ? [bboxS.i16(), bboxS.i16(), bboxS.i16(), bboxS.i16()] : [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
      xMin[g] = box[0]
      out.u16(nc)
      box.forEach((v) => out.u16(v))
      ends.forEach((e) => out.u16(e))
      out.u16(n)
      out.a.push(...ins)
      on.forEach((o) => out.u8(o ? 1 : 0))
      let prev = 0
      for (const v of xs) { out.u16(v - prev); prev = v }
      prev = 0
      for (const v of ys) { out.u16(v - prev); prev = v }
    }
    while (out.a.length % 4) out.a.push(0)
  }
  offs.push(out.a.length)
  const lo = new Out()
  for (const o of offs) {
    if (indexFormat) lo.u32(o)
    else lo.u16(o >> 1)
  }
  return { glyf: new Uint8Array(out.a), loca: new Uint8Array(lo.a), xMin, indexFormat }
}

function untransformHmtx(t: Uint8Array, numH: number, numGlyphs: number, xMin: Int16Array): Uint8Array {
  const r = new Rd(t)
  const flags = r.u8()
  const adv = Array.from({ length: numH }, () => r.u16())
  const lsb = Array.from({ length: numH }, (_, i) => (flags & 1 ? xMin[i] : r.i16()))
  const rest = Array.from({ length: numGlyphs - numH }, (_, i) => (flags & 2 ? xMin[numH + i] : r.i16()))
  const o = new Out()
  adv.forEach((a, i) => { o.u16(a); o.u16(lsb[i]) })
  rest.forEach((v) => o.u16(v))
  return new Uint8Array(o.a)
}

export async function woff2Tables(b: Uint8Array): Promise<{ recs: TableRec[]; tables: Tables; flavor: string }> {
  if (!brotliSupported()) throw new Error('NO_BROTLI')
  const r = new Rd(b, 4)
  const flavor = r.u32()
  r.u32()
  const n = r.u16()
  r.u16()
  r.u32()
  const compSize = r.u32()
  r.p = 48
  if (flavor === 0x74746366) throw new Error('WOFF2 font collections are not supported')
  const dir: { tag: string; orig: number; len: number; xf: number }[] = []
  for (let i = 0; i < n; i++) {
    const fl = r.u8()
    const tag = (fl & 63) === 63 ? String.fromCharCode(...r.bytes(4)) : KNOWN[fl & 63]
    const xf = fl >> 6
    const orig = r.base128()
    const transformed = tag === 'glyf' || tag === 'loca' ? xf !== 3 : xf !== 0
    const len = transformed ? r.base128() : orig
    dir.push({ tag, orig, len, xf: transformed ? 1 : 0 })
  }
  const stream = new Response(new Blob([b.subarray(r.p, r.p + compSize) as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('brotli' as CompressionFormat)))
  const data = new Uint8Array(await stream.arrayBuffer())
  const raw = new Map<string, Uint8Array>()
  let p = 0
  for (const e of dir) {
    raw.set(e.tag, data.subarray(p, p + e.len))
    p += e.len
  }
  if (p > data.length) throw new Error('WOFF2 data is shorter than its table directory says')
  const xfOf = (t: string) => dir.find((e) => e.tag === t)?.xf ?? 0
  let xMin: Int16Array | null = null
  if (raw.has('glyf') && xfOf('glyf')) {
    const g = untransformGlyf(raw.get('glyf')!)
    raw.set('glyf', g.glyf)
    raw.set('loca', g.loca)
    xMin = g.xMin
  }
  if (raw.has('hmtx') && xfOf('hmtx')) {
    const hh = raw.get('hhea')!, mp = raw.get('maxp')!
    const numH = (hh[34] << 8) | hh[35], ng = (mp[4] << 8) | mp[5]
    raw.set('hmtx', untransformHmtx(raw.get('hmtx')!, numH, ng, xMin ?? new Int16Array(ng)))
  }
  const recs: TableRec[] = []
  const tables: Tables = new Map()
  for (const e of dir) {
    const v = raw.get(e.tag)!
    recs.push({ tag: e.tag, offset: 0, length: e.orig, checksum: 0 })
    tables.set(e.tag, new DataView(v.buffer, v.byteOffset, v.byteLength))
  }
  return { recs, tables, flavor: flavor === 0x4f54544f ? 'otf' : 'ttf' }
}
