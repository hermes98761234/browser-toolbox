import { describe, expect, it } from 'vitest'
import { addDays, compose, daysBetween, lateFee, mailto, render, schedule, stageFor, TEMPLATES, type Ctx } from './payment-reminder-writer'

const C: Ctx = { contact: 'Sam', client: 'Acme', sender: 'Jo', company: 'Jo Design', payment: 'https://pay.example/1', currency: '$', today: '2026-10-18', graceDays: 7, feePct: 1.5, feeFlat: 0, tone: 'neutral' }

describe('payment reminders', () => {
  it('date maths', () => {
    expect(daysBetween('2026-10-01', '2026-10-18')).toBe(17)
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01')
    expect([0, 1, 7, 8, 30, 31, 60, 61].map(stageFor)).toEqual(['upcoming', 'friendly', 'friendly', 'firm', 'firm', 'final', 'final', 'collections'])
    expect(schedule('2026-10-01', '2026-10-18').filter((s) => s.past).map((s) => s.stage)).toEqual(['upcoming', 'friendly', 'firm'])
  })
  it('late fees are simple interest', () => {
    expect(lateFee(1000, 30, 1.5, 0)).toBe(15)
    expect(lateFee(1000, 45, 2, 25)).toBe(55)
    expect(lateFee(1000, 0, 2, 25)).toBe(0)
  })
  it('renders every template without leftover placeholders', () => {
    const inv = [{ id: 'a', number: '1042', amount: 1200, issued: '2026-09-01', due: '2026-10-01' }]
    for (const stage of Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]) for (const tone of ['warm', 'neutral', 'formal'] as const) {
      const r = compose(inv, { ...C, tone }, stage)
      expect(r.subject + r.body).not.toMatch(/\{\{/)
    }
    const r = compose(inv, C)
    expect(r.stage).toBe('firm')
    expect(r.days).toBe(17)
    expect(r.body).toContain('invoice #1042 for $1,200.00')
    expect(r.body).toContain('25 October 2026') // deadline = today + 7
    expect(r.fees).toBeCloseTo(10.2)
  })
  it('handles several invoices, using the oldest for the stage', () => {
    const r = compose([
      { id: 'a', number: '1', amount: 100, issued: '', due: '2026-10-10' },
      { id: 'b', number: '2', amount: 50.5, issued: '', due: '2026-08-01' },
    ], { ...C, feePct: 0 })
    expect(r.stage).toBe('collections')
    expect(r.subject).toContain('$150.50')
    expect(r.body).toContain('• #2 — $50.50')
  })
  it('builds mailto links', () => {
    expect(mailto('a@b.c', 'Hi there', 'x&y')).toBe('mailto:a@b.c?subject=Hi%20there&body=x%26y')
    expect(render('{{a}} {{b}}', { a: '1' })).toBe('1 {{b}}')
  })
})
