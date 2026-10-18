import { describe, expect, it } from 'vitest'
import { buildHeif, exifTiff, pngWithExif, HeifError, itemData, orientationFor, parseHeif, parseHvcC, plan, readBoxes, rotatedSize } from './heic-converter'
import { parseTiff, writeTiff } from './exif-viewer'

// HEVCDecoderConfigurationRecord: Main profile, compat flags 0x60000000, constraint 0xB0, level 93 (3.1), 4-byte NAL lengths, no arrays.
const hvcC = new Uint8Array([1, 0x01, 0x60, 0, 0, 0, 0xb0, 0, 0, 0, 0, 0, 93, 0xf0, 0, 0xfc, 0xfd, 0xf8, 0xf8, 0, 0, 0x0f, 0])
const tile = (n: number) => new Uint8Array([0, 0, 0, 4, 0x26, 0x01, n, n])

describe('hvcC', () => {
  it('builds the RFC 6381 codec string', () => {
    const h = parseHvcC(hvcC)
    expect(h.codec).toBe('hvc1.1.6.L93.B0')
    expect(h.lengthSize).toBe(4)
    expect(h.bitDepth).toBe(8)
    expect(h.chroma).toBe(1)
  })
  it('handles profile space, high tier and long constraints', () => {
    const r = hvcC.slice()
    r[1] = 0x80 | 0x20 | 2 // space 2 (B), high tier, profile 2
    r[2] = 0x20; r[3] = 0; r[4] = 0; r[5] = 0
    r[6] = 0x90; r[7] = 0; r[8] = 0x01
    r[12] = 120
    expect(parseHvcC(r).codec).toBe('hvc1.B2.4.H120.90.0.1')
  })
})

describe('container', () => {
  const exif = writeTiff([{ id: 0x0112, type: 3, value: [6] }], [{ id: 0x9003, type: 2, value: '2026:05:04 10:11:12' }])
  const file = buildHeif({ hvcC, tiles: [tile(1), tile(2), tile(3), tile(4)], tileW: 512, tileH: 512, cols: 2, rows: 2, width: 1000, height: 900, irot: 3, exif })

  it('reads the box tree', () => {
    const bs = readBoxes(file)
    expect(bs.map((b) => b.type)).toEqual(['ftyp', 'meta', 'mdat'])
    expect(bs[1].children!.map((b) => b.type)).toEqual(['hdlr', 'pitm', 'iinf', 'iloc', 'iref', 'iprp', 'idat'])
  })
  it('parses items, properties and the grid', () => {
    const h = parseHeif(file)
    expect(h.majorBrand).toBe('heic')
    expect(h.brands).toEqual(['mif1', 'heic'])
    expect(h.primary).toBe(1)
    expect(h.items.map((i) => i.type)).toEqual(['grid', 'hvc1', 'hvc1', 'hvc1', 'hvc1', 'Exif'])
    expect(h.items[1].hidden).toBe(true)
    const p = plan(h, file)
    expect(p.kind).toBe('grid')
    expect(p.grid).toEqual({ rows: 2, cols: 2, width: 1000, height: 900 })
    expect(p.tiles).toEqual([2, 3, 4, 5])
    expect(p.hvcC?.codec).toBe('hvc1.1.6.L93.B0')
    expect(h.props.get(2)?.ispe).toEqual([512, 512])
    expect(p.rotation).toBe(3)
    expect(rotatedSize(p.width, p.height, p.rotation)).toEqual([900, 1000])
    expect(orientationFor(p.rotation)).toBe(6)
    expect(Array.from(itemData(h, file, 4))).toEqual(Array.from(tile(3)))
  })
  it('extracts the Exif TIFF block', () => {
    const h = parseHeif(file)
    const p = plan(h, file)
    const t = exifTiff(itemData(h, file, p.exifId!))!
    const tags = parseTiff(t)
    expect(tags.find((x) => x.id === 0x9003)?.value).toBe('2026:05:04 10:11:12')
  })
  it('handles a single-image file with mirroring', () => {
    const f = buildHeif({ hvcC, tiles: [tile(9)], tileW: 64, tileH: 48, cols: 1, rows: 1, width: 64, height: 48, imir: 1 })
    const h = parseHeif(f)
    const p = plan(h, f)
    expect(p.kind).toBe('hvc1')
    expect([p.width, p.height]).toEqual([64, 48])
    expect(p.mirror).toBe(1)
    expect(p.exifId).toBeNull()
    expect(h.props.get(1)?.transforms).toEqual(['imir'])
  })
  it('rejects non-HEIF data', () => {
    expect(() => parseHeif(new Uint8Array(32))).toThrow(HeifError)
    const cut = file.slice(0, 60)
    expect(() => parseHeif(cut)).toThrow(HeifError)
  })
})

describe('pngWithExif', () => {
  it('adds an eXIf chunk after IHDR', async () => {
    const { crc32 } = await import('./image-compressor')
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, ...new Array(13).fill(1), 0, 0, 0, 0, 0, 0, 0, 0, 73, 69, 78, 68, 0xae, 0x42, 0x60, 0x82])
    const out = pngWithExif(png, new Uint8Array([0x49, 0x49, 42, 0]), crc32)
    expect(out.length).toBe(png.length + 16)
    expect(String.fromCharCode(...out.subarray(37, 41))).toBe('eXIf')
    expect(String.fromCharCode(...out.subarray(53, 57))).toBe('IEND')
  })
})
