// HEIF / HEIC container parsing (ISO/IEC 23008-12 on top of the ISO base media file format).
// Written from the box definitions in the specs; no third-party code. Pixel decoding of the
// HEVC tiles happens in the browser (WebCodecs), this module only finds and describes them.

export interface Box { type: string; start: number; size: number; body: number; children?: Box[] }
export interface Extent { offset: number; length: number }
export interface Loc { method: number; base: number; extents: Extent[] }
export interface Item { id: number; type: string; name: string; hidden: boolean }
export interface HvcC { raw: Uint8Array; codec: string; lengthSize: number; profile: number; level: number; bitDepth: number; chroma: number }
export interface Props { hvcC?: HvcC; ispe?: [number, number]; irot?: number; imir?: number; colr?: string; pixi?: number[]; transforms: ('irot' | 'imir' | 'clap')[] }
export interface Grid { rows: number; cols: number; width: number; height: number }

export interface Heif {
  brands: string[]
  majorBrand: string
  primary: number
  items: Item[]
  props: Map<number, Props>
  refs: { type: string; from: number; to: number[] }[]
  locs: Map<number, Loc>
  idat: Uint8Array | null
  boxes: Box[]
}

export class HeifError extends Error {}

const fourcc = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])

class R {
  o: number
  b: Uint8Array
  end: number
  constructor(b: Uint8Array, start: number, end: number) {
    this.b = b
    this.o = start
    this.end = end
  }
  need(n: number) {
    if (this.o + n > this.end) throw new HeifError('Truncated box')
  }
  u8() { this.need(1); return this.b[this.o++] }
  u16() { this.need(2); const v = (this.b[this.o] << 8) | this.b[this.o + 1]; this.o += 2; return v }
  u32() { this.need(4); const v = ((this.b[this.o] << 24) >>> 0) + (this.b[this.o + 1] << 16) + (this.b[this.o + 2] << 8) + this.b[this.o + 3]; this.o += 4; return v }
  u64() { const hi = this.u32(), lo = this.u32(); return hi * 2 ** 32 + lo }
  un(n: number) { return n === 0 ? 0 : n === 1 ? this.u8() : n === 2 ? this.u16() : n === 4 ? this.u32() : n === 8 ? this.u64() : (() => { throw new HeifError(`Bad field size ${n}`) })() }
  str() { let s = ''; while (this.o < this.end) { const c = this.b[this.o++]; if (!c) break; s += String.fromCharCode(c) } return s }
  cc() { this.need(4); const s = fourcc(this.b, this.o); this.o += 4; return s }
}

const CONTAINERS = new Set(['meta', 'iprp', 'ipco', 'iinf', 'iref', 'dinf', 'moov', 'trak', 'mdia', 'minf'])

/** Reads a sequence of boxes in [start, end). Container boxes get children (meta/iinf/iref have FullBox headers). */
export function readBoxes(b: Uint8Array, start = 0, end = b.length, depth = 0): Box[] {
  const out: Box[] = []
  let o = start
  while (o + 8 <= end) {
    let size = new R(b, o, end).u32()
    const type = fourcc(b, o + 4)
    let body = o + 8
    if (size === 1) {
      size = new R(b, o + 8, end).u64()
      body = o + 16
    } else if (size === 0) size = end - o
    if (size < 8 || o + size > end) throw new HeifError(`Box “${type}” overruns the file`)
    const box: Box = { type, start: o, size, body }
    if (CONTAINERS.has(type) && depth < 6) {
      let cs = body
      if (type === 'meta' || type === 'iref') cs += 4
      if (type === 'iinf') {
        const v = b[body]
        cs += 4 + (v === 0 ? 2 : 4)
      }
      box.children = readBoxes(b, cs, o + size, depth + 1)
    }
    out.push(box)
    o += size
  }
  return out
}

const find = (bs: Box[] | undefined, t: string) => bs?.find((x) => x.type === t)

