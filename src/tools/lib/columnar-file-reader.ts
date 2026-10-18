// Minimal Apache Parquet reader and writer written from the format specification:
// Thrift compact protocol footer, row groups, column chunks, data pages v1/v2, PLAIN / dictionary /
// RLE-bit-packed hybrid / DELTA_* / BYTE_STREAM_SPLIT encodings, nullable flat columns,
// UNCOMPRESSED / SNAPPY (own codec) / GZIP (DecompressionStream). Nested and repeated columns are reported, not read.

export type Value = number | string | null

export class ParquetError extends Error {}

// ---------------------------------------------------------------- Thrift compact protocol (decode)

type TVal = boolean | number | bigint | Uint8Array | TStruct | TVal[] | Map<TVal, TVal>
export type TStruct = { [id: number]: TVal }

class TReader {
  b: Uint8Array
  pos: number
  constructor(b: Uint8Array, pos = 0) { this.b = b; this.pos = pos }
  byte() {
    if (this.pos >= this.b.length) throw new ParquetError('Unexpected end of Thrift data')
    return this.b[this.pos++]
  }
  varint(): number {
    let r = 0, mul = 1, x: number
    do { x = this.byte(); r += (x & 127) * mul; mul *= 128 } while (x & 128)
    return r
  }
  varbig(): bigint {
    let r = 0n, sh = 0n, x: number
    do { x = this.byte(); r |= BigInt(x & 127) << sh; sh += 7n } while (x & 128)
    return r
  }
  zz(): number { const v = this.varint(); return v % 2 ? -(v + 1) / 2 : v / 2 }
  zz64(): bigint | number {
    const v = this.varbig()
    const r = v & 1n ? -((v + 1n) >> 1n) : v >> 1n
    return r >= BigInt(Number.MIN_SAFE_INTEGER) && r <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(r) : r
  }
  value(t: number): TVal {
    switch (t) {
      case 1: return true
      case 2: return false
      case 3: return (this.byte() << 24) >> 24
      case 4: case 5: return this.zz()
      case 6: return this.zz64()
      case 7: { const dv = new DataView(this.b.buffer, this.b.byteOffset + this.pos, 8); this.pos += 8; return dv.getFloat64(0, true) }
      case 8: { const n = this.varint(); const s = this.b.subarray(this.pos, this.pos + n); this.pos += n; return s }
      case 9: case 10: {
        const h = this.byte()
        let n = h >> 4
        if (n === 15) n = this.varint()
        const et = h & 15
        const out: TVal[] = []
        for (let i = 0; i < n; i++) out.push(et === 1 || et === 2 ? this.byte() === 1 : this.value(et))
        return out
      }
      case 11: {
        const n = this.varint()
        const m = new Map<TVal, TVal>()
        if (n) {
          const kv = this.byte()
          for (let i = 0; i < n; i++) m.set(this.value(kv >> 4), this.value(kv & 15))
        }
        return m
      }
      case 12: return this.struct()
      default: throw new ParquetError(`Bad Thrift type ${t}`)
    }
  }
  struct(): TStruct {
    const o: TStruct = {}
    let last = 0
    for (;;) {
      const h = this.byte()
      if (h === 0) return o
      const d = h >> 4
      const id = d ? last + d : this.zz()
      last = id
      o[id] = this.value(h & 15)
    }
  }
}

// ---------------------------------------------------------------- Thrift compact protocol (encode)

type WT = 'bool' | 'i32' | 'i64' | 'double' | 'bin' | 'list' | 'struct'
export type WField = [id: number, t: WT, v: unknown]
const TCODE: Record<WT, number> = { bool: 1, i32: 5, i64: 6, double: 7, bin: 8, list: 9, struct: 12 }

class TWriter {
  out: number[] = []
  varint(v: number) { while (v >= 128) { this.out.push((v % 128) | 128); v = Math.floor(v / 128) } this.out.push(v) }
  zz(v: number) { this.varint(v >= 0 ? v * 2 : -v * 2 - 1) }
  bytes(b: Uint8Array) { for (const x of b) this.out.push(x) }
  value(t: WT, v: unknown) {
    if (t === 'i32' || t === 'i64') this.zz(v as number)
    else if (t === 'double') { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v as number, true); this.bytes(b) }
    else if (t === 'bin') { const b = typeof v === 'string' ? new TextEncoder().encode(v) : (v as Uint8Array); this.varint(b.length); this.bytes(b) }
    else if (t === 'struct') this.struct(v as WField[])
    else if (t === 'list') {
      const { et, items } = v as { et: WT; items: unknown[] }
      const n = items.length
      this.out.push((n < 15 ? n << 4 : 0xf0) | TCODE[et])
      if (n >= 15) this.varint(n)
      for (const it of items) if (et === 'bool') this.out.push(it ? 1 : 2); else this.value(et, it)
    }
  }
  struct(fields: WField[]) {
    let last = 0
    for (const [id, t, v] of fields) {
      if (v === undefined) continue
      const code = t === 'bool' ? (v ? 1 : 2) : TCODE[t]
      const d = id - last
      if (d > 0 && d <= 15) this.out.push((d << 4) | code)
      else { this.out.push(code); this.zz(id) }
      last = id
      if (t !== 'bool') this.value(t, v)
    }
    this.out.push(0)
  }
}

export function encodeStruct(fields: WField[]): Uint8Array { const w = new TWriter(); w.struct(fields); return Uint8Array.from(w.out) }
export function decodeStruct(b: Uint8Array, pos = 0): { s: TStruct; end: number } { const r = new TReader(b, pos); const s = r.struct(); return { s, end: r.pos } }

// ---------------------------------------------------------------- Snappy

