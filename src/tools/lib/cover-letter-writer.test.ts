import { describe, expect, it } from 'vitest'
import { boldRuns, documentXml, fill, makeDocx, placeholders, words } from './cover-letter-writer'

describe('cover-letter-writer', () => {
  it('finds and fills placeholders', () => {
    const t = 'Dear {{manager}},\nI want the {{ role }} role at {{company}}. {{company}} rocks.'
    expect(placeholders(t)).toEqual(['manager', 'role', 'company'])
    expect(fill(t, { manager: 'Ms Lee', role: 'Designer', company: '' })).toBe('Dear Ms Lee,\nI want the Designer role at [company]. [company] rocks.')
  })
  it('counts words and bold runs', () => {
    expect(words("I'm a well-known dev, 10 years.")).toBe(6)
    expect(boldRuns('a **b** c')).toEqual([{ t: 'a ', b: false }, { t: 'b', b: true }, { t: ' c', b: false }])
  })
  it('writes docx xml', () => {
    const x = documentXml('Hi <you>\nline2\n\nPara 2')
    expect(x.match(/<w:p>/g)?.length).toBe(2)
    expect(x).toContain('Hi &lt;you&gt;')
    expect(x).toContain('<w:br/>')
    const z = makeDocx('Hello')
    expect(z[0]).toBe(0x50)
    expect(new TextDecoder().decode(z)).toContain('word/document.xml')
  })
})
