import { describe, expect, it } from 'vitest'
import { balanceSheetCsv, importJournal, journalCsv, ledger, normal, plCsv, summary, trialBalance, validate, type Account, type Entry } from './bookkeeping-ledger'
import { parseTrialBalance } from './balance-sheet-generator'

const A: Account[] = [
  { code: '1000', name: 'Cash', type: 'asset' },
  { code: '1500', name: 'Equipment', type: 'asset', current: false },
  { code: '1510', name: 'Accumulated depreciation', type: 'asset', current: false, contra: true },
  { code: '2000', name: 'Accounts payable', type: 'liability' },
  { code: '3000', name: 'Owner capital', type: 'equity' },
  { code: '4000', name: 'Sales', type: 'revenue' },
  { code: '6000', name: 'Rent', type: 'expense' },
  { code: '6100', name: 'Depreciation', type: 'expense' },
]
const L = (account: string, debit: number, credit: number) => ({ account, debit, credit })
const E: Entry[] = [
  { id: '1', date: '2026-01-01', ref: 'J1', memo: 'Owner invests', lines: [L('1000', 10000, 0), L('3000', 0, 10000)] },
  { id: '2', date: '2026-01-05', ref: 'J2', memo: 'Buy equipment on credit', lines: [L('1500', 3000, 0), L('2000', 0, 3000)] },
  { id: '3', date: '2026-01-10', ref: 'J3', memo: 'Cash sales', lines: [L('1000', 2500.55, 0), L('4000', 0, 2500.55)] },
  { id: '4', date: '2026-01-31', ref: 'J4', memo: 'Rent', lines: [L('6000', 1200, 0), L('1000', 0, 1200)] },
  { id: '5', date: '2026-01-31', ref: 'J5', memo: 'Depreciation', lines: [L('6100', 50, 0), L('1510', 0, 50)] },
]

describe('validate', () => {
  it('accepts balanced entries and rejects others', () => {
    expect(validate(E[2], A)).toEqual([])
    expect(validate({ ...E[0], lines: [L('1000', 100, 0), L('3000', 0, 99.99)] }, A)[0]).toMatch(/difference 0.01/)
    expect(validate({ ...E[0], lines: [L('1000', 100, 0)] }, A)).toContain('An entry needs at least two lines.')
    expect(validate({ ...E[0], lines: [L('1000', 100, 100), L('3000', 0, 0)] }, A).join()).toMatch(/either a debit or a credit/)
    expect(validate({ ...E[0], date: '2026-13-01' }, A)).toContain('Enter a valid date.')
    expect(validate({ ...E[0], lines: [L('9999', 1, 0), L('3000', 0, 1)] }, A)[0]).toMatch(/choose an account/)
  })
  it('avoids float drift', () => {
    expect(validate({ ...E[0], lines: [L('1000', 0.1, 0), L('1000', 0.2, 0), L('3000', 0, 0.3)] }, A)).toEqual([])
  })
})

describe('reports', () => {
  it('normal balances', () => {
    expect(normal(A[0])).toBe(1)
    expect(normal(A[2])).toBe(-1)
    expect(normal(A[5])).toBe(-1)
  })
  it('ledger running balance', () => {
    const g = ledger(E, A[0])
    expect(g.rows.map((r) => r.balance)).toEqual([1000000, 1250055, 1130055])
    const g2 = ledger(E, A[0], '2026-01-06')
    expect(g2.opening).toBe(1000000)
    expect(g2.rows).toHaveLength(2)
  })
  it('trial balance balances', () => {
    const t = trialBalance(A, E)
    expect(t.dr).toBe(t.cr)
    expect(t.dr).toBe(1130055 + 300000 + 120000 + 5000)
  })
  it('summary and accounting equation', () => {
    const s = summary(A, E)
    expect(s.assets).toBe(1130055 + 300000 - 5000)
    expect(s.netIncome).toBe(250055 - 125000)
    expect(s.balanced).toBe(true)
  })
})

describe('csv', () => {
  it('round-trips the journal', () => {
    const csv = journalCsv(E, A)
    const r = importJournal(csv, A)
    expect(r.errors).toEqual([])
    expect(r.entries).toHaveLength(5)
    expect(r.entries[2].lines[0].debit).toBeCloseTo(2500.55)
  })
  it('imports signed amounts by account name and reports problems', () => {
    const r = importJournal('Date,Ref,Account,Amount\n2026-02-01,X1,Cash,50\n2026-02-01,X1,Sales,-50\n2026-02-02,X2,Nope,5\n2026-02-03,X3,Cash,5\n2026-02-03,X3,Sales,-4', A)
    expect(r.entries.find((e) => e.ref === 'X1')!.lines).toEqual([L('1000', 50, 0), L('4000', 0, 50)])
    expect(r.errors.some((e) => e.includes('unknown account "Nope"'))).toBe(true)
    expect(r.errors.some((e) => e.includes('X3'))).toBe(true)
  })
  it('exports for the balance sheet generator and P&L builder', () => {
    const bs = parseTrialBalance(balanceSheetCsv(A, E))
    const assets = bs.filter((a) => a.section === 'ca' || a.section === 'nca').reduce((s, a) => s + a.cur, 0)
    const le = bs.filter((a) => !['ca', 'nca'].includes(a.section)).reduce((s, a) => s + a.cur, 0)
    expect(assets).toBeCloseTo(le, 2)
    expect(bs.find((a) => a.name === 'Accumulated depreciation')!.cur).toBe(-50)
    const pl = plCsv(A, E).split('\r\n')
    expect(pl[1]).toBe('2026-01-10,Cash sales,2500.55,Sales')
    expect(pl).toContain('2026-01-31,Rent,-1200.00,Rent')
  })
})