/** Decompresses a raw Snappy block (no framing). */
export function snappyDecompress(src: Uint8Array): Uint8Array {
  let p = 0, len = 0, sh = 0, x: number
  do { x = src[p++]; len += (x & 127) * 2 ** sh; sh += 7 } while (x & 128)
  const out = new Uint8Array(len)
  let o = 0
  while (p < src.length) {
    const tag = src[p++]
    const kind = tag & 3
    if (kind === 0) {
      let n = tag >> 2
      if (n >= 60) { const k = n - 59; n = 0; for (let i = 0; i < k; i++) n += src[p++] * 2 ** (8 * i) }
      n += 1
      if (p + n > src.length || o + n > len) throw new ParquetError('Corrupt Snappy literal')
      out.set(src.subarray(p, p + n), o)
      p += n; o += n
      continue
    }
    let n: number, off: number
    if (kind === 1) { n = ((tag >> 2) & 7) + 4; off = ((tag >> 5) << 8) | src[p++] }
    else if (kind === 2) { n = (tag >> 2) + 1; off = src[p] | (src[p + 1] << 8); p += 2 }
    else { n = (tag >> 2) + 1; off = (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16)) + src[p + 3] * 2 ** 24; p += 4 }
    if (off === 0 || off > o || o + n > len) throw new ParquetError('Corrupt Snappy copy')
    for (let i = 0; i < n; i++, o++) out[o] = out[o - off]
  }
  if (o !== len) throw new ParquetError('Snappy length mismatch')
  return out
}

/** Simple greedy Snappy compressor (hash of 4-byte sequences, 2-byte offset copies). */
export function snappyCompress(src: Uint8Array): Uint8Array {
  const out: number[] = []
  let v = src.length
  while (v >= 128) { out.push((v % 128) | 128); v = Math.floor(v / 128) }
  out.push(v)
  const lit = (a: number, b: number) => {
    const n = b - a
    if (!n) return
    const m = n - 1
    if (m < 60) out.push(m << 2)
    else if (m < 256) out.push(60 << 2, m)
    else if (m < 65536) out.push(61 << 2, m & 255, m >> 8)
    else if (m < 1 << 24) out.push(62 << 2, m & 255, (m >> 8) & 255, m >> 16)
    else out.push(63 << 2, m & 255, (m >> 8) & 255, (m >> 16) & 255, m >>> 24)
    for (let i = a; i < b; i++) out.push(src[i])
  }
  const table = new Int32Array(1 << 14).fill(-1)
  const u32 = (i: number) => (src[i] | (src[i + 1] << 8) | (src[i + 2] << 16) | (src[i + 3] << 24)) >>> 0
  let i = 0, start = 0
  while (i + 4 <= src.length) {
    const h = Math.imul(u32(i), 0x1e35a7bd) >>> 18
    const c = table[h]
    table[h] = i
    if (c >= 0 && i - c <= 65535 && u32(c) === u32(i)) {
      lit(start, i)
      let n = 4
      while (i + n < src.length && n < 64 && src[c + n] === src[i + n]) n++
      const off = i - c
      out.push(((n - 1) << 2) | 2, off & 255, off >> 8)
      i += n
      start = i
    } else i++
  }
  lit(start, src.length)
  return Uint8Array.from(out)
}

// ---------------------------------------------------------------- codecs

export const CODECS = ['UNCOMPRESSED', 'SNAPPY', 'GZIP', 'LZO', 'BROTLI', 'LZ4', 'ZSTD', 'LZ4_RAW'] as const
export type Codec = (typeof CODECS)[number]

