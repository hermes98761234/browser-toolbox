import { describe, expect, it } from 'vitest'
import { latin, lint, summarize, TEMPLATES, wrapBy, type Reference } from './reference-check-form'

const qs = TEMPLATES.general.questions
const ref = (p: Partial<Reference>): Reference => ({ id: 'r', name: 'A', title: '', company: '', relationship: 'Manager', years: 2, contact: '', date: '', consent: true, rehire: '', overall: 0, answers: {}, flags: '', ...p })
const full = (rating: number, yes: 'yes' | 'no' = 'yes') => Object.fromEntries(qs.map((x) => [x.id, x.kind === 'rating' ? { rating, note: '' } : x.kind === 'yesno' ? { yes, note: '' } : { note: 'ok' }]))

describe('templates', () => {
  it('have unique ids and a rehire question', () => {
    for (const t of Object.values(TEMPLATES)) {
      expect(new Set(t.questions.map((x) => x.id)).size).toBe(t.questions.length)
      expect(t.questions.some((x) => x.comp === 'Rehire' && x.kind === 'yesno')).toBe(true)
      for (const x of t.questions) expect(lint(x.text)).toEqual([])
    }
  })
})

describe('lint', () => {
  it('flags discriminatory topics', () => {
    expect(lint('Does she have children?')).toEqual(['family / pregnancy'])
    expect(lint('How old is he and is he married?')).toEqual(['age', 'marital status'])
    expect(lint('What was their salary?')).toContain('pay history (banned in many US states)')
    expect(lint('How did they handle deadlines?')).toEqual([])
  })
})

describe('summarize', () => {
  it('averages competencies and gives a verdict', () => {
    const s = summarize(qs, [ref({ id: 'a', answers: full(5), overall: 5 }), ref({ id: 'b', answers: full(4), overall: 4 })])
    expect(s.comps.find((c) => c.comp === 'Reliability')).toEqual({ comp: 'Reliability', n: 2, avg: 4.5, spread: 1 })
    expect(s.ratingAvg).toBe(4.5)
    expect(s.overallAvg).toBe(4.5)
    expect(s.rehire).toEqual({ yes: 2, no: 0, unsure: 0 })
    expect(s.completed).toBe(2)
    expect(s.coverage).toBe(1)
    expect(s.verdict.label).toBe('Strong references')
  })
  it('raises concerns', () => {
    const s = summarize(qs, [ref({ id: 'a', answers: full(5), overall: 4 }), ref({ id: 'b', answers: full(2, 'no'), overall: 2, consent: false, flags: 'Missed launches' })])
    expect(s.verdict.tone).toBe('bad')
    expect(s.concerns).toContain('1 referee would not rehire')
    expect(s.concerns).toContain('Referees disagree on quality of work')
    expect(s.concerns).toContain('A: Missed launches')
    expect(s.concerns).toContain('Candidate consent not recorded for every reference')
  })
  it('is in progress with no answers', () => {
    const s = summarize(qs, [ref({})])
    expect(s.verdict.label).toBe('In progress')
    expect(s.ratingAvg).toBeNull()
  })
})

describe('text helpers', () => {
  it('wraps by width and latinises', () => {
    expect(wrapBy('aaa bbb ccc', 7, (s) => s.length)).toEqual(['aaa bbb', 'ccc'])
    expect(latin('“Great” – yes… ✓')).toBe('"Great" - yes... ?')
  })
})
