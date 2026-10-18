import { describe, expect, it } from 'vitest'
import * as lib from 'pdf-lib'
import { applyFields, buildXmp, demoPdf, EMPTY, isoToPdf, lint, pdfToIso, readMeta, writeMeta, type Meta } from './pdf-metadata-editor'

describe('pdf metadata editor', () => {
  it('converts dates both ways', () => {
    expect(isoToPdf('2024-03-11T09:30:12+01:00')).toBe("D:20240311093012+01'00'")
    expect(isoToPdf('2024-03-11T09:30Z')).toBe('D:20240311093000Z')
    expect(isoToPdf('2024-03-11')).toBe('D:20240311000000')
    expect(isoToPdf('nope')).toBe('')
    expect(pdfToIso("D:20240311093012+01'00'")).toBe('2024-03-11T09:30:12+01:00')
    expect(pdfToIso('D:2024')).toBe('2024-01-01T00:00:00')
    expect(pdfToIso(isoToPdf('2023-12-31T23:59:59-05:30'))).toBe('2023-12-31T23:59:59-05:30')
  })
  it('builds an XMP packet mirroring Info', () => {
    const x = buildXmp({ ...EMPTY, title: 'A & B', author: 'Ann; Bob', keywords: 'x, y', lang: 'en-GB', custom: [['Project Code', '7']] }, { doc: 'uuid:1', inst: 'uuid:2' }, '2025-01-01T00:00:00Z')
    expect(x).toContain('<rdf:li xml:lang="x-default">A &amp; B</rdf:li>')
    expect(x).toContain('<rdf:Seq><rdf:li>Ann</rdf:li><rdf:li>Bob</rdf:li></rdf:Seq>')
    expect(x).toContain('<rdf:Bag><rdf:li>x</rdf:li><rdf:li>y</rdf:li></rdf:Bag>')
    expect(x).toContain('<pdfx:Project_Code>7</pdfx:Project_Code>')
    expect(x).toMatch(/<\?xpacket end="w"\?>$/)
  })
  it('round-trips through pdf-lib', async () => {
    const src = await demoPdf(lib, 'Test', 3)
    const r0 = await readMeta(lib, src)
    expect(r0.pages).toBe(3)
    expect(r0.meta.title).toBe('untitled')
    expect(r0.meta.custom).toEqual([['Department', 'Ops']])
    const m: Meta = { ...r0.meta, title: 'Annual report – Ελλάδα', author: 'Ann; Bob', lang: 'en-GB', displayTitle: true, layout: 'TwoPageRight', mode: 'UseOutlines', trapped: 'False', created: '2024-05-01T10:00:00+02:00', custom: [['Department', 'Finance'], ['Reviewed', 'yes']] }
    const out = await writeMeta(lib, src, m)
    const r1 = await readMeta(lib, out)
    expect(r1.meta).toEqual({ ...m, modified: r0.meta.modified })
    expect(r1.xmp?.some(([k, v]) => k === 'dc:creator' && v === 'Ann; Bob')).toBe(true)
    expect(r1.conflicts).toEqual([])
  })
  it('copies selected fields and lints', () => {
    const a = { ...EMPTY, title: 'A', custom: [['K', '1']] as [string, string][] }
    const b = { ...EMPTY, title: 'B', author: 'Zed', custom: [['K', '2'], ['L', '3']] as [string, string][] }
    expect(applyFields(a, b, ['author', 'custom'])).toEqual({ ...a, author: 'Zed', custom: [['K', '2'], ['L', '3']] })
    expect(lint({ ...EMPTY, lang: 'english' }).length).toBe(2)
  })
})
