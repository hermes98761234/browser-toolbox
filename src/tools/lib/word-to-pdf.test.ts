import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildPdf, fmtNum, layoutPara, paraText, parseDocx, parseXml, sampleDocx, toHtml, winAnsi, type Para, type PdfOpts } from './word-to-pdf'

const O: PdfOpts = { family: 'Helvetica', size: 11, paper: 'auto', margin: 72, pageNumbers: true, lineHeight: 1.3 }
// 1x1 red PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

describe('xml', () => {
  it('parses elements, attributes, entities and self-closing tags', () => {
    const r = parseXml('<?xml version="1.0"?><a x="1 &amp; 2"><b/><c>t &lt; u</c></a>')
    const a = r.c[0]
    expect(a.n).toBe('a')
    expect(a.a.x).toBe('1 & 2')
    expect(a.c.map((c) => c.n)).toEqual(['b', 'c'])
    expect(a.c[1].c[0].t).toBe('t < u')
  })
})

describe('numbering + text', () => {
  it('formats list numbers', () => {
    expect(fmtNum(4, 'lowerRoman')).toBe('iv')
    expect(fmtNum(28, 'upperLetter')).toBe('AB')
    expect(fmtNum(3, 'decimal')).toBe('3')
  })
  it('maps text to WinAnsi', () => {
    expect(winAnsi('café “ok” – €5').text).toBe('café “ok” – €5')
    expect(winAnsi('ő→x').text).toBe('o->x')
    expect(winAnsi('日本').lost).toBe(2)
  })
})

describe('docx', () => {
  it('reads the sample document', async () => {
    const d = await parseDocx(sampleDocx(PNG))
    const paras = d.blocks.filter((b): b is Para => b.kind === 'p')
    expect(paras[0].level).toBe(-1)
    expect(paraText(paras[0])).toBe('Quarterly Field Report')
    expect(paras.filter((p) => p.level === 1).map(paraText)).toEqual(['Summary', 'Appendix'])
    const labels = paras.filter((p) => p.list).map((p) => p.list!.label)
    expect(labels).toEqual(['•', '•', '–', '•', '1.', '2.', '3.'])
    const summary = paras[3]
    expect(summary.align).toBe('justify')
    expect(summary.runs.some((r) => r.b && r.text === 'nine sites')).toBe(true)
    expect(summary.runs.some((r) => r.u)).toBe(true)
    const t = d.blocks.find((b) => b.kind === 'table')!
    expect(t.kind === 'table' && t.rows.length).toBe(4)
    expect(t.kind === 'table' && t.grid).toEqual([160, 80, 100, 110])
    expect(Object.keys(d.images)).toHaveLength(1)
    expect(paras.find((p) => paraText(p) === 'Appendix')?.pageBreakBefore).toBe(true)
    expect(d.page?.w).toBeCloseTo(595.3, 1)
  })

  it('wraps lines within the width and justifies', () => {
    const f = { widthOfTextAtSize: (t: string, s: number) => t.length * s * 0.5 }
    const p: Para = { kind: 'p', level: 0, align: 'justify', indent: 0, runs: [{ text: 'aaaa bbbb cccc dddd eeee ffff' }] }
    const lines = layoutPara(p, 100, [f, f, f, f], { size: 10, lineHeight: 1.2 })
    // words are 20pt, spaces 5pt: four words (95pt) fit on a 100pt line
    expect(lines.map((l) => l.items.filter((i) => i.text.trim()).length)).toEqual([4, 2])
    const last = lines[0].items[lines[0].items.length - 1]
    expect(last.x + last.w).toBeCloseTo(100, 5) // justified to the right edge
    for (const l of lines) for (const it of l.items) expect(it.x + it.w).toBeLessThanOrEqual(100.0001)
  })

  it('produces a multi-page PDF and HTML', async () => {
    const d = await parseDocx(sampleDocx(PNG))
    const r = await buildPdf(d, O)
    expect(r.pages).toBe(2)
    const back = await PDFDocument.load(r.bytes)
    expect(back.getPageCount()).toBe(2)
    expect(back.getPage(0).getWidth()).toBeCloseTo(595.3, 1)
    const html = toHtml(d, O, (id) => `blob:${id}`)
    expect(html).toContain('<h1 class="title"')
    expect(html).toContain('blob:img1')
    expect(html).toContain('<table>')
  })
})
