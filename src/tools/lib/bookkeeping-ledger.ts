// Bookkeeping Ledger logic: double-entry validation, general ledger with running balances,
// trial balance, statements, and CSV import/export. Amounts are handled in integer cents.
import { parseCsv, detectDelimiter, csvCell } from './csv-json-converter'

export type AType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export interface Account { code: string; name: string; type: AType; current?: boolean; contra?: boolean }
export interface Line { account: string; debit: number; credit: number }
export interface Entry { id: string; date: string; ref: string; memo: string; lines: Line[] }

export const cents = (x: number) => Math.round((Number(x) || 0) * 100)
/** +1 when the account normally carries a debit balance. */
export const normal = (a: Account) => ((a.type === 'asset' || a.type === 'expense') !== !!a.contra ? 1 : -1)

/** Problems that prevent posting an entry (empty array = valid). */
export function validate(e: Entry, accounts: Account[]): string[] {
  const errs: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date) || Number.isNaN(Date.parse(e.date))) errs.push('Enter a valid date.')
  const used = e.lines.filter((l) => l.account || cents(l.debit) || cents(l.credit))
  if (used.length < 2) errs.push('An entry needs at least two lines.')
  used.forEach((l, i) => {
    if (!accounts.some((a) => a.code === l.account)) errs.push(`Line ${i + 1}: choose an account.`)
    const d = cents(l.debit), c = cents(l.credit)
    if (d < 0 || c < 0) errs.push(`Line ${i + 1}: amounts can't be negative.`)
    if ((d > 0) === (c > 0)) errs.push(`Line ${i + 1}: enter either a debit or a credit.`)
  })
  const { dr, cr } = totals(used)
  if (dr !== cr) errs.push(`Debits ${(dr / 100).toFixed(2)} ≠ credits ${(cr / 100).toFixed(2)} (difference ${(Math.abs(dr - cr) / 100).toFixed(2)}).`)
  if (dr === 0 && used.length >= 2) errs.push('The entry has no amounts.')
  return errs
}

export function totals(lines: Line[]): { dr: number; cr: number } {
  return lines.reduce((t, l) => ({ dr: t.dr + cents(l.debit), cr: t.cr + cents(l.credit) }), { dr: 0, cr: 0 })
}

const inRange = (d: string, from?: string, to?: string) => (!from || d >= from) && (!to || d <= to)
const byDate = (a: Entry, b: Entry) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref)

/** Net debit balance (cents) per account code for entries in range. */
export function balances(entries: Entry[], from?: string, to?: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of entries) {
    if (!inRange(e.date, from, to)) continue
    for (const l of e.lines) m.set(l.account, (m.get(l.account) ?? 0) + cents(l.debit) - cents(l.credit))
  }
  return m
}

export interface GLRow { date: string; ref: string; memo: string; debit: number; credit: number; balance: number }
/** Postings to one account with a running balance in the account's normal direction (cents). */
export function ledger(entries: Entry[], acc: Account, from?: string, to?: string): { opening: number; rows: GLRow[]; closing: number } {
  const sign = normal(acc)
  let bal = from ? (balances(entries, undefined, prevDay(from)).get(acc.code) ?? 0) * sign : 0
  const opening = bal
  const rows: GLRow[] = []
  for (const e of [...entries].sort(byDate)) {
    if (!inRange(e.date, from, to)) continue
    for (const l of e.lines) {
      if (l.account !== acc.code) continue
      const d = cents(l.debit), c = cents(l.credit)
      bal += (d - c) * sign
      rows.push({ date: e.date, ref: e.ref, memo: e.memo, debit: d, credit: c, balance: bal })
    }
  }
  return { opening, rows, closing: bal }
}
function prevDay(d: string): string {
  const t = new Date(d + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() - 1)
  return t.toISOString().slice(0, 10)
}

export interface TBRow { acc: Account; debit: number; credit: number }
/** Trial balance as of a date: each account's net balance in the debit or credit column (cents). */
export function trialBalance(accounts: Account[], entries: Entry[], to?: string): { rows: TBRow[]; dr: number; cr: number } {
  const b = balances(entries, undefined, to)
  const rows = accounts.map((acc) => {
    const v = b.get(acc.code) ?? 0
    return { acc, debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0 }
  }).filter((r) => r.debit || r.credit)
  return { rows, dr: rows.reduce((a, r) => a + r.debit, 0), cr: rows.reduce((a, r) => a + r.credit, 0) }
}

/** Totals by type in natural sign (cents), plus net income and the accounting-equation check. */
export function summary(accounts: Account[], entries: Entry[], from?: string, to?: string) {
  const all = balances(entries, undefined, to), period = balances(entries, from, to)
  const sumType = (t: AType, m: Map<string, number>) => accounts.filter((a) => a.type === t).reduce((s, a) => s + (m.get(a.code) ?? 0) * normal({ ...a, contra: false }), 0)
  const assets = sumType('asset', all), liabilities = sumType('liability', all), equity = sumType('equity', all)
  const revenue = sumType('revenue', period), expenses = sumType('expense', period)
  const niAll = sumType('revenue', all) - sumType('expense', all)
  return { assets, liabilities, equity, revenue, expenses, netIncome: revenue - expenses, balanced: assets === liabilities + equity + niAll, retained: niAll }
}

export const JOURNAL_HEAD = ['Date', 'Entry', 'Reference', 'Description', 'Account', 'Account name', 'Debit', 'Credit']

