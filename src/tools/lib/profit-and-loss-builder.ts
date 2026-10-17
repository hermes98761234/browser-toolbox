// Profit & loss statement engine: transaction parsing, rule-based account mapping, period roll-ups.
import { detectDelimiter, parseCsv } from './csv-json-converter'

export type Section = 'revenue' | 'cogs' | 'opex' | 'other' | 'tax' | 'exclude'
export const SECTIONS: [Section, string][] = [
  ['revenue', 'Revenue'],
  ['cogs', 'Cost of goods sold'],
  ['opex', 'Operating expenses'],
  ['other', 'Other income / expense'],
  ['tax', 'Income tax'],
  ['exclude', 'Not P&L (transfers, owner draws, loan principal)'],
]
export interface Account { id: string; name: string; section: Section }
export interface Rule { id: string; pattern: string; account: string }
export interface Txn { date: string; desc: string; amount: number; cat: string }
export type Period = 'month' | 'quarter' | 'year'

const num = (s: string) => {
  let t = s.trim().replace(/[$€£\s]/g, '')
  const neg = /^\(.*\)$/.test(t) || t.endsWith('-')
  t = t.replace(/[()]/g, '').replace(/-$/, '')
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) || /^-?\d+,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  const v = Number(t)
  return neg ? -Math.abs(v) : v
}

/** Normalises common date formats to YYYY-MM-DD (US m/d/y unless the first part is > 12). */
export function toIso(s: string): string {
  const t = s.trim()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(t)
  if (m) {
    let [a, b] = [Number(m[1]), Number(m[2])]
    if (a > 12) [a, b] = [b, a]
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
  }
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** Reads Date / Description / Amount (or Debit + Credit) / optional Category columns. */
export function parseTransactions(text: string): { txns: Txn[]; skipped: number; cols: string } {
  const rows = parseCsv(text, detectDelimiter(text))
  if (rows.length < 2) return { txns: [], skipped: 0, cols: '' }
  const h = rows[0].map((x) => x.trim().toLowerCase())
  const find = (...names: RegExp[]) => h.findIndex((x) => names.some((n) => n.test(x)))
  const di = find(/date/, /^posted|^booked|^booking/)
  const de = find(/desc|memo|payee|narrative|details|name/)
  const am = find(/^amount|amount$|^value$|^sum$/)
  const dr = find(/debit|withdrawal|money out|paid out/)
  const cr = find(/credit|deposit|money in|paid in/)
  const ca = find(/categ|account/)
  const txns: Txn[] = []
  let skipped = 0
  for (const r of rows.slice(1)) {
    const date = di >= 0 ? toIso(r[di] ?? '') : ''
    let amount = NaN
    if (am >= 0) amount = num(r[am] ?? '')
    else if (dr >= 0 || cr >= 0) amount = (cr >= 0 ? num(r[cr] || '0') || 0 : 0) - (dr >= 0 ? Math.abs(num(r[dr] || '0') || 0) : 0)
    if (!date || !Number.isFinite(amount)) {
      skipped++
      continue
    }
    txns.push({ date, desc: (r[de] ?? '').trim(), amount, cat: ca >= 0 ? (r[ca] ?? '').trim() : '' })
  }
  const cols = [di >= 0 && `date=${rows[0][di]}`, de >= 0 && `description=${rows[0][de]}`, am >= 0 ? `amount=${rows[0][am]}` : [dr >= 0 && `debit=${rows[0][dr]}`, cr >= 0 && `credit=${rows[0][cr]}`].filter(Boolean).join(', '), ca >= 0 && `category=${rows[0][ca]}`].filter(Boolean).join(' · ')
  return { txns, skipped, cols }
}

/** First matching rule wins (case-insensitive substring, or /regex/); then a category column equal to an account name. */
export function categorize(t: Txn, rules: Rule[], accounts: Account[]): string {
  const hay = `${t.desc} ${t.cat}`.toLowerCase()
  for (const r of rules) {
    const p = r.pattern.trim()
    if (!p) continue
    let hit = false
    if (p.length > 2 && p.startsWith('/') && p.lastIndexOf('/') > 0) {
      try {
        const k = p.lastIndexOf('/')
        hit = new RegExp(p.slice(1, k), p.slice(k + 1) || 'i').test(`${t.desc} ${t.cat}`)
      } catch {
        hit = false
      }
    } else hit = hay.includes(p.toLowerCase())
    if (hit && accounts.some((a) => a.id === r.account)) return r.account
  }
  const byName = accounts.find((a) => t.cat && a.name.toLowerCase() === t.cat.toLowerCase())
  return byName?.id ?? ''
}

export function periodKey(date: string, by: Period): string {
  const y = date.slice(0, 4), m = Number(date.slice(5, 7))
  return by === 'year' ? y : by === 'quarter' ? `${y}-Q${Math.ceil(m / 3)}` : date.slice(0, 7)
}

export interface Line { account: Account; values: number[]; total: number }
export interface Statement {
  periods: string[]
  sections: Record<Section, Line[]>
  sum: Record<Section, number[]>
  gross: number[]
  operating: number[]
  pretax: number[]
  net: number[]
  uncategorized: { count: number; amount: number }
}

/**
 * Builds the statement. Values are shown "natural side up": revenue and other income positive,
 * costs positive (so lines read as amounts); totals use signed bank amounts underneath.
 */
export function statement(txns: Txn[], assign: string[], accounts: Account[], by: Period): Statement {
  const periods = [...new Set(txns.map((t) => periodKey(t.date, by)))].sort()
  const pi = new Map(periods.map((p, i) => [p, i]))
  const acc = new Map(accounts.map((a) => [a.id, a]))
  const signed = new Map<string, number[]>()
  let uc = 0, ua = 0
  txns.forEach((t, i) => {
    const a = acc.get(assign[i])
    if (!a) {
      uc++
      ua += t.amount
      return
    }
    if (!signed.has(a.id)) signed.set(a.id, periods.map(() => 0))
    signed.get(a.id)![pi.get(periodKey(t.date, by))!] += t.amount
  })
  const zero = () => periods.map(() => 0)
  const sections = Object.fromEntries(SECTIONS.map(([s]) => [s, [] as Line[]])) as Record<Section, Line[]>
  const sum = Object.fromEntries(SECTIONS.map(([s]) => [s, zero()])) as Record<Section, number[]>
  for (const a of accounts) {
    const v = signed.get(a.id)
    if (!v) continue
    // expenses come in negative from bank data: flip so cost lines read positive
    const flip = a.section === 'cogs' || a.section === 'opex' || a.section === 'tax' ? -1 : 1
    const values = v.map((x) => x * flip)
    sections[a.section].push({ account: a, values, total: values.reduce((p, c) => p + c, 0) })
    values.forEach((x, k) => (sum[a.section][k] += x))
  }
  const gross = periods.map((_, k) => sum.revenue[k] - sum.cogs[k])
  const operating = periods.map((_, k) => gross[k] - sum.opex[k])
  const pretax = periods.map((_, k) => operating[k] + sum.other[k])
  const net = periods.map((_, k) => pretax[k] - sum.tax[k])
  return { periods, sections, sum, gross, operating, pretax, net, uncategorized: { count: uc, amount: ua } }
}

export const total = (a: number[]) => a.reduce((p, c) => p + c, 0)
