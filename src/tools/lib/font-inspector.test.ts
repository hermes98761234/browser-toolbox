import { describe, expect, it } from 'vitest'
import { readIndex, runCharstring } from './font-inspector-cff'
import { demoFont } from './font-inspector-demo'
import { buildFont, featureLabel, parseFont, sfntTables, sniff, toPath, type Pt, type WGlyph } from './font-inspector'

const P = (x: number, y: number, on = true): Pt => ({ x, y, on })
const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [P(x0, y0), P(x0, y1), P(x1, y1), P(x1, y0)]
// a diamond-ish "O" made of four off-curve points only (all implied on-curve points)
const ring: Pt[] = [P(300, 0, false), P(0, 350, false), P(300, 700, false), P(600, 350, false)]

const GLYPHS: WGlyph[] = [
  { advance: 500, contours: [box(50, 0, 450, 700), box(100, 50, 400, 650)] }, // .notdef
  { advance: 250 }, // space
  { advance: 600, contours: [box(50, 0, 550, 700)] }, // I-ish block
  { advance: 650, contours: [ring] }, // O
  { advance: 650, components: [{ glyph: 3, dx: 0, dy: 0 }, { glyph: 2, dx: 250, dy: 750 }] }, // composite
]
const CMAP = new Map([[32, 1], [73, 2], [79, 3], [214, 4]])
const font = () => buildFont({ family: 'Test Sans', ascender: 800, descender: -200, xHeight: 500, capHeight: 700, glyphs: GLYPHS, cmap: CMAP, features: ['liga', 'ss01'] })

