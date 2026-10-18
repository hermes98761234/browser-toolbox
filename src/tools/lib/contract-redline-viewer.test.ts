import { describe, expect, it } from 'vitest'
import { align, changes, merge, paragraphs, redlineXml, similarity, stats } from './contract-redline-viewer'

const OLD = `1. Term. This Agreement starts on the Effective Date and lasts for twelve (12) months.
2. Fees. Client pays all invoices within thirty (30) days.
3. Confidentiality. Each party keeps the other party's information secret.
4. Governing law. This Agreement is governed by the laws of Ontario.`
const NEW = `1. Term. This Agreement starts on the Effective Date and lasts for twenty-four (24) months.
2. Fees. Client pays all invoices within thirty (30) days.
2A. Late fees. Overdue amounts accrue interest at 1% per month.
4. Governing law. This Agreement is governed by the laws of Ontario.`

describe('contract redline', () => {
  it('splits paragraphs and scores similarity', () => {
    expect(paragraphs('a\n\n  b  c \r\n')).toEqual(['a', 'b c'])
    expect(similarity('the fee is due', 'the fee is payable')).toBeCloseTo(0.75)
  })
  it('aligns modified, added and deleted paragraphs', () => {
    const p = align(OLD, NEW)
    expect(p.map((x) => x.kind)).toEqual(['mod', 'same', 'del', 'add', 'same'])
    const c = changes(p)
    expect(c.length).toBe(3)
    expect(c[0]).toMatchObject({ kind: 'replace', old: 'twelve (12', new: 'twenty-four (24' })
    expect(c[1]).toMatchObject({ kind: 'delete', whole: true })
    expect(c[2]).toMatchObject({ kind: 'insert', whole: true })
  })
  it('merges according to decisions', () => {
    const p = align(OLD, NEW)
    const all = merge(p, {})
    expect(all).toBe(NEW.split('\n').join('\n\n'))
    const none = merge(p, {}, 'reject')
    expect(none).toBe(OLD.split('\n').join('\n\n'))
    const mixed = merge(p, { 1: 'reject', 2: 'accept', 3: 'reject' })
    expect(mixed).toContain('twelve (12) months')
    expect(mixed).not.toContain('Confidentiality')
    expect(mixed).not.toContain('Late fees')
  })
  it('counts words and writes tracked changes', () => {
    const p = align(OLD, NEW)
    const s = stats(p)
    expect(s.changedParas).toBe(3)
    expect(s.added).toBeGreaterThan(0)
    const x = redlineXml(p, { tracked: true, author: 'Me', date: '2026-01-01T00:00:00Z', title: 'T' })
    expect(x).toContain('<w:del w:id="1" w:author="Me"')
    expect(x).toContain('<w:delText xml:space="preserve">twelve</w:delText>')
    expect(redlineXml(p, { tracked: false, author: '', date: '', title: '' })).toContain('<w:strike/>')
  })
})
