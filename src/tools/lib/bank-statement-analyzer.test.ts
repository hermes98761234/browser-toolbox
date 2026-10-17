import { describe, expect, it } from 'vitest'
import { addDays, anomalies, balances, days, dedupe, monthly, recurring } from './bank-statement-analyzer'
import type { Txn } from './bank-csv-analyzer'

const t = (date: string, amount: number, merchant: string, category = 'Other', balance?: number): Txn & { balance?: number } => ({ date, amount, merchant, desc: merchant, category, balance })

describe('bank-statement-analyzer', () => {
  it('date helpers', () => {
    expect(days('2026-01-31', '2026-03-01')).toBe(29)
    expect(addDays('2026-01-31', 30.44)).toBe('2026-03-02')
  })

  it('detects monthly subscriptions, price changes and cancellations', () => {
    const tx = [
      t('2026-01-05', -15.49, 'Netflix'), t('2026-02-05', -15.49, 'Netflix'), t('2026-03-05', -15.49, 'Netflix'), t('2026-04-05', -17.99, 'Netflix'),
      t('2026-01-10', -30, 'Gym'), t('2026-02-10', -30, 'Gym'), t('2026-03-10', -30, 'Gym'),
      t('2026-01-03', -5, 'Cafe'), t('2026-01-04', -6, 'Cafe'), t('2026-02-20', -4, 'Cafe'),
    ]
    const r = recurring(tx, '2026-04-30')
    const nf = r.find((x) => x.merchant === 'Netflix')!
    expect(nf.freq).toBe('monthly')
    expect(nf.priceChange).toBeCloseTo(-2.5)
    expect(nf.active).toBe(true)
    expect(nf.monthly).toBeCloseTo(-16.115, 2)
    const gym = r.find((x) => x.merchant === 'Gym')!
    expect(gym.active).toBe(false)
    expect(r.find((x) => x.merchant === 'Cafe')).toBeUndefined()
  })

  it('monthly income vs spending', () => {
    const m = monthly([t('2026-01-01', 1000, 'Pay', 'Income'), t('2026-01-02', -200, 'Rent', 'Housing'), t('2026-02-01', -50, 'Food', 'Groceries')])
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ income: 1000, spending: 200, net: 800 })
    expect(m[1].byCat.Groceries).toBe(50)
  })

  it('checks balance continuity and rebuilds balances', () => {
    const b = balances([t('2026-01-01', -10, 'A', 'x', 90), t('2026-01-02', -20, 'B', 'x', 70), t('2026-01-03', -5, 'C', 'x', 60)], 0)
    expect(b.opening).toBe(100)
    expect(b.breaks).toHaveLength(1)
    expect(b.breaks[0].expected).toBe(65)
    const r = balances([t('2026-01-01', -10, 'A'), t('2026-01-01', 50, 'B')], 100)
    expect(r.closing).toBe(140)
    expect(r.points).toEqual([{ date: '2026-01-01', balance: 140 }])
  })

  it('dedupes overlapping statements and flags anomalies', () => {
    const rows = [t('2026-01-01', -10, 'A', 'x', 90), t('2026-01-01', -10, 'A', 'x', 90)]
    expect(dedupe(rows).removed).toBe(1)
    const tx = [t('2026-01-01', -20, 'Shop', 'Shopping'), t('2026-01-08', -22, 'Shop', 'Shopping'), t('2026-01-15', -19, 'Shop', 'Shopping'), t('2026-01-20', -180, 'Shop', 'Shopping'), t('2026-01-21', -9.99, 'Tv'), t('2026-01-22', -9.99, 'Tv')]
    const a = anomalies(tx)
    expect(a.some((x) => x.t.amount === -180)).toBe(true)
    expect(a.some((x) => x.reason.startsWith('Possible duplicate'))).toBe(true)
  })
})

describe('semimonthly pay', () => {
  it('recognises 1st/15th salary', () => {
    const tx: Txn[] = []
    for (let m = 1; m <= 4; m++) for (const d of ['01', '15']) tx.push({ date: `2026-0${m}-${d}`, amount: 3000, merchant: 'Payroll', desc: 'Payroll', category: 'Income' })
    const r = recurring(tx, '2026-04-20')[0]
    expect(r.freq).toBe('semimonthly')
    expect(r.monthly).toBeCloseTo(6000, -1)
  })
})
