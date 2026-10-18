import { describe, expect, it } from 'vitest'
import { PDFCheckBox, PDFDocument, PDFRadioGroup, PDFTextField } from 'pdf-lib'
import { buildPdf, fieldNames, fill, TEMPLATES, toText, wrap } from './consent-form-builder'

describe('consent form builder', () => {
  it('fills placeholders', () => {
    expect(fill('Contact {{contact}} at {{ org }}.', { org: 'A', contact: 'b@c' })).toBe('Contact b@c at A.')
  })
  it('wraps text to width', () => {
    const f = { widthOfTextAtSize: (t: string) => t.length }
    expect(wrap('aa bb cc dd', f, 1, 5)).toEqual(['aa bb', 'cc dd'])
  })
  it('creates a fillable PDF with every field', async () => {
    for (const t of Object.values(TEMPLATES)) {
      const bytes = await buildPdf(t)
      const doc = await PDFDocument.load(bytes)
      const fields = doc.getForm().getFields()
      const names = fields.map((x) => x.getName())
      expect(names.sort()).toEqual(fieldNames(t).sort())
      const kinds = new Set(fields.map((x) => (x instanceof PDFCheckBox ? 'c' : x instanceof PDFRadioGroup ? 'r' : x instanceof PDFTextField ? 't' : '?')))
      expect(kinds.has('?')).toBe(false)
      expect(kinds.has('t') && kinds.has('c')).toBe(true)
    }
    const r = TEMPLATES.Research
    const doc = await PDFDocument.load(await buildPdf(r))
    expect(doc.getForm().getRadioGroup('sec2.choice').getOptions()).toEqual(['option1', 'option2'])
    expect(doc.getForm().getTextField('signer2.name')).toBeDefined()
  })
  it('exports plain text', () => {
    const t = toText(TEMPLATES['Photo & video'])
    expect(t).toContain('[ ] Our website')
    expect(t).toContain('( ) Please show my full name')
    expect(t).not.toContain('{{')
  })
})