/** HEVC codec string (ISO/IEC 14496-15 Annex E), e.g. "hvc1.1.6.L93.B0". */
export function parseHvcC(raw: Uint8Array): HvcC {
  if (raw.length < 23) throw new HeifError('hvcC record too short')
  const ps = raw[1] >> 6, tier = (raw[1] >> 5) & 1, profile = raw[1] & 31
  const compat = ((raw[2] << 24) >>> 0) + (raw[3] << 16) + (raw[4] << 8) + raw[5]
  let rev = 0
  for (let i = 0; i < 32; i++) if (compat & (1 << i)) rev |= 1 << (31 - i)
  const cons = Array.from(raw.subarray(6, 12))
  while (cons.length && cons[cons.length - 1] === 0) cons.pop()
  const level = raw[12]
  const codec = ['hvc1', `${['', 'A', 'B', 'C'][ps]}${profile}`, (rev >>> 0).toString(16).toUpperCase(), `${tier ? 'H' : 'L'}${level}`, ...cons.map((c) => c.toString(16).toUpperCase())].join('.')
  return { raw, codec, lengthSize: (raw[21] & 3) + 1, profile, level, chroma: raw[16] & 3, bitDepth: (raw[17] & 7) + 8 }
}

/** Parses the HEIF meta box: items, locations, references, properties. */
export function parseHeif(b: Uint8Array): Heif {
  if (b.length < 16 || fourcc(b, 4) !== 'ftyp') throw new HeifError('Not an ISO media file (no ftyp box)')
  const boxes = readBoxes(b)
  const ftyp = boxes[0]
  const brands: string[] = []
  const majorBrand = fourcc(b, ftyp.body)
  for (let o = ftyp.body + 8; o + 4 <= ftyp.start + ftyp.size; o += 4) brands.push(fourcc(b, o))
  const meta = find(boxes, 'meta')
  if (!meta) throw new HeifError('No meta box: this is not a still-image HEIF file')
  const kids = meta.children ?? []
  const hdlr = find(kids, 'hdlr')
  if (hdlr && fourcc(b, hdlr.body + 8) !== 'pict') throw new HeifError(`Handler is “${fourcc(b, hdlr.body + 8)}”, not an image`)
  // pitm
  let primary = 0
  const pitm = find(kids, 'pitm')
  if (pitm) {
    const r = new R(b, pitm.body, pitm.start + pitm.size)
    primary = r.u8() === 0 ? (r.o += 3, r.u16()) : (r.o += 3, r.u32())
  }
  // iinf
  const items: Item[] = []
  for (const infe of find(kids, 'iinf')?.children ?? []) {
    if (infe.type !== 'infe') continue
    const r = new R(b, infe.body, infe.start + infe.size)
    const v = r.u8()
    const flags = (r.u8() << 16) | r.u16()
    if (v < 2) continue
    const id = v === 2 ? r.u16() : r.u32()
    r.u16()
    const type = r.cc()
    items.push({ id, type, name: r.str(), hidden: (flags & 1) === 1 })
  }
  // iloc
  const locs = new Map<number, Loc>()
  const iloc = find(kids, 'iloc')
  if (iloc) {
    const r = new R(b, iloc.body, iloc.start + iloc.size)
    const v = r.u8()
    r.o += 3
    const a = r.u8(), c = r.u8()
    const offSize = a >> 4, lenSize = a & 15, baseSize = c >> 4, idxSize = v === 1 || v === 2 ? c & 15 : 0
    const n = v < 2 ? r.u16() : r.u32()
    for (let i = 0; i < n; i++) {
      const id = v < 2 ? r.u16() : r.u32()
      const method = v === 1 || v === 2 ? r.u16() & 15 : 0
      r.u16() // data_reference_index
      const base = r.un(baseSize)
      const ec = r.u16()
      const extents: Extent[] = []
      for (let e = 0; e < ec; e++) {
        if (idxSize) r.un(idxSize)
        const offset = r.un(offSize)
        extents.push({ offset, length: r.un(lenSize) })
      }
      locs.set(id, { method, base, extents })
    }
  }
  // iref
  const refs: Heif['refs'] = []
  const iref = find(kids, 'iref')
  if (iref) {
    const v = b[iref.body]
    for (const rb of iref.children ?? []) {
      const r = new R(b, rb.body, rb.start + rb.size)
      const from = v === 0 ? r.u16() : r.u32()
      const cnt = r.u16()
      const to: number[] = []
      for (let i = 0; i < cnt; i++) to.push(v === 0 ? r.u16() : r.u32())
      refs.push({ type: rb.type, from, to })
    }
  }
  // iprp: ipco + ipma
  const props = new Map<number, Props>()
  const iprp = find(kids, 'iprp')
  const ipco = find(iprp?.children, 'ipco')?.children ?? []
  for (const ipma of iprp?.children?.filter((x) => x.type === 'ipma') ?? []) {
    const r = new R(b, ipma.body, ipma.start + ipma.size)
    const v = r.u8()
    const flags = (r.u8() << 16) | r.u16()
    const n = r.u32()
    for (let i = 0; i < n; i++) {
      const id = v < 1 ? r.u16() : r.u32()
      const cnt = r.u8()
      const p: Props = props.get(id) ?? { transforms: [] }
      for (let k = 0; k < cnt; k++) {
        const idx = flags & 1 ? r.u16() & 0x7fff : r.u8() & 0x7f
        const pb = ipco[idx - 1]
        if (!pb) continue
        const body = b.subarray(pb.body, pb.start + pb.size)
        if (pb.type === 'hvcC') p.hvcC = parseHvcC(body)
        else if (pb.type === 'ispe') {
          const q = new R(b, pb.body + 4, pb.start + pb.size)
          p.ispe = [q.u32(), q.u32()]
        } else if (pb.type === 'irot') {
          p.irot = body[0] & 3
          p.transforms.push('irot')
        } else if (pb.type === 'imir') {
          p.imir = body[0] & 1
          p.transforms.push('imir')
        } else if (pb.type === 'clap') p.transforms.push('clap')
        else if (pb.type === 'colr') {
          const kind = fourcc(b, pb.body)
          p.colr = kind === 'nclx' ? `nclx (primaries ${(body[4] << 8) | body[5]}, transfer ${(body[6] << 8) | body[7]}, matrix ${(body[8] << 8) | body[9]}, ${body[10] & 0x80 ? 'full' : 'limited'} range)` : kind === 'prof' || kind === 'rICC' ? `ICC profile (${body.length - 4} bytes)` : kind
        } else if (pb.type === 'pixi') p.pixi = Array.from(body.subarray(5, 5 + body[4]))
      }
      props.set(id, p)
    }
  }
  const idatBox = find(kids, 'idat')
  const idat = idatBox ? b.subarray(idatBox.body, idatBox.start + idatBox.size) : null
  if (!primary && items.length) primary = items[0].id
  return { brands, majorBrand, primary, items, props, refs, locs, idat, boxes }
}

