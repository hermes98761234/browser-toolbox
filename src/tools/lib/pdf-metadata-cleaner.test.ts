import { describe, expect, it } from 'vitest'
import * as lib from 'pdf-lib'
import { ALL, analyze, clean, pdfDate, samplePdf, xmpFields } from './pdf-metadata-cleaner'

describe('pdf metadata cleaner', () => {
  it('finds everything in the sample, including the older revision', async () => {
    const bytes = await samplePdf(lib)
    const r = await analyze(lib, bytes)
    expect(r.pages).toBe(2)
    expect(r.revisions).toBe(2)
    expect(r.info.find(([k]) => k === 'Author')?.[1]).toBe('Jane Doe') // latest revision wins
    expect(r.rawStrings.some(([k, v]) => k === 'Author' && v.includes('old laptop'))).toBe(true)
    expect(r.xmp?.fields.some(([k, v]) => k === 'dc:creator' && v === 'Jane Doe')).toBe(true)
    expect(r.thumbs).toBe(1)
    expect(r.pieceInfo).toBe(1)
    expect(r.js.names).toBe(1)
    expect(r.annots.authors).toEqual(['Jane Doe'])
    expect(r.id).toContain('a1b2c3d4')
  })
  it('cleans it completely in a single revision', async () => {
    const out = await clean(lib, await samplePdf(lib), ALL)
    const r = await analyze(lib, out)
    expect(r.info).toEqual([])
    expect(r.xmp).toBeNull()
    expect(r.thumbs + r.pieceInfo + r.js.names + r.annots.withAuthor).toBe(0)
    expect(r.annots.total).toBe(1) // the comment itself is kept
    expect(r.revisions).toBe(1)
    expect(r.rawStrings.filter(([k]) => k !== 'T (annotation author)')).toEqual([])
    expect(new TextDecoder('latin1').decode(out)).not.toMatch(/Jane|Acme|old laptop|identity\.loginName/)
    expect(r.id).not.toContain('a1b2c3d4')
    expect(r.pages).toBe(2)
  })
  it('can keep the title', async () => {
    const out = await clean(lib, await samplePdf(lib), { ...ALL, keepTitle: true })
    expect((await analyze(lib, out)).info).toEqual([['Title', 'Quarterly plan']])
  })
  it('helpers', () => {
    expect(pdfDate("D:20240311093012+01'00'")).toBe('2024-03-11 09:30:12 +01:00')
    expect(xmpFields('<x:a><xmp:CreatorTool>Word</xmp:CreatorTool></x:a>')).toEqual([['xmp:CreatorTool', 'Word']])
  })
})