describe('font-inspector', () => {
  it('builds a valid sfnt with a correct checksum adjustment', () => {
    const b = font()
    expect(sniff(b)).toBe('ttf')
    let s = 0
    const d = new DataView(b.buffer)
    for (let i = 0; i < b.length; i += 4) s = (s + d.getUint32(i)) >>> 0
    expect(s).toBe(0xb1b0afba)
    expect(sfntTables(b).recs.map((r) => r.tag)).toContain('glyf')
  })

  it('reads name, head, hhea, OS/2, post and cmap', async () => {
    const f = await parseFont(font())
    expect(f.names[1]).toBe('Test Sans')
    expect(f.names[4]).toBe('Test Sans Regular')
    expect(f.head.unitsPerEm).toBe(1000)
    expect(f.hhea?.ascender).toBe(800)
    expect(f.os2?.capHeight).toBe(700)
    expect(f.os2?.weight).toBe(400)
    expect(f.post?.underlineThickness).toBe(50)
    expect(f.numGlyphs).toBe(5)
    expect(f.cmap.get(73)).toBe(2)
    expect(f.cmap.get(79)).toBe(3)
    expect(f.cmap.get(214)).toBe(4)
    expect(f.cmap.has(65)).toBe(false)
    expect([...f.adv]).toEqual([500, 250, 600, 650, 650])
  })

  it('decodes simple and composite glyf outlines', async () => {
    const f = await parseFont(font())
    const g = f.glyph(2)!
    expect(g.contours[0].map((p) => [p.x, p.y])).toEqual([[50, 0], [50, 700], [550, 700], [550, 0]])
    expect(toPath(g)).toBe('M50 0L50 700L550 700L550 0Z')
    const o = f.glyph(3)!
    // only off-curve points: start at the midpoint between last and first
    expect(toPath(o).startsWith('M450 175Q300 0 150 175')).toBe(true)
    expect(f.glyph(1)).toBeNull()
    const c = f.glyph(4)!
    expect(c.composite).toEqual([3, 2])
    expect(c.contours).toHaveLength(2)
    expect(c.contours[1][0]).toEqual({ x: 300, y: 750, on: true })
  })

  it('lists GSUB feature tags', async () => {
    const f = await parseFont(font())
    expect(f.gsub?.scripts).toEqual(['DFLT'])
    expect(f.gsub?.features).toEqual(['liga', 'ss01'])
    expect(featureLabel('ss07')).toBe('Stylistic set 7')
    expect(featureLabel('liga')).toBe('Standard ligatures')
  })

  it('reads WOFF (zlib-compressed tables)', async () => {
    const ttf = font()
    const { recs } = sfntTables(ttf)
    const parts: { tag: string; data: Uint8Array; orig: number; cs: number }[] = []
    for (const r of recs) {
      const raw = ttf.slice(r.offset, r.offset + r.length)
      const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer())
      parts.push({ tag: r.tag, data: z.length < raw.length ? z : raw, orig: raw.length, cs: r.checksum })
    }
    let off = 44 + parts.length * 20
    const offs = parts.map((p) => {
      const o = off
      off += (p.data.length + 3) & ~3
      return o
    })
    const out = new Uint8Array(off)
    const d = new DataView(out.buffer)
    out.set([0x77, 0x4f, 0x46, 0x46], 0)
    d.setUint32(4, 0x10000)
    d.setUint32(8, off)
    d.setUint16(12, parts.length)
    parts.forEach((p, i) => {
      const o = 44 + i * 20
      for (let k = 0; k < 4; k++) out[o + k] = p.tag.charCodeAt(k)
      d.setUint32(o + 4, offs[i])
      d.setUint32(o + 8, p.data.length)
      d.setUint32(o + 12, p.orig)
      d.setUint32(o + 16, p.cs)
      out.set(p.data, offs[i])
    })
    expect(sniff(out)).toBe('woff')
    const f = await parseFont(out)
    expect(f.format).toContain('WOFF')
    expect(f.names[1]).toBe('Test Sans')
    expect(toPath(f.glyph(2)!)).toBe('M50 0L50 700L550 700L550 0Z')
  })

  it('reads WOFF2 (one Brotli stream, null-transformed tables)', async () => {
    const ttf = font()
    const { recs } = sfntTables(ttf)
    const KNOWN: Record<string, number> = { cmap: 0, head: 1, hhea: 2, hmtx: 3, maxp: 4, name: 5, 'OS/2': 6, post: 7, glyf: 10, loca: 11, GSUB: 28 }
    const dir: number[] = []
    const b128 = (v: number) => (v < 128 ? [v] : [0x80 | (v >> 7), v & 127])
    for (const r of recs) dir.push(KNOWN[r.tag] | (r.tag === 'glyf' || r.tag === 'loca' ? 0xc0 : 0), ...b128(r.length))
    const body = new Uint8Array(recs.reduce((a, r) => a + r.length, 0))
    let p = 0
    for (const r of recs) {
      body.set(ttf.subarray(r.offset, r.offset + r.length), p)
      p += r.length
    }
    const z = new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream('brotli' as CompressionFormat))).arrayBuffer())
    const out = new Uint8Array(48 + dir.length + z.length)
    const d = new DataView(out.buffer)
    out.set([0x77, 0x4f, 0x46, 0x32])
    d.setUint32(4, 0x10000)
    d.setUint32(8, out.length)
    d.setUint16(12, recs.length)
    d.setUint32(20, z.length)
    out.set(dir, 48)
    out.set(z, 48 + dir.length)
    const f = await parseFont(out)
    expect(f.format).toBe('WOFF2 (TrueType)')
    expect(f.names[4]).toBe('Test Sans Regular')
    expect(f.glyph(4)!.composite).toEqual([3, 2])
  })

  it('interprets Type 2 charstrings with hints and subroutines', () => {
    const sub = new Uint8Array([139, 239, 5, 11])
    const code = new Uint8Array([139, 149, 1, 19, 0x80, 149, 159, 21, 239, 139, 5, 32, 10, 109, 139, 99, 119, 109, 59, 8, 14])
    const o = runCharstring(code, [], [sub])
    expect(o.d).toBe('M10 20L110 20L110 120C80 120 40 100 10 20Z')
    expect(o.contours[0].filter((q) => !q.on)).toHaveLength(2)
    expect([o.xMin, o.yMin, o.xMax, o.yMax]).toEqual([10, 20, 110, 120])
    // INDEX with 2 items: count=2, offSize=1, offsets 1,3,4
    const idx = readIndex(new Uint8Array([0, 2, 1, 1, 3, 4, 7, 8, 9]), 0)
    expect(idx.items.map((x) => [...x])).toEqual([[7, 8], [9]])
    expect(idx.end).toBe(9)
  })

  it('generates a usable demo font', async () => {
    const f = await parseFont(demoFont())
    expect(f.names[1]).toBe('Toolbox Grotesk Demo')
    expect(f.cmap.get(97)).toBe(f.cmap.get(65))
    const o = f.glyph(f.cmap.get(79)!)!
    expect(o.contours).toHaveLength(2)
    expect(o.yMax).toBeGreaterThan(700)
    expect(f.glyph(f.cmap.get(214)!)!.composite).toHaveLength(3)
  })

  it('rejects non-fonts', async () => {
    await expect(parseFont(new Uint8Array(20))).rejects.toThrow(/Not a font/)
  })
})