/** Concatenates the extents of an item (file offsets or idat offsets). */
export function itemData(h: Heif, b: Uint8Array, id: number): Uint8Array {
  const loc = h.locs.get(id)
  if (!loc) throw new HeifError(`Item ${id} has no location`)
  const src = loc.method === 1 ? h.idat : b
  if (!src || loc.method > 1) throw new HeifError(`Item ${id} uses an unsupported construction method`)
  const parts = loc.extents.map((e) => {
    const off = loc.base + e.offset
    const len = e.length || src.length - off
    if (off + len > src.length) throw new HeifError(`Item ${id} points outside the file`)
    return src.subarray(off, off + len)
  })
  if (parts.length === 1) return parts[0]
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let k = 0
  for (const p of parts) {
    out.set(p, k)
    k += p.length
  }
  return out
}

export function parseGrid(d: Uint8Array): Grid {
  if (d.length < 8) throw new HeifError('Grid descriptor too short')
  const big = d[1] & 1
  const r = new R(d, 2, d.length)
  const rows = r.u8() + 1, cols = r.u8() + 1
  return { rows, cols, width: big ? r.u32() : r.u16(), height: big ? r.u32() : r.u16() }
}

export const refsFrom = (h: Heif, type: string, from: number) => h.refs.find((r) => r.type === type && r.from === from)?.to ?? []

export interface Plan {
  kind: 'hvc1' | 'grid' | 'other'
  id: number
  type: string
  width: number
  height: number
  grid?: Grid
  tiles: number[]
  hvcC?: HvcC
  rotation: number
  mirror: number | null
  exifId: number | null
  thumbId: number | null
  hasAlpha: boolean
  colr?: string
}

