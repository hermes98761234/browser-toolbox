import { describe, expect, it } from 'vitest'
import { decodeHybrid, decodeStruct, encodeHybrid, encodeStruct, readMeta, readTable, sampleColumns, snappyCompress, snappyDecompress, writeParquet, type Codec, type WColumn } from './columnar-file-reader'

describe('snappy', () => {
  it('decodes a hand-made block with literal and overlapping copy', () => {
    // length 10; literal "ab"; copy-1 len 8 offset 2 → "ababababab"
    const blk = Uint8Array.from([10, 1 << 2, 97, 98, ((8 - 4) << 2) | 1, 2])
    expect(new TextDecoder().decode(snappyDecompress(blk))).toBe('ababababab')
  })
  it('round-trips random and repetitive data', () => {
    const txt = new TextEncoder().encode('the quick brown fox '.repeat(200) + 'xyz'.repeat(9))
    const c = snappyCompress(txt)
    expect(c.length).toBeLessThan(txt.length / 4)
    expect(snappyDecompress(c)).toEqual(txt)
    const rnd = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7919 + (i >> 3) * 31) & 255)
    expect(snappyDecompress(snappyCompress(rnd))).toEqual(rnd)
  })
})

describe('thrift compact + hybrid', () => {
  it('round-trips a struct with big field-id gaps, lists and negatives', () => {
    const b = encodeStruct([[1, 'i32', -5], [2, 'bin', 'hi'], [20, 'i64', 2 ** 40], [21, 'list', { et: 'i32', items: Array.from({ length: 20 }, (_, i) => i - 3) }], [22, 'bool', true], [23, 'struct', [[1, 'double', 1.5]]]])
    const { s } = decodeStruct(b)
    expect(s[1]).toBe(-5)
    expect(new TextDecoder().decode(s[2] as Uint8Array)).toBe('hi')
    expect(s[20]).toBe(2 ** 40)
    expect((s[21] as number[])[0]).toBe(-3)
    expect((s[21] as number[]).length).toBe(20)
    expect(s[22]).toBe(true)
    expect((s[23] as Record<number, number>)[1]).toBe(1.5)
  })
  it('RLE/bit-packed hybrid round-trips mixed runs', () => {
    const vals = [...Array(20).fill(3), 1, 2, 3, 4, 5, 6, 7, 0, 1, ...Array(9).fill(0), 5, 6]
    const enc = encodeHybrid(vals, 3)
    expect(Array.from(decodeHybrid(enc, 0, enc.length, 3, vals.length))).toEqual(vals)
  })
  it('decodes a spec example: bit-packed 0..7 with width 3', () => {
    // header (1<<1)|1 = 3, then values 0..7 packed LSB-first: 10001000 11000110 11111010
    const b = Uint8Array.from([3, 0b10001000, 0b11000110, 0b11111010])
    expect(Array.from(decodeHybrid(b, 0, b.length, 3, 8))).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
})

const cols: WColumn[] = [
  { name: 'id', type: 'int64', values: [1, 2, 3, 4, 5, 9007199254740991] },
  { name: 'n', type: 'int32', values: [-1, 0, null, 2147483647, -2147483648, 7] },
  { name: 'x', type: 'double', values: [1.5, null, -0.25, 1e300, 0, 3.14159] },
  { name: 's', type: 'string', values: ['alpha', 'béta', null, 'alpha', '', 'γάμμα'] },
  { name: 'b', type: 'bool', values: [true, false, true, null, false, true] },
  { name: 'd', type: 'date', values: ['2024-02-29', '1970-01-01', '1969-12-31', null, '2000-01-01', '2038-01-19'] },
  { name: 't', type: 'timestamp', values: ['2024-02-29 12:34:56', null, '1970-01-01 00:00:00', '2001-09-09 01:46:40', '1999-12-31 23:59:59', '2020-06-01 08:00:00'] },
]
const expected = [
  [1, -1, 1.5, 'alpha', 1, '2024-02-29', '2024-02-29 12:34:56'],
  [2, 0, null, 'béta', 0, '1970-01-01', null],
  [3, null, -0.25, null, 1, '1969-12-31', '1970-01-01 00:00:00'],
  [4, 2147483647, 1e300, 'alpha', null, null, '2001-09-09 01:46:40'],
  [5, -2147483648, 0, '', 0, '2000-01-01', '1999-12-31 23:59:59'],
  [9007199254740991, 7, 3.14159, 'γάμμα', 1, '2038-01-19', '2020-06-01 08:00:00'],
]

describe('parquet write → read round trips', () => {
  for (const codec of ['UNCOMPRESSED', 'SNAPPY', 'GZIP'] as Codec[]) {
    for (const pageVersion of [1, 2] as const) {
      for (const dictionary of [true, false]) {
        it(`${codec} v${pageVersion} dict=${dictionary}`, async () => {
          const buf = await writeParquet(cols, { codec, pageVersion, dictionary, rowGroupRows: 4 })
          const meta = readMeta(buf)
          expect(meta.numRows).toBe(6)
          expect(meta.rowGroups.length).toBe(2)
          expect(meta.columns.map((c) => c.name)).toEqual(cols.map((c) => c.name))
          expect(meta.columns.find((c) => c.name === 'id')!.optional).toBe(false)
          expect(meta.columns.find((c) => c.name === 'n')!.optional).toBe(true)
          expect(meta.columns.find((c) => c.name === 't')!.logical).toMatchObject({ kind: 'timestamp', unit: 'ms' })
          const r = await readTable(buf, meta)
          expect(r.errors).toEqual([])
          expect(r.rows).toEqual(expected)
        })
      }
    }
  }

  it('reads the generated sample', async () => {
    const sc = sampleColumns(300)
    const buf = await writeParquet(sc, { rowGroupRows: 128 })
    const meta = readMeta(buf)
    expect(meta.rowGroups.length).toBe(3)
    const r = await readTable(buf, meta)
    expect(r.rows.length).toBe(300)
    expect(r.rows[0][0]).toBe(100000)
    expect(r.rows.map((x) => x[4])).toEqual(sc[4].values)
    expect(meta.rowGroups[0].chunks[9].nullCount).toBe(sc[9].values.slice(0, 128).filter((v) => v === null).length)
  })

  it('reports unsupported codecs instead of failing silently', async () => {
    const buf = await writeParquet(cols.slice(0, 2), { codec: 'UNCOMPRESSED' })
    // patch the codec field in the footer: re-encode is complex, so flip the byte for "codec = 0" in column metadata
    const meta = readMeta(buf)
    const tampered = await readTable(buf, { ...meta, rowGroups: meta.rowGroups.map((g) => ({ ...g, chunks: g.chunks.map((c) => ({ ...c, codec: 6 })) })) })
    expect(tampered.columns.length).toBe(0)
    expect(tampered.errors[0]).toMatch(/ZSTD compression is not supported/)
  })

  it('rejects non-parquet input', () => {
    expect(() => readMeta(new TextEncoder().encode('a,b,c\n1,2,3\n'))).toThrow(/Not a Parquet/)
  })
})
