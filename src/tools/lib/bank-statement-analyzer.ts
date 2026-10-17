// Statement-over-time analysis: dedupe, recurring payments, monthly trends, balance reconstruction, anomalies.
import type { Txn } from './bank-csv-analyzer'

export interface Row extends Txn { balance?: number; id: string }

export const days = (a: string, b: string) => (Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000
export const addDays = (d: string, n: number) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + Math.round(n))).toISOString().slice(0, 10)
const median = (a: number[]) => {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Removes rows that appear in two overlapping statement files (same date, amount, description and balance). */
export function dedupe<T extends Txn & { balance?: number }>(rows: T[]): { rows: T[]; removed: number } {
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of rows) {
    const k = `${r.date}|${r.amount.toFixed(2)}|${r.desc.trim().toLowerCase()}|${r.balance ?? ''}`
    if (seen.has(k) && r.balance !== undefined) continue
    seen.add(k)
    out.push(r)
  }
  return { rows: out, removed: rows.length - out.length }
}

export type Freq = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'yearly'
const FREQ: [Freq, number, number, number][] = [
  ['weekly', 6, 8, 7], ['biweekly', 13, 15, 14], ['semimonthly', 14, 17, 15.22], ['monthly', 26, 35, 30.44], ['quarterly', 84, 97, 91.31], ['yearly', 350, 380, 365.25],
]

export interface Recurring {
  merchant: string
  category: string
  freq: Freq
  interval: number
  count: number
  avg: number // signed average amount
  last: number // latest amount
  lastDate: string
  next: string
  monthly: number // signed monthly equivalent
  priceChange: number // last - previous (signed), 0 if none
  stable: boolean
  active: boolean
}

/** Finds merchants charged at a regular cadence. `end` = statement end date. */
export function recurring(txns: Txn[], end: string): Recurring[] {
  const by = new Map<string, Txn[]>()
  for (const t of txns) {
    const k = `${t.merchant}|${t.amount < 0 ? '-' : '+'}`
    by.set(k, [...(by.get(k) ?? []), t])
  }
  const out: Recurring[] = []
  for (const list of by.values()) {
    if (list.length < 3) continue
    const ts = [...list].sort((a, b) => a.date.localeCompare(b.date))
    const gaps = ts.slice(1).map((t, i) => days(ts[i].date, t.date)).filter((g) => g > 0)
    if (gaps.length < 2) continue
    const g = median(gaps)
    const doms = new Set(ts.map((t) => Math.round(+t.date.slice(8, 10) / 3)))
    const semi = g >= 13 && g <= 17 && doms.size <= 2 && ts.length >= 4
    const f = semi ? FREQ[2] : FREQ.find(([, lo, hi]) => g >= lo && g <= hi)
    if (!f) continue
    // most gaps must agree with the cadence
    const agree = gaps.filter((x) => x >= f[1] * 0.8 && x <= f[2] * 1.2).length / gaps.length
    if (agree < 0.6) continue
    const amts = ts.map((t) => t.amount)
    const avg = amts.reduce((a, b) => a + b, 0) / amts.length
    const sd = Math.sqrt(amts.reduce((a, b) => a + (b - avg) ** 2, 0) / amts.length)
    const stable = Math.abs(avg) > 0 && sd / Math.abs(avg) < 0.12
    const last = ts[ts.length - 1]
    const prev = ts[ts.length - 2]
    const interval = f[3]
    out.push({
      merchant: last.merchant,
      category: last.category,
      freq: f[0],
      interval,
      count: ts.length,
      avg,
      last: last.amount,
      lastDate: last.date,
      next: addDays(last.date, interval),
      monthly: (avg * 30.44) / interval,
      priceChange: Math.abs(last.amount - prev.amount) > 0.005 && amts.slice(0, -1).every((a) => Math.abs(a - prev.amount) <= Math.abs(prev.amount) * 0.01) ? last.amount - prev.amount : 0,
      stable,
      active: days(last.date, end) <= interval * 1.5 + 3,
    })
  }
  return out.sort((a, b) => a.monthly - b.monthly)
}

export interface Month { month: string; income: number; spending: number; net: number; count: number; byCat: Record<string, number> }