async function streamBytes(data: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(t as unknown as TransformStream<Uint8Array<ArrayBuffer>, Uint8Array>)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function decompress(codec: number, data: Uint8Array, size: number): Promise<Uint8Array> {
  if (codec === 0) return data
  if (codec === 1) return snappyDecompress(data)
  if (codec === 2) {
    if (typeof DecompressionStream === 'undefined') throw new ParquetError('GZIP needs DecompressionStream, which this browser lacks')
    try { return await streamBytes(data, new DecompressionStream('gzip')) } catch { return streamBytes(data, new DecompressionStream('deflate')) }
  }
  void size
  throw new ParquetError(`${CODECS[codec] ?? `codec #${codec}`} compression is not supported by this reader (supported: UNCOMPRESSED, SNAPPY, GZIP)`)
}

async function compress(codec: Codec, data: Uint8Array): Promise<Uint8Array> {
  if (codec === 'UNCOMPRESSED') return data
  if (codec === 'SNAPPY') return snappyCompress(data)
  if (codec === 'GZIP') return streamBytes(data, new CompressionStream('gzip'))
  throw new ParquetError(`Writer does not support ${codec}`)
}

// ---------------------------------------------------------------- bit-level helpers

const bitWidth = (max: number) => (max <= 0 ? 0 : 32 - Math.clz32(max))

/** RLE / bit-packed hybrid decoder; reads `count` values starting at `pos` (stops at `end`). */
export function decodeHybrid(b: Uint8Array, pos: number, end: number, w: number, count: number): Int32Array {
  const out = new Int32Array(count)
  let k = 0
  const vb = (w + 7) >> 3
  while (k < count && pos < end) {
    let h = 0, mul = 1, x: number
    do { x = b[pos++]; h += (x & 127) * mul; mul *= 128 } while (x & 128)
    if (h & 1) {
      const n = (h >>> 1) * 8
      let bit = pos * 8
      for (let i = 0; i < n; i++) {
        let v = 0
        for (let j = 0; j < w; j++, bit++) if (b[bit >> 3] & (1 << (bit & 7))) v |= 1 << j
        if (k < count) out[k++] = v
      }
      pos += (h >>> 1) * w
    } else {
      const n = h >>> 1
      let v = 0
      for (let i = 0; i < vb; i++) v |= b[pos++] << (8 * i)
      for (let i = 0; i < n && k < count; i++) out[k++] = v
    }
  }
  if (k < count) throw new ParquetError('RLE data ended early')
  return out
}

/** RLE / bit-packed hybrid encoder (RLE for runs of ≥ 8 equal values, bit-packed groups otherwise). */
export function encodeHybrid(vals: ArrayLike<number>, w: number): Uint8Array {
  const out: number[] = []
  const varint = (v: number) => { while (v >= 128) { out.push((v & 127) | 128); v >>>= 7 } out.push(v) }
  const run = (i: number) => { let j = i; while (j < vals.length && vals[j] === vals[i]) j++; return j - i }
  const vb = (w + 7) >> 3
  let i = 0
  while (i < vals.length) {
    const r = run(i)
    if (r >= 8 || w === 0) {
      varint(r << 1)
      for (let k = 0; k < vb; k++) out.push((vals[i] >> (8 * k)) & 255)
      i += r
      continue
    }
    const start = i
    let groups = 0
    do { i += 8; groups++ } while (i < vals.length && groups < 63 && run(i) < 8)
    varint((groups << 1) | 1)
    const bytes = new Uint8Array(groups * w)
    let bit = 0
    for (let k = start; k < start + groups * 8; k++) {
      const v = k < vals.length ? vals[k] : 0
      for (let j = 0; j < w; j++, bit++) if ((v >> j) & 1) bytes[bit >> 3] |= 1 << (bit & 7)
    }
    for (const x of bytes) out.push(x)
  }
  return Uint8Array.from(out)
}

class Cursor {
  b: Uint8Array
  pos: number
  constructor(b: Uint8Array, pos = 0) { this.b = b; this.pos = pos }
  varint(): number { let r = 0, mul = 1, x: number; do { x = this.b[this.pos++]; r += (x & 127) * mul; mul *= 128 } while (x & 128); return r }
  varbig(): bigint { let r = 0n, sh = 0n, x: number; do { x = this.b[this.pos++]; r |= BigInt(x & 127) << sh; sh += 7n } while (x & 128); return r }
  zzbig(): bigint { const v = this.varbig(); return v & 1n ? -((v + 1n) >> 1n) : v >> 1n }
}

/** DELTA_BINARY_PACKED decoder (values as bigint). */
function deltaBinary(c: Cursor): bigint[] {
  const block = c.varint(), minis = c.varint(), total = c.varint()
  const perMini = block / minis
  let last = c.zzbig()
  const out: bigint[] = total ? [last] : []
  while (out.length < total) {
    const minDelta = c.zzbig()
    const widths = Array.from(c.b.subarray(c.pos, c.pos + minis))
    c.pos += minis
    for (const w of widths) {
      if (out.length >= total) break
      let bit = c.pos * 8
      for (let i = 0; i < perMini; i++) {
        let v = 0n
        for (let j = 0; j < w; j++, bit++) if (c.b[bit >> 3] & (1 << (bit & 7))) v |= 1n << BigInt(j)
        if (out.length < total) { last += minDelta + v; out.push(last) }
      }
      c.pos += (perMini * w) / 8
    }
  }
  return out
}

// ---------------------------------------------------------------- schema

export const PHYSICAL = ['BOOLEAN', 'INT32', 'INT64', 'INT96', 'FLOAT', 'DOUBLE', 'BYTE_ARRAY', 'FIXED_LEN_BYTE_ARRAY'] as const
const ENCODINGS: Record<number, string> = { 0: 'PLAIN', 2: 'PLAIN_DICTIONARY', 3: 'RLE', 4: 'BIT_PACKED', 5: 'DELTA_BINARY_PACKED', 6: 'DELTA_LENGTH_BYTE_ARRAY', 7: 'DELTA_BYTE_ARRAY', 8: 'RLE_DICTIONARY', 9: 'BYTE_STREAM_SPLIT' }
const CONVERTED = ['UTF8', 'MAP', 'MAP_KEY_VALUE', 'LIST', 'ENUM', 'DECIMAL', 'DATE', 'TIME_MILLIS', 'TIME_MICROS', 'TIMESTAMP_MILLIS', 'TIMESTAMP_MICROS', 'UINT_8', 'UINT_16', 'UINT_32', 'UINT_64', 'INT_8', 'INT_16', 'INT_32', 'INT_64', 'JSON', 'BSON', 'INTERVAL']

export type Logical =
  | { kind: 'string' | 'json' | 'enum' | 'date' | 'uuid' | 'bson' | 'float16' | 'none' }
  | { kind: 'decimal'; scale: number; precision: number }
  | { kind: 'timestamp' | 'time'; unit: 'ms' | 'us' | 'ns'; utc: boolean }
  | { kind: 'int'; bits: number; signed: boolean }

export interface ColumnInfo {
  name: string
  path: string
  physical: (typeof PHYSICAL)[number]
  typeLength: number
  optional: boolean
  logical: Logical
  /** SQL type used for the query engine. */
  sqlType: 'INTEGER' | 'REAL' | 'TEXT' | 'BOOLEAN'
  supported: boolean
  reason?: string
}

export interface ChunkInfo { path: string; codec: number; encodings: string[]; numValues: number; compressed: number; uncompressed: number; dictOffset?: number; dataOffset: number; nullCount?: number }
export interface RowGroupInfo { numRows: number; bytes: number; chunks: ChunkInfo[] }
export interface ParquetMeta { version: number; numRows: number; createdBy: string; columns: ColumnInfo[]; rowGroups: RowGroupInfo[]; kv: [string, string][]; footerBytes: number; size: number }

const td = new TextDecoder()
const str = (v: TVal | undefined) => (v instanceof Uint8Array ? td.decode(v) : '')
const n = (v: TVal | undefined, d = 0) => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : d)
const st = (v: TVal | undefined) => (v && typeof v === 'object' && !(v instanceof Uint8Array) && !Array.isArray(v) && !(v instanceof Map) ? (v as TStruct) : undefined)
const arr = (v: TVal | undefined) => (Array.isArray(v) ? v : [])

function logicalOf(el: TStruct): Logical {
  const lt = st(el[10])
  if (lt) {
    if (lt[1]) return { kind: 'string' }
    if (lt[4]) return { kind: 'enum' }
    if (lt[5]) { const d = st(lt[5])!; return { kind: 'decimal', scale: n(d[1]), precision: n(d[2]) } }
    if (lt[6]) return { kind: 'date' }
    if (lt[7] || lt[8]) {
      const t = st(lt[7] ?? lt[8])!
      const u = st(t[2]) ?? {}
      return { kind: lt[7] ? 'time' : 'timestamp', utc: t[1] === true, unit: u[1] ? 'ms' : u[2] ? 'us' : 'ns' }
    }
    if (lt[10]) { const i = st(lt[10])!; return { kind: 'int', bits: n(i[1]), signed: i[2] === true } }
    if (lt[12]) return { kind: 'json' }
    if (lt[13]) return { kind: 'bson' }
    if (lt[14]) return { kind: 'uuid' }
    if (lt[15]) return { kind: 'float16' }
  }
  const c = el[6] === undefined ? -1 : n(el[6])
  const name = CONVERTED[c]
  if (name === 'UTF8') return { kind: 'string' }
  if (name === 'ENUM') return { kind: 'enum' }
  if (name === 'JSON') return { kind: 'json' }
  if (name === 'DATE') return { kind: 'date' }
  if (name === 'DECIMAL') return { kind: 'decimal', scale: n(el[7]), precision: n(el[8]) }
  if (name === 'TIMESTAMP_MILLIS' || name === 'TIMESTAMP_MICROS') return { kind: 'timestamp', unit: name.endsWith('MILLIS') ? 'ms' : 'us', utc: true }
  if (name === 'TIME_MILLIS' || name === 'TIME_MICROS') return { kind: 'time', unit: name.endsWith('MILLIS') ? 'ms' : 'us', utc: true }
  if (name?.startsWith('UINT_') || name?.startsWith('INT_')) return { kind: 'int', bits: Number(name.split('_')[1]), signed: name.startsWith('INT') }
  return { kind: 'none' }
}

export function logicalLabel(c: ColumnInfo): string {
  const l = c.logical
  if (l.kind === 'none') return c.physical === 'FIXED_LEN_BYTE_ARRAY' ? `FIXED_LEN_BYTE_ARRAY(${c.typeLength})` : c.physical
  if (l.kind === 'decimal') return `DECIMAL(${l.precision},${l.scale})`
  if (l.kind === 'timestamp' || l.kind === 'time') return `${l.kind.toUpperCase()}(${l.unit}${l.utc ? ', UTC' : ''})`
  if (l.kind === 'int') return `${l.signed ? '' : 'U'}INT${l.bits}`
  return l.kind.toUpperCase()
}

/** Parses the footer (FileMetaData) of a Parquet file. */
export function readMeta(buf: Uint8Array): ParquetMeta {
  const magic = (o: number) => td.decode(buf.subarray(o, o + 4))
  if (buf.length < 12 || magic(0) !== 'PAR1') throw new ParquetError('Not a Parquet file (missing PAR1 header)')
  if (magic(buf.length - 4) === 'PARE') throw new ParquetError('This Parquet file uses encrypted footers, which are not supported')
  if (magic(buf.length - 4) !== 'PAR1') throw new ParquetError('Truncated Parquet file (missing PAR1 footer)')
  const flen = new DataView(buf.buffer, buf.byteOffset + buf.length - 8, 4).getUint32(0, true)
  if (flen <= 0 || flen > buf.length - 12) throw new ParquetError('Corrupt footer length')
  const fm = new TReader(buf, buf.length - 8 - flen).struct()
  const schema = arr(fm[2]).map((x) => st(x)!)
  const columns: ColumnInfo[] = []
  // walk the schema tree: depth-first, root first
  let idx = 1
  const walk = (prefix: string[], top: boolean, inherited: string | undefined) => {
    const el = schema[idx++]
    const name = str(el[4])
    const rep = n(el[3])
    const kids = n(el[5])
    const path = [...prefix, name]
    if (kids > 0) {
      for (let i = 0; i < kids; i++) walk(path, false, inherited ?? `nested group "${path.join('.')}"`)
      return
    }
    const physical = PHYSICAL[n(el[1])] ?? 'BYTE_ARRAY'
    const logical = logicalOf(el)
    const reason = inherited ? `Inside ${inherited} — nested types are not supported` : rep === 2 ? 'Repeated (list) column — nested types are not supported' : !top ? 'Nested column' : undefined
    const sqlType = physical === 'BOOLEAN' ? 'BOOLEAN'
      : logical.kind === 'decimal' || physical === 'FLOAT' || physical === 'DOUBLE' || logical.kind === 'float16' ? 'REAL'
      : (physical === 'INT32' || physical === 'INT64') && !['date', 'timestamp', 'time'].includes(logical.kind) ? 'INTEGER' : 'TEXT'
    columns.push({ name, path: path.join('.'), physical, typeLength: n(el[2]), optional: rep === 1, logical, sqlType, supported: !reason, reason })
  }
  const rootKids = n(schema[0]?.[5])
  for (let i = 0; i < rootKids; i++) walk([], true, undefined)
  const rowGroups: RowGroupInfo[] = arr(fm[4]).map((rgv) => {
    const rg = st(rgv)!
    return {
      numRows: n(rg[3]), bytes: n(rg[2]),
      chunks: arr(rg[1]).map((ccv) => {
        const cc = st(ccv)!
        if (cc[1]) throw new ParquetError('Column chunks stored in external files are not supported')
        const md = st(cc[3])
        if (!md) throw new ParquetError('Column chunk without metadata (encrypted column?) is not supported')
        const stats = st(md[12])
        return {
          path: arr(md[3]).map((p) => str(p)).join('.'), codec: n(md[4]), encodings: arr(md[2]).map((e) => ENCODINGS[n(e)] ?? `#${n(e)}`),
          numValues: n(md[5]), uncompressed: n(md[6]), compressed: n(md[7]), dataOffset: n(md[9]), dictOffset: md[11] === undefined ? undefined : n(md[11]),
          nullCount: stats?.[3] === undefined ? undefined : n(stats[3]),
        }
      }),
    }
  })
  return {
    version: n(fm[1]), numRows: n(fm[3]), createdBy: str(fm[6]), columns, rowGroups,
    kv: arr(fm[5]).map((k) => { const s = st(k)!; return [str(s[1]), str(s[2])] as [string, string] }),
    footerBytes: flen, size: buf.length,
  }
}

// ---------------------------------------------------------------- value decoding

type Raw = boolean | number | bigint | Uint8Array

function decodePlain(b: Uint8Array, pos: number, count: number, col: ColumnInfo): { vals: Raw[]; end: number } {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const vals: Raw[] = new Array(count)
  switch (col.physical) {
    case 'BOOLEAN': for (let i = 0; i < count; i++) vals[i] = !!(b[pos + (i >> 3)] & (1 << (i & 7))); return { vals, end: pos + ((count + 7) >> 3) }
    case 'INT32': for (let i = 0; i < count; i++, pos += 4) vals[i] = dv.getInt32(pos, true); break
    case 'INT64': for (let i = 0; i < count; i++, pos += 8) vals[i] = dv.getBigInt64(pos, true); break
    case 'INT96': for (let i = 0; i < count; i++, pos += 12) vals[i] = b.subarray(pos, pos + 12); break
    case 'FLOAT': for (let i = 0; i < count; i++, pos += 4) vals[i] = dv.getFloat32(pos, true); break
    case 'DOUBLE': for (let i = 0; i < count; i++, pos += 8) vals[i] = dv.getFloat64(pos, true); break
    case 'BYTE_ARRAY':
      for (let i = 0; i < count; i++) { const L = dv.getUint32(pos, true); vals[i] = b.subarray(pos + 4, pos + 4 + L); pos += 4 + L }
      break
    case 'FIXED_LEN_BYTE_ARRAY': for (let i = 0; i < count; i++, pos += col.typeLength) vals[i] = b.subarray(pos, pos + col.typeLength); break
  }
  if (pos > b.length) throw new ParquetError(`PLAIN data for "${col.name}" is shorter than expected`)
  return { vals, end: pos }
}

function decodeValues(enc: number, b: Uint8Array, pos: number, count: number, col: ColumnInfo, dict: Raw[] | null): Raw[] {
  if (enc === 0) return decodePlain(b, pos, count, col).vals
  if (enc === 2 || enc === 8) {
    if (!dict) throw new ParquetError('Dictionary-encoded page without a dictionary page')
    const w = b[pos]
    const ix = decodeHybrid(b, pos + 1, b.length, w, count)
    return Array.from(ix, (i) => { if (i >= dict.length) throw new ParquetError('Dictionary index out of range'); return dict[i] })
  }
  if (enc === 3 && col.physical === 'BOOLEAN') {
    const L = new DataView(b.buffer, b.byteOffset + pos, 4).getUint32(0, true)
    return Array.from(decodeHybrid(b, pos + 4, pos + 4 + L, 1, count), (v) => v === 1)
  }
  if (enc === 5 && (col.physical === 'INT32' || col.physical === 'INT64')) {
    const v = deltaBinary(new Cursor(b, pos))
    return col.physical === 'INT32' ? v.map((x) => Number(BigInt.asIntN(32, x))) : v.map((x) => BigInt.asIntN(64, x))
  }
  if (enc === 6 && col.physical === 'BYTE_ARRAY') {
    const c = new Cursor(b, pos)
    const lens = deltaBinary(c)
    let p = c.pos
    return lens.map((L) => { const s = b.subarray(p, p + Number(L)); p += Number(L); return s })
  }
  if (enc === 7 && (col.physical === 'BYTE_ARRAY' || col.physical === 'FIXED_LEN_BYTE_ARRAY')) {
    const c = new Cursor(b, pos)
    const pre = deltaBinary(c)
    const lens = deltaBinary(c)
    let p = c.pos
    let prev = new Uint8Array(0)
    return pre.map((pl, i) => {
      const suf = b.subarray(p, p + Number(lens[i]))
      p += Number(lens[i])
      const v = new Uint8Array(Number(pl) + suf.length)
      v.set(prev.subarray(0, Number(pl)))
      v.set(suf, Number(pl))
      prev = v
      return v
    })
  }
  if (enc === 9) {
    const width = col.physical === 'FLOAT' || col.physical === 'INT32' ? 4 : col.physical === 'DOUBLE' || col.physical === 'INT64' ? 8 : col.physical === 'FIXED_LEN_BYTE_ARRAY' ? col.typeLength : 0
    if (!width) throw new ParquetError('BYTE_STREAM_SPLIT on an unsupported type')
    const tmp = new Uint8Array(count * width)
    for (let i = 0; i < count; i++) for (let k = 0; k < width; k++) tmp[i * width + k] = b[pos + k * count + i]
    return decodePlain(tmp, 0, count, col).vals
  }
  throw new ParquetError(`${ENCODINGS[enc] ?? `Encoding #${enc}`} is not supported for ${col.physical}`)
}

const pad = (x: number, w = 2) => String(x).padStart(w, '0')
function fmtTime(ms: number, withDate: boolean): string {
  const d = new Date(ms)
  if (!Number.isFinite(d.getTime())) return String(ms)
  const frac = d.getUTCMilliseconds()
  const t = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${frac ? `.${pad(frac, 3)}` : ''}`
  return withDate ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${t}` : t
}

function beInt(b: Uint8Array): bigint {
  let v = 0n
  for (const x of b) v = (v << 8n) | BigInt(x)
  return b.length && b[0] & 0x80 ? v - (1n << BigInt(b.length * 8)) : v
}

function half(h: number): number {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023
  return e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024)
}

const fatal = new TextDecoder('utf-8', { fatal: true })
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

/** Converts a raw physical value to an SQL value following the logical type. */
export function convert(v: Raw, col: ColumnInfo): Value {
  const l = col.logical
  if (typeof v === 'boolean') return v ? 1 : 0
  if (l.kind === 'decimal') {
    const big = typeof v === 'number' ? BigInt(v) : typeof v === 'bigint' ? v : beInt(v)
    return Number(big) / 10 ** l.scale
  }
  if (l.kind === 'date') return fmtTime(Number(v) * 86400000, true).slice(0, 10)
  if (l.kind === 'timestamp' || l.kind === 'time') {
    const big = typeof v === 'bigint' ? v : BigInt(v as number)
    const ms = l.unit === 'ms' ? Number(big) : l.unit === 'us' ? Number(big / 1000n) + Number(big % 1000n) / 1000 : Number(big / 1000000n)
    return fmtTime(ms, l.kind === 'timestamp')
  }
  if (typeof v === 'number') return l.kind === 'int' && !l.signed && l.bits === 32 ? v >>> 0 : v
  if (typeof v === 'bigint') return l.kind === 'int' && !l.signed ? Number(BigInt.asUintN(64, v)) : Number(v)
  // byte arrays
  if (col.physical === 'INT96') {
    const dv = new DataView(v.buffer, v.byteOffset, 12)
    const nanos = dv.getBigUint64(0, true), day = dv.getUint32(8, true)
    return fmtTime((day - 2440588) * 86400000 + Number(nanos / 1000000n), true)
  }
  if (l.kind === 'uuid' && v.length === 16) { const h = hex(v); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` }
  if (l.kind === 'float16' && v.length === 2) return half(v[0] | (v[1] << 8))
  if (l.kind === 'string' || l.kind === 'json' || l.kind === 'enum') return td.decode(v)
  try { return fatal.decode(v) } catch { return `0x${hex(v)}` }
}

// ---------------------------------------------------------------- column / table reading

async function readChunk(buf: Uint8Array, ch: ChunkInfo, col: ColumnInfo): Promise<Value[]> {
  const start = ch.dictOffset !== undefined && ch.dictOffset > 0 && ch.dictOffset < ch.dataOffset ? ch.dictOffset : ch.dataOffset
  const end = Math.min(buf.length, start + ch.compressed)
  const maxDef = col.optional ? 1 : 0
  const out: Value[] = []
  let dict: Raw[] | null = null
  let pos = start
  while (pos < end && out.length < ch.numValues) {
    const r = new TReader(buf, pos)
    const ph = r.struct()
    const type = n(ph[1]), usize = n(ph[2]), csize = n(ph[3])
    const body = buf.subarray(r.pos, r.pos + csize)
    pos = r.pos + csize
    if (type === 2) {
      const dh = st(ph[7])!
      const data = await decompress(ch.codec, body, usize)
      dict = decodePlain(data, 0, n(dh[1]), col).vals
      continue
    }
    let defs: Int32Array | null = null
    let values: Uint8Array, vpos: number, enc: number, count: number
    if (type === 0) {
      const dh = st(ph[5])!
      count = n(dh[1]); enc = n(dh[2])
      values = await decompress(ch.codec, body, usize)
      vpos = 0
      if (maxDef) {
        if (n(dh[3]) !== 3) throw new ParquetError('Legacy BIT_PACKED definition levels are not supported')
        const L = new DataView(values.buffer, values.byteOffset, 4).getUint32(0, true)
        defs = decodeHybrid(values, 4, 4 + L, 1, count)
        vpos = 4 + L
      }
    } else if (type === 3) {
      const dh = st(ph[8])!
      count = n(dh[1]); enc = n(dh[4])
      const dl = n(dh[5]), rl = n(dh[6])
      if (maxDef) defs = decodeHybrid(body, rl, rl + dl, 1, count)
      const rest = body.subarray(rl + dl)
      values = dh[7] === false ? rest : await decompress(ch.codec, rest, usize - rl - dl)
      vpos = 0
    } else continue // index pages etc.
    const present = defs ? defs.reduce((a, d) => a + (d === maxDef ? 1 : 0), 0) : count
    const raw = present ? decodeValues(enc, values, vpos, present, col, dict) : []
    let k = 0
    for (let i = 0; i < count; i++) out.push(!defs || defs[i] === maxDef ? convert(raw[k++], col) : null)
  }
  return out
}

export interface ReadResult { columns: ColumnInfo[]; rows: Value[][]; errors: string[]; truncated: boolean }

/** Reads all supported flat columns; failed columns are dropped and reported in `errors`. */
export async function readTable(buf: Uint8Array, meta: ParquetMeta, maxRows = 200000): Promise<ReadResult> {
  const errors: string[] = []
  const cols = meta.columns.filter((c) => c.supported)
  for (const c of meta.columns) if (!c.supported) errors.push(`Skipped "${c.path}": ${c.reason}`)
  const data: Value[][] = cols.map(() => [])
  const failed = new Set<number>()
  let rowsRead = 0
  for (const rg of meta.rowGroups) {
    if (rowsRead >= maxRows) break
    for (let j = 0; j < cols.length; j++) {
      if (failed.has(j)) continue
      const ch = rg.chunks.find((c) => c.path === cols[j].path)
      try {
        if (!ch) throw new ParquetError('column chunk missing')
        const vals = await readChunk(buf, ch, cols[j])
        if (vals.length !== rg.numRows) throw new ParquetError(`expected ${rg.numRows} values, got ${vals.length}`)
        data[j].push(...vals)
      } catch (e) {
        failed.add(j)
        errors.push(`Column "${cols[j].path}": ${(e as Error).message}`)
      }
    }
    rowsRead += rg.numRows
  }
  const keep = cols.map((_, j) => j).filter((j) => !failed.has(j))
  const total = Math.min(rowsRead, maxRows)
  const rows: Value[][] = []
  for (let i = 0; i < total; i++) rows.push(keep.map((j) => data[j][i] ?? null))
  return { columns: keep.map((j) => cols[j]), rows, errors, truncated: meta.numRows > total }
}

// ---------------------------------------------------------------- writer

export type WType = 'int32' | 'int64' | 'double' | 'string' | 'bool' | 'date' | 'timestamp'
export interface WColumn { name: string; type: WType; values: (number | string | boolean | null)[] }
export interface WOptions { codec?: Codec; dictionary?: boolean; pageVersion?: 1 | 2; rowGroupRows?: number; createdBy?: string }

const PHYS: Record<WType, number> = { int32: 1, int64: 2, double: 5, string: 6, bool: 0, date: 1, timestamp: 2 }

function plainEncode(t: WType, vals: (number | string | boolean)[]): Uint8Array {
  if (t === 'bool') {
    const b = new Uint8Array((vals.length + 7) >> 3)
    vals.forEach((v, i) => { if (v) b[i >> 3] |= 1 << (i & 7) })
    return b
  }
  if (t === 'string') {
    const parts = vals.map((v) => new TextEncoder().encode(String(v)))
    const b = new Uint8Array(parts.reduce((a, p) => a + 4 + p.length, 0))
    const dv = new DataView(b.buffer)
    let p = 0
    for (const x of parts) { dv.setUint32(p, x.length, true); b.set(x, p + 4); p += 4 + x.length }
    return b
  }
  const w = PHYS[t] === 1 ? 4 : 8
  const b = new Uint8Array(vals.length * w)
  const dv = new DataView(b.buffer)
  vals.forEach((v, i) => {
    if (t === 'int32') dv.setInt32(i * 4, Number(v), true)
    else if (t === 'date') dv.setInt32(i * 4, typeof v === 'string' ? Math.round(Date.parse(`${v}T00:00:00Z`) / 86400000) : Number(v), true)
    else if (t === 'int64') dv.setBigInt64(i * 8, BigInt(Math.trunc(Number(v))), true)
    else if (t === 'timestamp') dv.setBigInt64(i * 8, BigInt(typeof v === 'string' ? Date.parse(v.includes('Z') ? v : `${v.replace(' ', 'T')}Z`) : Number(v)), true)
    else dv.setFloat64(i * 8, Number(v), true)
  })
  return b
}

function schemaEl(c: WColumn, optional: boolean): WField[] {
  const logical: WField[] | undefined = c.type === 'string' ? [[1, 'struct', []]] : c.type === 'date' ? [[6, 'struct', []]]
    : c.type === 'timestamp' ? [[8, 'struct', [[1, 'bool', true], [2, 'struct', [[1, 'struct', []]]]]]] : undefined
  const conv = c.type === 'string' ? 0 : c.type === 'date' ? 6 : c.type === 'timestamp' ? 9 : undefined
  return [[1, 'i32', PHYS[c.type]], [3, 'i32', optional ? 1 : 0], [4, 'bin', c.name], [6, 'i32', conv], [10, 'struct', logical]]
}

/** Writes a Parquet file with flat columns (one page per column chunk). */
export async function writeParquet(cols: WColumn[], o: WOptions = {}): Promise<Uint8Array> {
  const codec = o.codec ?? 'SNAPPY', v2 = o.pageVersion === 2, dictOn = o.dictionary ?? true
  const rows = cols[0]?.values.length ?? 0
  if (cols.some((c) => c.values.length !== rows)) throw new ParquetError('All columns need the same length')
  const per = Math.max(1, o.rowGroupRows ?? rows)
  const optional = cols.map((c) => c.values.some((v) => v === null))
  const parts: Uint8Array[] = [new TextEncoder().encode('PAR1')]
  let offset = 4
  const push = (b: Uint8Array) => { parts.push(b); offset += b.length }
  const rowGroups: WField[][] = []
  for (let r0 = 0; r0 < rows || (r0 === 0 && rows === 0); r0 += per) {
    const r1 = Math.min(rows, r0 + per)
    const chunks: WField[][] = []
    let rgBytes = 0
    for (let j = 0; j < cols.length; j++) {
      const c = cols[j]
      const slice = c.values.slice(r0, r1)
      const present = slice.filter((v) => v !== null) as (number | string | boolean)[]
      const defs = slice.map((v) => (v === null ? 0 : 1))
      const start = offset
      let usum = 0, csum = 0
      let dictOffset: number | undefined
      let enc = 0
      let valueBytes: Uint8Array
      if (dictOn && c.type === 'string' && present.length) {
        const keys = [...new Set(present.map(String))]
        const index = new Map(keys.map((k, i) => [k, i]))
        const dplain = plainEncode('string', keys)
        const dcomp = await compress(codec, dplain)
        const dh = encodeStruct([[1, 'i32', 2], [2, 'i32', dplain.length], [3, 'i32', dcomp.length], [7, 'struct', [[1, 'i32', keys.length], [2, 'i32', 0]]]])
        dictOffset = offset
        push(dh); push(dcomp)
        usum += dh.length + dplain.length; csum += dh.length + dcomp.length
        const w = Math.max(1, bitWidth(keys.length - 1))
        const ix = encodeHybrid(present.map((v) => index.get(String(v))!), w)
        valueBytes = new Uint8Array(1 + ix.length)
        valueBytes[0] = w
        valueBytes.set(ix, 1)
        enc = 8
      } else valueBytes = plainEncode(c.type, present)
      const dataOffset = offset
      let header: Uint8Array, payload: Uint8Array, usize: number
      if (!v2) {
        let body = valueBytes
        if (optional[j]) {
          const lv = encodeHybrid(defs, 1)
          body = new Uint8Array(4 + lv.length + valueBytes.length)
          new DataView(body.buffer).setUint32(0, lv.length, true)
          body.set(lv, 4)
          body.set(valueBytes, 4 + lv.length)
        }
        payload = await compress(codec, body)
        usize = body.length
        header = encodeStruct([[1, 'i32', 0], [2, 'i32', usize], [3, 'i32', payload.length], [5, 'struct', [[1, 'i32', slice.length], [2, 'i32', enc], [3, 'i32', 3], [4, 'i32', 3]]]])
      } else {
        const lv = optional[j] ? encodeHybrid(defs, 1) : new Uint8Array(0)
        const cv = await compress(codec, valueBytes)
        payload = new Uint8Array(lv.length + cv.length)
        payload.set(lv)
        payload.set(cv, lv.length)
        usize = lv.length + valueBytes.length
        header = encodeStruct([[1, 'i32', 3], [2, 'i32', usize], [3, 'i32', payload.length], [8, 'struct', [[1, 'i32', slice.length], [2, 'i32', slice.length - present.length], [3, 'i32', slice.length], [4, 'i32', enc], [5, 'i32', lv.length], [6, 'i32', 0], [7, 'bool', codec !== 'UNCOMPRESSED']]]])
      }
      push(header); push(payload)
      usum += header.length + usize; csum += header.length + payload.length
      rgBytes += usum
      const encs = dictOffset !== undefined ? [0, 3, 8] : [0, 3]
      chunks.push([[2, 'i64', start], [3, 'struct', [
        [1, 'i32', PHYS[c.type]], [2, 'list', { et: 'i32', items: encs }], [3, 'list', { et: 'bin', items: [c.name] }], [4, 'i32', CODECS.indexOf(codec)],
        [5, 'i64', slice.length], [6, 'i64', usum], [7, 'i64', csum], [9, 'i64', dataOffset], [11, 'i64', dictOffset],
        [12, 'struct', [[3, 'i64', slice.length - present.length]]],
      ]]])
    }
    rowGroups.push([[1, 'list', { et: 'struct', items: chunks }], [2, 'i64', rgBytes], [3, 'i64', r1 - r0]])
    if (rows === 0) break
  }
  const footer = encodeStruct([
    [1, 'i32', v2 ? 2 : 1],
    [2, 'list', { et: 'struct', items: [[[4, 'bin', 'schema'], [5, 'i32', cols.length]] as WField[], ...cols.map((c, j) => schemaEl(c, optional[j]))] }],
    [3, 'i64', rows],
    [4, 'list', { et: 'struct', items: rowGroups }],
    [6, 'bin', o.createdBy ?? 'browser-toolbox columnar-file-reader'],
  ])
  push(footer)
  const tail = new Uint8Array(8)
  new DataView(tail.buffer).setUint32(0, footer.length, true)
  tail.set(new TextEncoder().encode('PAR1'), 4)
  push(tail)
  const out = new Uint8Array(offset)
  let p = 0
  for (const b of parts) { out.set(b, p); p += b.length }
  return out
}

// ---------------------------------------------------------------- sample data

/** Deterministic sample: an online shop's order lines. */
export function sampleColumns(rows = 600): WColumn[] {
  let seed = 42
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const regions = ['North', 'South', 'East', 'West', 'Central']
  const products: [string, number][] = [['Desk lamp', 34.9], ['Notebook A5', 4.5], ['Mechanical keyboard', 89], ['USB-C cable', 9.99], ['Monitor stand', 45], ['Office chair', 189], ['Headphones', 129], ['Webcam', 59.5]]
  const cols: WColumn[] = [
    { name: 'order_id', type: 'int64', values: [] }, { name: 'order_date', type: 'date', values: [] }, { name: 'created_at', type: 'timestamp', values: [] },
    { name: 'region', type: 'string', values: [] }, { name: 'product', type: 'string', values: [] }, { name: 'units', type: 'int32', values: [] },
    { name: 'unit_price', type: 'double', values: [] }, { name: 'discount', type: 'double', values: [] }, { name: 'paid', type: 'bool', values: [] },
    { name: 'coupon', type: 'string', values: [] },
  ]
  const t0 = Date.UTC(2025, 0, 1)
  for (let i = 0; i < rows; i++) {
    const ms = t0 + Math.floor((i / rows) * 365 * 86400000 + rnd() * 80000000)
    const [p, price] = products[Math.floor(rnd() * products.length)]
    const vals = [
      100000 + i * 7, new Date(ms).toISOString().slice(0, 10), new Date(ms).toISOString().slice(0, 19).replace('T', ' '),
      regions[Math.floor(rnd() ** 1.4 * regions.length)], p, 1 + Math.floor(rnd() ** 2 * 6), price,
      rnd() < 0.3 ? null : Math.round(rnd() * 20) / 100, rnd() > 0.06, rnd() < 0.8 ? null : ['WELCOME10', 'SPRING', 'VIP'][Math.floor(rnd() * 3)],
    ]
    cols.forEach((c, j) => c.values.push(vals[j]))
  }
  return cols
}