/** Works out what has to be decoded to get the primary image. */
export function plan(h: Heif, b: Uint8Array): Plan {
  const it = h.items.find((i) => i.id === h.primary)
  if (!it) throw new HeifError('Primary item not found')
  const p = h.props.get(it.id) ?? { transforms: [] }
  const exif = h.items.find((i) => i.type === 'Exif' && refsFrom(h, 'cdsc', i.id).includes(it.id)) ?? h.items.find((i) => i.type === 'Exif')
  const thumb = h.refs.find((r) => r.type === 'thmb' && r.to.includes(it.id))?.from ?? null
  const hasAlpha = h.refs.some((r) => r.type === 'auxl' && r.to.includes(it.id))
  const base = { id: it.id, type: it.type, rotation: p.irot ?? 0, mirror: p.imir ?? null, exifId: exif?.id ?? null, thumbId: thumb, hasAlpha, colr: p.colr }
  if (it.type === 'grid') {
    const grid = parseGrid(itemData(h, b, it.id))
    const tiles = refsFrom(h, 'dimg', it.id)
    if (tiles.length !== grid.rows * grid.cols) throw new HeifError(`Grid expects ${grid.rows * grid.cols} tiles, found ${tiles.length}`)
    const tp = h.props.get(tiles[0])
    return { ...base, kind: 'grid', width: grid.width, height: grid.height, grid, tiles, hvcC: tp?.hvcC }
  }
  if (it.type === 'hvc1') {
    const [w, hh] = p.ispe ?? [0, 0]
    return { ...base, kind: 'hvc1', width: w, height: hh, tiles: [it.id], hvcC: p.hvcC }
  }
  return { ...base, kind: 'other', width: p.ispe?.[0] ?? 0, height: p.ispe?.[1] ?? 0, tiles: [] }
}

/** The TIFF block inside a HEIF Exif item (skips the 4-byte header offset). */
export function exifTiff(d: Uint8Array): Uint8Array | null {
  if (d.length < 12) return null
  const off = ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0
  const t = d.subarray(4 + off)
  return (t[0] === 0x49 && t[1] === 0x49) || (t[0] === 0x4d && t[1] === 0x4d) ? t : null
}

/** EXIF orientation that displays like HEIF irot (anticlockwise quarter turns) without mirroring. */
export const orientationFor = (irot: number) => [1, 8, 3, 6][irot & 3]

/** Output size after the transforms (quarter turns swap width and height). */
export const rotatedSize = (w: number, h: number, irot: number): [number, number] => (irot & 1 ? [h, w] : [w, h])

// ---------- writer (demo files and tests) ----------

