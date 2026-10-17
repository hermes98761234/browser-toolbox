import { describe, expect, it } from 'vitest'
import { documentXml, makeDocx, render, toMarkdown, toSections, xmlEscape } from './nda-template-generator'

describe('render', () => {
  it('vars and missing placeholders', () => expect(render('Hi {{a}} {{b}}', { a: 'X' })).toBe('Hi X [b]'))
  it('if / else / unless and nesting', () => {
    expect(render('{{#if m}}mutual{{else}}one-way{{/if}}', { m: false })).toBe('one-way')
    expect(render('{{#unless m}}U{{/unless}}', { m: false })).toBe('U')
    expect(render('{{#if a}}A{{#if b}}B{{/if}}{{/if}}', { a: true, b: false })).toBe('A')
    expect(render('{{#if a}}A{{#if b}}B{{/if}}{{/if}}', { a: true, b: true })).toBe('AB')
  })
})

describe('sections and docx', () => {
  const secs = toSections('Intro para\nwrapped.\n\n## Term\n\nLasts **2 years**.\n\n')
  it('splits sections', () => {
    expect(secs).toEqual([{ heading: '', paras: ['Intro para wrapped.'] }, { heading: 'Term', paras: ['Lasts **2 years**.'] }])
    expect(toMarkdown('NDA', secs)).toContain('## 1. Term')
  })
  it('escapes xml and bolds', () => {
    expect(xmlEscape('A & <B>')).toBe('A &amp; &lt;B&gt;')
    const x = documentXml('T', secs)
    expect(x).toContain('<w:b/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">2 years</w:t>')
  })
  it('docx is a zip', () => {
    const z = makeDocx('T', secs)
    expect(z[0]).toBe(0x50)
    expect(z[1]).toBe(0x4b)
    expect(new TextDecoder().decode(z)).toContain('word/document.xml')
  })
})