export function journalCsv(entries: Entry[], accounts: Account[]): string {
  const name = (c: string) => accounts.find((a) => a.code === c)?.name ?? ''
  const rows = [JOURNAL_HEAD, ...[...entries].sort(byDate).flatMap((e) => e.lines.map((l) => [e.date, e.id, e.ref, e.memo, l.account, name(l.account), cents(l.debit) ? (cents(l.debit) / 100).toFixed(2) : '', cents(l.credit) ? (cents(l.credit) / 100).toFixed(2) : '']))]
  return rows.map((r) => r.map((c) => csvCell(c)).join(',')).join('\r\n')
}

const num = (s: string) => {
  const t = (s ?? '').replace(/[\s$€£,]/g, '').replace(/^\((.*)\)$/, '-$1')
  return t === '' ? 0 : Number(t)
}

/**
 * Imports journal lines (columns found by header name: date, entry/id, reference, description,
 * account (code or name), debit, credit — or a single signed amount). Lines sharing an entry id
 * (or date+reference) become one entry. Unknown account names are reported.
 */
export function importJournal(text: string, accounts: Account[]): { entries: Entry[]; errors: string[] } {
  const rows = parseCsv(text, detectDelimiter(text))
  if (rows.length < 2) return { entries: [], errors: ['No data rows found.'] }
  const h = rows[0].map((x) => x.trim().toLowerCase())
  const col = (...re: RegExp[]) => h.findIndex((x) => re.some((r) => r.test(x)))
  const ci = { date: col(/^date/), id: col(/^entry|^id$|^journal/), ref: col(/^ref/), memo: col(/desc|memo|narration/), acc: col(/^account$|^account code|^code/), accName: col(/account name|^name$/), dr: col(/^debit/), cr: col(/^credit/), amt: col(/^amount/) }
  if (ci.date < 0 || (ci.acc < 0 && ci.accName < 0) || (ci.dr < 0 && ci.amt < 0)) return { entries: [], errors: ['Need Date, Account and Debit/Credit (or Amount) columns.'] }
  const map = new Map<string, Entry>()
  const errors: string[] = []
  rows.slice(1).forEach((r, i) => {
    const key = (ci.id >= 0 && r[ci.id]) || `${r[ci.date]}|${ci.ref >= 0 ? r[ci.ref] : ''}`
    const raw = (ci.acc >= 0 ? r[ci.acc] : r[ci.accName])?.trim() ?? ''
    const acc = accounts.find((a) => a.code === raw) ?? accounts.find((a) => a.name.toLowerCase() === raw.toLowerCase() || a.name.toLowerCase() === (r[ci.accName] ?? '').trim().toLowerCase())
    if (!acc) {
      errors.push(`Row ${i + 2}: unknown account "${raw}".`)
      return
    }
    let debit = ci.dr >= 0 ? num(r[ci.dr]) : 0, credit = ci.cr >= 0 ? num(r[ci.cr]) : 0
    if (ci.dr < 0) {
      const a = num(r[ci.amt])
      debit = a > 0 ? a : 0
      credit = a < 0 ? -a : 0
    }
    if (!Number.isFinite(debit) || !Number.isFinite(credit)) {
      errors.push(`Row ${i + 2}: amount not understood.`)
      return
    }
    const e = map.get(key) ?? { id: ci.id >= 0 && r[ci.id] ? r[ci.id] : `imp-${map.size + 1}`, date: (r[ci.date] ?? '').trim(), ref: ci.ref >= 0 ? (r[ci.ref] ?? '') : '', memo: ci.memo >= 0 ? (r[ci.memo] ?? '') : '', lines: [] }
    e.lines.push({ account: acc.code, debit, credit })
    map.set(key, e)
  })
  const entries = [...map.values()]
  entries.forEach((e) => {
    const v = validate(e, accounts)
    if (v.length) errors.push(`Entry ${e.ref || e.id} (${e.date}): ${v[0]}`)
  })
  return { entries, errors }
}

/** Trial balance in the "Name,Section,Amount" format the Balance Sheet Generator imports. */
export function balanceSheetCsv(accounts: Account[], entries: Entry[], to?: string): string {
  const b = balances(entries, undefined, to)
  const s = summary(accounts, entries, undefined, to)
  const sec = (a: Account) => (a.type === 'asset' ? (a.current === false ? 'Non-current assets' : 'Current assets') : a.type === 'liability' ? (a.current === false ? 'Non-current liabilities' : 'Current liabilities') : 'Equity')
  const lines = [['Account', 'Section', 'Amount']]
  for (const a of accounts) {
    if (a.type === 'revenue' || a.type === 'expense') continue
    const v = (b.get(a.code) ?? 0) * normal({ ...a, contra: false })
    if (v) lines.push([a.name, sec(a), (v / 100).toFixed(2)])
  }
  if (s.retained) lines.push(['Retained earnings (current profit)', 'Equity', (s.retained / 100).toFixed(2)])
  return lines.map((r) => r.map((c) => csvCell(c)).join(',')).join('\r\n')
}

/** Revenue and expense postings as signed transactions for the Profit & Loss Builder. */
export function plCsv(accounts: Account[], entries: Entry[]): string {
  const lines = [['Date', 'Description', 'Amount', 'Category']]
  for (const e of [...entries].sort(byDate)) for (const l of e.lines) {
    const a = accounts.find((x) => x.code === l.account)
    if (!a || (a.type !== 'revenue' && a.type !== 'expense')) continue
    const v = (cents(l.credit) - cents(l.debit)) / 100
    lines.push([e.date, e.memo || e.ref, v.toFixed(2), a.name])
  }
  return lines.map((r) => r.map((c) => csvCell(c)).join(',')).join('\r\n')
}
