import { describe, expect, it } from 'vitest'
import { categorize, parseTransactions, periodKey, statement, toIso, total, type Account, type Rule } from './profit-and-loss-builder'

const accounts: Account[] = [
  { id: 'sales', name: 'Sales', section: 'revenue' },
  { id: 'cogs', name: 'Materials', section: 'cogs' },
  { id: 'rent', name: 'Rent', section: 'opex' },
  { id: 'int', name: 'Interest income', section: 'other' },
  { id: 'tax', name: 'Income tax', section: 'tax' },
  { id: 'xfer', name: 'Transfers', section: 'exclude' },
]
const rules: Rule[] = [
  { id: '1', pattern: 'stripe', account: 'sales' },
  { id: '2', pattern: '/^land(lord)?/i', account: 'rent' },
  { id: '3', pattern: 'transfer', account: 'xfer' },
]

describe('profit and loss builder', () => {
  it('parses amount or debit/credit layouts and date formats', () => {
    const a = parseTransactions('Date,Description,Amount\n2026-01-05,Stripe payout,"1,200.00"\n01/31/2026,Landlord,(900)\nbad,row,1')
    expect(a.txns.map((t) => t.amount)).toEqual([1200, -900])
    expect(a.skipped).toBe(1)
    const b = parseTransactions('Posted;Details;Money out;Money in\n15.02.2026;Supplier;250,50;\n16.02.2026;Client;;1.000,00')
    expect(b.txns.map((t) => t.amount)).toEqual([-250.5, 1000])
    expect(b.txns[0].date).toBe('2026-02-15')
    expect(toIso('3/4/26')).toBe('2026-03-04')
  })
  it('maps by rule, regex and category column', () => {
    expect(categorize({ date: '', desc: 'STRIPE PAYOUT', amount: 1, cat: '' }, rules, accounts)).toBe('sales')
    expect(categorize({ date: '', desc: 'Landlord LLC', amount: 1, cat: '' }, rules, accounts)).toBe('rent')
    expect(categorize({ date: '', desc: 'x', amount: 1, cat: 'materials' }, rules, accounts)).toBe('cogs')
    expect(categorize({ date: '', desc: 'x', amount: 1, cat: '' }, rules, accounts)).toBe('')
  })
  it('rolls up a statement with gross, operating and net income', () => {
    const { txns } = parseTransactions('Date,Description,Amount,Category\n2026-01-05,Stripe,1000,\n2026-01-09,Wood,-300,Materials\n2026-02-01,Landlord,-400,\n2026-04-02,Stripe,500,\n2026-04-03,Bank interest,10,Interest income\n2026-04-30,IRS,-50,Income tax\n2026-04-30,Transfer to savings,-700,\n2026-05-01,Mystery,-5,')
    const assign = txns.map((t) => categorize(t, rules, accounts))
    const st = statement(txns, assign, accounts, 'quarter')
    expect(st.periods).toEqual(['2026-Q1', '2026-Q2'])
    expect(st.sum.revenue).toEqual([1000, 500])
    expect(st.gross).toEqual([700, 500])
    expect(st.operating).toEqual([300, 500])
    expect(st.net).toEqual([300, 460])
    expect(total(st.net)).toBe(760)
    expect(st.uncategorized).toEqual({ count: 1, amount: -5 })
    expect(st.sum.exclude).toEqual([0, -700])
    expect(periodKey('2026-11-02', 'month')).toBe('2026-11')
  })
})
