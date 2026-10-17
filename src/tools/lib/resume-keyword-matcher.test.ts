import { describe, expect, it } from 'vitest'
import { contentText, extractPdfText, keywords, match, parseCMap, stem } from './resume-keyword-matcher'

describe('pdf text', () => {
  it('reads content streams', () => {
    const t = contentText('BT /F1 12 Tf 72 700 Td (Hello) Tj [(Wor) -50 (ld)] TJ 0 -14 Td (Next \\(line\\)) Tj ET', new Map())
    expect(t).toBe('HelloWorld\nNext (line) ')
  })
  it('parses ToUnicode cmaps', () => {
    const c = parseCMap('1 begincodespacerange <0000> <FFFF> endcodespacerange 2 beginbfchar <0003> <0020> <0011> <0041> endbfchar 1 beginbfrange <0012> <0014> <0042> endbfrange')
    expect(c.bytes).toBe(2)
    expect(contentText('BT /F1 9 Tf <00110012000300140013> Tj ET', new Map([['F1', c]]))).toBe('AB DC ')
  })
  it('extracts text from a pdf-lib document', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const f = await doc.embedFont(StandardFonts.Helvetica)
    const p = doc.addPage()
    p.drawText('Jane Doe — Frontend Engineer', { x: 50, y: 700, size: 14, font: f })
    p.drawText('React, TypeScript, GraphQL', { x: 50, y: 680, size: 11, font: f })
    doc.addPage().drawText('Page two', { x: 50, y: 700, size: 11, font: f })
    const txt = await extractPdfText(await doc.save())
    expect(txt).toContain('Jane Doe — Frontend Engineer')
    expect(txt).toContain('React, TypeScript, GraphQL')
    expect(txt.indexOf('Page two')).toBeGreaterThan(txt.indexOf('React'))
  })
})

describe('keywords', () => {
  it('stems', () => {
    expect(stem('apis')).toBe('api')
    expect(stem('testing')).toBe('test')
    expect(stem('libraries')).toBe('library')
    expect(stem('node.js')).toBe('node.js')
    expect(stem('business')).toBe('business')
  })
  it('ranks and matches', () => {
    const jd = 'We need React and TypeScript. React experience with GraphQL. Unit testing and CI/CD. Machine learning is a plus. React!'
    const k = keywords(jd)
    expect(k[0].term).toBe('react')
    expect(k.some((x) => x.term === 'ci/cd')).toBe(true)
    expect(k.some((x) => x.term === 'machine learning')).toBe(true)
    const r = match(jd, 'Built React apps in TypeScript; wrote unit tests; set up CI/CD pipelines.')
    const got = Object.fromEntries(r.matches.map((m) => [m.kw.term, m.inResume]))
    expect(got.react).toBe(1)
    expect(got['unit testing']).toBe(1)
    expect(got.graphql).toBe(0)
    expect(r.score).toBeGreaterThan(0.4)
    expect(r.score).toBeLessThan(1)
  })
})