const u32b = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u16b = (n: number) => [(n >> 8) & 255, n & 255]
const ccb = (s: string) => [...s].map((c) => c.charCodeAt(0))
const box = (type: string, ...body: (number[] | Uint8Array)[]): number[] => {
  const flat = body.flatMap((x) => Array.from(x))
  return [...u32b(8 + flat.length), ...ccb(type), ...flat]
}
const full = (type: string, v: number, flags: number, ...body: (number[] | Uint8Array)[]) => box(type, [v, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...body)

export interface BuildOpts {
  hvcC: Uint8Array
  /** Length-prefixed HEVC access units, one per tile (row-major). */
  tiles: Uint8Array[]
  tileW: number
  tileH: number
  cols: number
  rows: number
  width: number
  height: number
  irot?: number
  imir?: number
  exif?: Uint8Array
}

/** Writes a minimal HEIC: one hvc1 item, or a grid of hvc1 tiles; optional irot/imir and Exif. */
export function buildHeif(o: BuildOpts): Uint8Array {
  const isGrid = o.tiles.length > 1
  const gridId = 1
  const tileIds = o.tiles.map((_, i) => (isGrid ? 2 + i : 1))
  const exifId = 100
  const infes: number[][] = []
  if (isGrid) infes.push(full('infe', 2, 0, u16b(gridId), u16b(0), ccb('grid'), ccb('Image'), [0]))
  tileIds.forEach((id) => infes.push(full('infe', 2, isGrid ? 1 : 0, u16b(id), u16b(0), ccb('hvc1'), [0])))
  if (o.exif) infes.push(full('infe', 2, 1, u16b(exifId), u16b(0), ccb('Exif'), [0]))
  const iinf = full('iinf', 0, 0, u16b(infes.length), ...infes)
  const gridData = [0, 0, o.rows - 1, o.cols - 1, ...u16b(o.width), ...u16b(o.height)]
  const exifData = o.exif ? [0, 0, 0, 0, ...o.exif] : []
  const primary = isGrid ? gridId : tileIds[0]
  // properties: 1 hvcC, 2 ispe tile, 3 ispe output, 4 irot, 5 imir
  const ipco = box('ipco', box('hvcC', o.hvcC), full('ispe', 0, 0, u32b(o.tileW), u32b(o.tileH)), full('ispe', 0, 0, u32b(o.width), u32b(o.height)), box('irot', [o.irot ?? 0]), box('imir', [o.imir ?? 0]))
  const assoc = (id: number, ps: number[]) => [...u16b(id), ps.length, ...ps]
  const transforms = [...(o.irot ? [4] : []), ...(o.imir !== undefined ? [5] : [])]
  const entries = isGrid ? [assoc(gridId, [3, ...transforms]), ...tileIds.map((id) => assoc(id, [0x81, 2]))] : [assoc(primary, [0x81, 2, ...transforms])]
  const ipma = full('ipma', 0, 0, u32b(entries.length), ...entries)
  const iref = isGrid || o.exif ? full('iref', 0, 0, ...(isGrid ? [box('dimg', u16b(gridId), u16b(tileIds.length), ...tileIds.map(u16b))] : []), ...(o.exif ? [box('cdsc', u16b(exifId), u16b(1), u16b(primary))] : [])) : []
  const idat = isGrid ? box('idat', gridData) : []
  const ftyp = box('ftyp', ccb('heic'), u32b(0), ccb('mif1'), ccb('heic'))
  // iloc offsets depend on meta size: compute with a placeholder first.
  const make = (mdatStart: number) => {
    const locItems: number[][] = []
    if (isGrid) locItems.push([...u16b(gridId), ...u16b(1), ...u16b(0), ...u16b(1), ...u32b(0), ...u32b(gridData.length)])
    let off = mdatStart + 8
    o.tiles.forEach((t, i) => {
      locItems.push([...u16b(tileIds[i]), ...u16b(0), ...u16b(0), ...u16b(1), ...u32b(off), ...u32b(t.length)])
      off += t.length
    })
    if (o.exif) locItems.push([...u16b(exifId), ...u16b(0), ...u16b(0), ...u16b(1), ...u32b(off), ...u32b(exifData.length)])
    const iloc = full('iloc', 1, 0, [0x44, 0x00], u16b(locItems.length), ...locItems)
    return full('meta', 0, 0, full('hdlr', 0, 0, u32b(0), ccb('pict'), u32b(0), u32b(0), u32b(0), [0]), full('pitm', 0, 0, u16b(primary)), iinf, iloc, iref, box('iprp', ipco, ipma), idat)
  }
  const meta = make(ftyp.length + make(0).length)
  const mdat = box('mdat', ...o.tiles, exifData)
  return new Uint8Array([...ftyp, ...meta, ...mdat])
}

/** Inserts an eXIf chunk (raw TIFF block) into a PNG right after IHDR. */
export function pngWithExif(png: Uint8Array, tiff: Uint8Array, crc32: (d: Uint8Array) => number): Uint8Array {
  if (png.length < 33 || png[1] !== 0x50) return png
  const ihdrEnd = 8 + 8 + ((png[8] << 24) | (png[9] << 16) | (png[10] << 8) | png[11]) + 4
  const typed = new Uint8Array(4 + tiff.length)
  typed.set([0x65, 0x58, 0x49, 0x66])
  typed.set(tiff, 4)
  const chunk = new Uint8Array(12 + tiff.length)
  chunk.set(u32b(tiff.length))
  chunk.set(typed, 4)
  chunk.set(u32b(crc32(typed)), 8 + tiff.length)
  const out = new Uint8Array(png.length + chunk.length)
  out.set(png.subarray(0, ihdrEnd))
  out.set(chunk, ihdrEnd)
  out.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length)
  return out
}