export function monthly(txns: Txn[], ignore: (t: Txn) => boolean = () => false): Month[] {
  const m = new Map<string, Month>()
  for (const t of txns) {
    const k = t.date.slice(0, 7)
    const e = m.get(k) ?? { month: k, income: 0, spending: 0, net: 0, count: 0, byCat: {} }
    e.count++
    if (!ignore(t)) {
      if (t.amount > 0) e.income += t.amount
      else {
        e.spending -= t.amount
        e.byCat[t.category] = (e.byCat[t.category] ?? 0) - t.amount
      }
      e.net += t.amount
    }
    m.set(k, e)
  }
  return [...m.values()].sort((a, b) => a.month.localeCompare(b.month))
}

export interface BalancePoint { date: string; balance: number }
export interface BalanceCheck { points: BalancePoint[]; breaks: { date: string; desc: string; expected: number; actual: number }[]; opening: number; closing: number; low: BalancePoint | null }

/**
 * Daily end-of-day balance. If rows carry a balance column it is checked for continuity
 * (previous balance + amount = balance); otherwise it is rebuilt from `opening`.
 */
export function balances(rows: (Txn & { balance?: number })[], opening: number): BalanceCheck {
  const ts = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const has = ts.length > 0 && ts.every((t) => t.balance !== undefined && Number.isFinite(t.balance))
  const breaks: BalanceCheck['breaks'] = []
  let bal = has ? ts[0].balance! - ts[0].amount : opening
  const open = bal
  const daily = new Map<string, number>()
  for (const t of ts) {
    const exp = bal + t.amount
    if (has) {
      if (Math.abs(exp - t.balance!) > 0.011) breaks.push({ date: t.date, desc: t.desc, expected: exp, actual: t.balance! })
      bal = t.balance!
    } else bal = exp
    daily.set(t.date, bal)
  }
  const points = [...daily].map(([date, balance]) => ({ date, balance }))
  const low = points.reduce<BalancePoint | null>((a, p) => (!a || p.balance < a.balance ? p : a), null)
  return { points, breaks, opening: open, closing: bal, low }
}

export interface Anomaly { t: Txn; reason: string; score: number }

/** Unusually large charges vs their category/merchant, duplicate charges, fees. */
export function anomalies(txns: Txn[]): Anomaly[] {
  const out: Anomaly[] = []
  const spend = txns.filter((t) => t.amount < 0)
  const byCat = new Map<string, number[]>()
  const byMer = new Map<string, number[]>()
  for (const t of spend) {
    byCat.set(t.category, [...(byCat.get(t.category) ?? []), -t.amount])
    byMer.set(t.merchant, [...(byMer.get(t.merchant) ?? []), -t.amount])
  }
  const flagged = new Set<Txn>()
  for (const t of spend) {
    const a = -t.amount
    const mer = byMer.get(t.merchant)!
    const cat = byCat.get(t.category)!
    const mm = median(mer.filter((x) => x !== a).length ? mer.filter((x) => x !== a) : mer)
    if (mer.length >= 3 && a > mm * 2.5 && a - mm > 20) {
      out.push({ t, reason: `${(a / mm).toFixed(1)}× the usual ${t.merchant} charge (${mm.toFixed(2)})`, score: a / mm })
      flagged.add(t)
      continue
    }
    if (cat.length >= 5) {
      const mean = cat.reduce((x, y) => x + y, 0) / cat.length
      const sd = Math.sqrt(cat.reduce((x, y) => x + (y - mean) ** 2, 0) / cat.length)
      const z = sd ? (a - mean) / sd : 0
      if (z > 3 && a > 50) {
        out.push({ t, reason: `Large for ${t.category}: ${z.toFixed(1)} standard deviations above average`, score: z })
        flagged.add(t)
        continue
      }
    }
    if (/\b(fee|overdraft|interest charge|late|nsf|returned item)\b/i.test(t.desc)) {
      out.push({ t, reason: 'Bank fee or charge', score: 1 })
      flagged.add(t)
    }
  }
  const s = [...spend].sort((a, b) => a.date.localeCompare(b.date))
  for (let i = 0; i < s.length; i++)
    for (let j = i + 1; j < s.length && days(s[i].date, s[j].date) <= 2; j++)
      if (s[i].merchant === s[j].merchant && Math.abs(s[i].amount - s[j].amount) < 0.005 && -s[i].amount >= 5 && !flagged.has(s[j])) {
        out.push({ t: s[j], reason: `Possible duplicate of ${s[i].date} charge`, score: 2 })
        flagged.add(s[j])
      }
  return out.sort((a, b) => b.score - a.score)
}
