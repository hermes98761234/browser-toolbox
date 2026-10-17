import { describe, expect, it } from 'vitest'
import { compose, DEALS, letterText, type LoiInput } from './letter-of-intent-builder'

const party = { company: 'Acme', name: 'Jo Doe', title: 'CEO', address: '1 Main St', email: 'jo@acme.test' }
const base = (): LoiInput => ({
  deal: 'acquisition', date: '2026-10-17', subject: 'Deal', from: party, to: { ...party, company: 'Target' },
  terms: DEALS.acquisition.terms.map(([label, text], k) => ({ id: String(k), label, text })),
  clauses: { nonBinding: true, dd: true, conditions: true, exclusivity: true, confidentiality: true, expenses: false, law: true, termination: false, noPublicity: false },
  ddDays: 45, exclusivityDays: 60, expiry: '2026-10-31', law: 'England and Wales', conditions: 'Board approval\nFinancing', closing: '2026-12-31',
})

describe('letter of intent', () => {
  it('orders terms before provisions and lists the binding sections', () => {
    const s = compose(base())
    expect(s[0].title).toBe('Structure')
    const titles = s.map((x) => x.title)
    expect(titles).toEqual(['Structure', 'Purchase Price', 'Consideration', 'Key Employees', 'Due Diligence', 'Conditions', 'Timing', 'Exclusivity', 'Confidentiality', 'Governing Law', 'Binding Effect'])
    expect(s.at(-1)!.text).toContain('sections 8, 9, 10 and 11 are legally binding')
    expect(s.find((x) => x.title === 'Exclusivity')!.text).toContain('60 days')
    expect(s.find((x) => x.title === 'Conditions')!.text).toContain('Board approval; Financing')
  })
  it('omits disabled clauses and renders the full letter', () => {
    const i = base()
    i.clauses = { ...i.clauses, exclusivity: false, nonBinding: false }
    expect(compose(i).some((x) => x.title === 'Exclusivity' || x.title === 'Binding Effect')).toBe(false)
    const t = letterText(base())
    expect(t).toContain('Re: Letter of Intent — Deal')
    expect(t).toContain('ACKNOWLEDGED AND AGREED')
    expect(t).toContain('countersigned by 2026-10-31')
  })
})
