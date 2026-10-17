import { describe, expect, it } from 'vitest'
import { aci, bulgePts, cleanText, parseDxf, sampleDxf, splinePts } from './dxf-viewer'

const wrap = (body: string) => `0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`

describe('dxf viewer parser', () => {
  it('parses the sample drawing', () => {
    const d = parseDxf(sampleDxf())
    expect(d.units).toBe('mm')
    expect(d.counts.INSERT).toBe(4)
    expect(d.counts.LWPOLYLINE).toBe(1)
    expect(d.layers.map((l) => l.name)).toContain('FASTENERS')
    expect(d.ext.x0).toBeCloseTo(0, 6)
    expect(d.ext.x1).toBeGreaterThanOrEqual(200)
    expect(Object.keys(d.skipped)).toHaveLength(0)
    // bolt block entities on layer 0 inherit the INSERT's layer
    expect(d.paths.filter((p) => p.layer === 'FASTENERS').length).toBe(12)
    expect(d.texts.some((t) => t.text === 'Ø60 THRU')).toBe(true)
  })
  it('bulge = 1 is a semicircle', () => {
    const pts = bulgePts([0, 0], [2, 0], 1)
    const mid = pts[Math.floor(pts.length / 2)]
    for (const p of pts) expect(Math.hypot(p[0] - 1, p[1])).toBeCloseTo(1, 9)
    expect(mid[1]).toBeLessThan(0) // positive bulge = counter-clockwise → passes below for a left-to-right chord
  })
  it('INSERT transform: scale, rotate, base point', () => {
    const blk = '0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n2\nB\n10\n1\n20\n0\n0\nLINE\n8\n0\n10\n1\n20\n0\n11\n2\n21\n0\n0\nENDBLK\n0\nENDSEC\n'
    const ins = '0\nINSERT\n8\nL1\n2\nB\n10\n10\n20\n10\n41\n2\n42\n2\n50\n90\n'
    const d = parseDxf(blk + wrap(ins))
    const p = d.paths[0]
    expect(p.layer).toBe('L1')
    expect(p.pts[0][0]).toBeCloseTo(10, 9)
    expect(p.pts[0][1]).toBeCloseTo(10, 9)
    expect(p.pts[1][0]).toBeCloseTo(10, 9)
    expect(p.pts[1][1]).toBeCloseTo(12, 9)
  })
  it('POLYLINE with VERTEX and closed flag; OCS mirror for arcs', () => {
    const poly = '0\nPOLYLINE\n8\nA\n66\n1\n70\n1\n0\nVERTEX\n8\nA\n10\n0\n20\n0\n0\nVERTEX\n8\nA\n10\n5\n20\n0\n0\nVERTEX\n8\nA\n10\n5\n20\n5\n0\nSEQEND\n'
    const arc = '0\nCIRCLE\n8\nA\n10\n3\n20\n0\n40\n1\n230\n-1\n'
    const d = parseDxf(wrap(poly + arc))
    expect(d.paths[0].closed).toBe(true)
    expect(d.paths[0].pts).toHaveLength(3)
    const xs = d.paths[1].pts.map((p) => p[0])
    expect(Math.min(...xs)).toBeCloseTo(-4, 6)
  })
  it('spline passes through clamped end points', () => {
    const s = splinePts([[0, 0], [1, 2], [3, 2], [4, 0]], 3, [])
    expect(s[0]).toEqual([0, 0])
    expect(s[s.length - 1][0]).toBeCloseTo(4, 6)
    expect(s[Math.floor(s.length / 2)][1]).toBeCloseTo(1.5, 6)
  })
  it('text cleanup and colours', () => {
    expect(cleanText('{\\fArial|b0;Hello}\\PWorld %%d')).toBe('Hello\nWorld °')
    expect(aci(1)).toBe('#ff0000')
    expect(aci(7, false)).toBe('#000000')
    expect(aci(10)).toBe('#ff0000')
    expect(aci(30)).toMatch(/^#ff[0-9a-f]{4}$/)
  })
  it('rejects binary/garbage', () => {
    expect(() => parseDxf('hello\nworld\n')).toThrow()
  })
})
