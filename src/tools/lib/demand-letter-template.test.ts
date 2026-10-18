import { describe, expect, it } from 'vitest'
import { addDays, amounts, body, daysBetween, interest, type Letter } from './demand-letter-template'

const inv = (ref: string, due: string, amount: number, paid = 0) => ({ id: ref, ref, issued: due, due, amount, paid })
const L: Letter = {
  tone: 'firm', date: '2026-10-18', deadlineDays: 14, currency: '$', creditor: 'A', creditorAddress: '', creditorContact: '', signer: '', signerTitle: '',
  debtor: 'B', debtorAddress: '', attention: '', invoices: [inv('INV-1', '2026-07-20', 1000), inv('INV-2', '2026-09-18', 500, 200)],
  interestRate: 8, lateFee: 40, basis: 'per our terms', payment: 'Bank transfer', consequences: ['collections', 'court'], delivery: '', extra: '',
}

describe('demand-letter-template', () => {
  it('handles dates', () => {
    expect(daysBetween('2026-07-20', '2026-10-18')).toBe(90)
    expect(addDays('2026-10-18', 14)).toBe('2026-11-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })
  it('computes simple interest', () => {
    // 1000 × 8% × 90/365 = 19.73
    expect(interest(inv('x', '2026-07-20', 1000), 8, '2026-10-18')).toBe(19.73)
    expect(interest(inv('x', '2026-12-01', 1000), 8, '2026-10-18')).toBe(0)
  })
  it('totals the claim', () => {
    const a = amounts(L)
    expect(a.principal).toBe(1300)
    // 300 × 8% × 30/365 = 1.97
    expect(a.interest).toBe(21.7)
    expect(a.total).toBe(1361.7)
    expect(a.rows[0].overdue).toBe(90)
  })
  it('writes tone-specific text', () => {
    const firm = body(L)
    expect(firm.subject).toContain('$1,361.70')
    expect(firm.paras.join(' ')).toContain('November 1, 2026')
    expect(firm.paras.join(' ')).toContain('refer the account to a collection agency; and file a claim')
    const fin = body({ ...L, tone: 'final' })
    expect(fin.subject).toMatch(/^FINAL DEMAND/)
    const fr = body({ ...L, tone: 'friendly', interestRate: 0, lateFee: 0 })
    expect(fr.paras[0]).toContain('$1,300.00')
    expect(fr.paras[0]).not.toContain('interest')
  })
})
