import { describe, expect, it } from 'vitest'
import { TABLE_2026 } from './paycheck-estimator'
import { grossPay, payLine, post, register, totals, type Company, type Employee, type Rule } from './payroll-calculator'

const C: Company = { periods: 26, futaRate: 0.6, futaBase: 7000, sutaRate: 2.7, sutaBase: 7000, otherEmployerRate: 0 }
const RULES: Rule[] = [
  { id: 'k', name: '401(k)', kind: '401k', percent: true, amount: 5, match: 100, matchCap: 4, employer: 0 },
  { id: 'h', name: 'Health premium', kind: 'sec125', percent: false, amount: 80, match: 0, matchCap: 0, employer: 220 },
  { id: 'u', name: 'Union dues', kind: 'posttax', percent: false, amount: 15, match: 0, matchCap: 0, employer: 0 },
]
const E = (p: Partial<Employee>): Employee => ({ id: 'e', name: 'A', title: '', pay: 'salary', annual: 52000, rate: 0, hours: 0, ot: 0, bonus: 0, status: 'single', children: 0, otherDeps: 0, extraWh: 0, stateRate: 0, stateAllowance: 0, enroll: {}, ytdGross: 0, ytdFica: 0, ytdFuta: 0, ...p })

describe('gross pay', () => {
  it('salary and hourly with overtime', () => {
    expect(grossPay(E({}), 26).gross).toBe(2000)
    expect(grossPay(E({ pay: 'hourly', rate: 20, hours: 80, ot: 4, bonus: 50 }), 26)).toEqual({ regular: 1600, overtime: 120, bonus: 50, gross: 1770 })
  })
})

describe('pay line', () => {
  it('computes FICA, FUTA/SUTA and net for a simple salaried employee', () => {
    const l = payLine(E({}), [], C, TABLE_2026)
    expect(l.ss).toBe(124)
    expect(l.medicare).toBe(29)
    expect(l.er.ss).toBe(124)
    expect(l.er.futa).toBe(12)
    expect(l.er.suta).toBe(54)
    // federal: (52000 - 16100) = 35900 taxable → 1240 + 0.12 × 23500 = 4060 / 26
    expect(l.federal).toBeCloseTo(4060 / 26, 2)
    expect(l.net).toBeCloseTo(2000 - 124 - 29 - l.federal, 2)
    expect(l.cost).toBeCloseTo(2000 + 124 + 29 + 12 + 54, 2)
  })
  it('applies deduction rules, match and benefits', () => {
    const l = payLine(E({ enroll: { k: 5, h: 80, u: 15 } }), RULES, C, TABLE_2026)
    expect(l.pretax).toBe(180) // 100 401k + 80 sec125
    expect(l.posttax).toBe(15)
    expect(l.ficaWages).toBe(1920) // sec125 reduces FICA, 401k does not
    expect(l.ss).toBeCloseTo(1920 * 0.062, 2)
    expect(l.er.match).toBe(80) // 100% of 100, capped at 4% of 2000
    expect(l.er.benefits).toBe(220)
    expect(l.net).toBeCloseTo(2000 - 180 - 15 - l.federal - l.ss - l.medicare - l.state, 2)
  })
  it('caps FUTA/SUTA and Social Security by YTD wages', () => {
    const l = payLine(E({ ytdFica: 183500, ytdFuta: 6500 }), [], C, TABLE_2026)
    expect(l.ss).toBeCloseTo(1000 * 0.062, 2)
    expect(l.er.futa).toBe(3)
    const l2 = payLine(E({ ytdFica: 199000, ytdFuta: 9000, annual: 260000 }), [], C, TABLE_2026)
    expect(l2.er.futa).toBe(0)
    expect(l2.medicare).toBeCloseTo(10000 * 0.0145 + 9000 * 0.009, 2)
    expect(l2.er.medicare).toBeCloseTo(145, 2)
  })
  it('totals, posting and register', () => {
    const lines = [payLine(E({ id: 'a' }), [], C, TABLE_2026), payLine(E({ id: 'b', annual: 78000 }), [], C, TABLE_2026)]
    const t = totals(lines)
    expect(t.gross).toBe(5000)
    expect(t.deposit).toBeCloseTo(t.federal + 2 * (t.ss + t.medicare), 2)
    const p = post([E({ id: 'a' }), E({ id: 'b' })], lines)
    expect(p[1].ytdGross).toBe(3000)
    expect(register(lines)).toHaveLength(3)
  })
})
