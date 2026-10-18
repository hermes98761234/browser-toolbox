// Accounts-receivable aging: tolerant amount/date parsing, column guessing, bucketing and per-client totals.

export const BUCKETS = ['Current', '1–30', '31–60', '61–90', '90+'] as const
export type DateFmt = 'auto' | 'mdy' | 'dmy'

/** "$1,234.50", "1.234,50 €", "(300.00)", "-12" → number (NaN if unreadable). */
export function parseAmount(s: string): number {
  let t = s.trim()
  if (!t) return NaN
  let neg = false
  if (/^\(.*\)$/.test(t)) {
    neg = true
    t = t.slice(1, -1)
  }
  t = t.replace(/[^\d.,\-+]/g, '')
  if (t.startsWith('-')) {
    neg = !neg
    t = t.slice(1)
  }
  if (t.endsWith('-')) {
    neg = !neg
    t = t.slice(0, -1)
  }
  const lastDot = t.lastIndexOf('.'), lastComma = t.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  } else if (lastComma >= 0) {
    // a single comma followed by 1–2 digits is a decimal comma; otherwise thousands separators
    t = /^\d*,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '')
  } else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '')
  const v = Number(t)
  return t === '' || !Number.isFinite(v) ? NaN : neg ? -v : v
}

const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Parses ISO, slash/dot/dash numeric dates (MDY or DMY) and "12 Mar 2026" / "Mar 12, 2026" → yyyy-mm-dd or null. */
export function parseDate(s: string, fmt: DateFmt = 'auto'): string | null {
  const t = s.trim()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(t)
  if (m) {
    let y = +m[3]
    if (y < 100) y += 2000
    const a = +m[1], b = +m[2]
    if (fmt === 'mdy') return iso(y, a, b)
    if (fmt === 'dmy') return iso(y, b, a)
    if (a > 12) return iso(y, b, a)
    if (b > 12) return iso(y, a, b)
    return t.includes('.') ? iso(y, b, a) : iso(y, a, b) // dotted dates are usually D.M.Y
  }
  m = /^(\d{1,2})[\s-]([a-z]{3})[a-z]*[\s-,]+(\d{4})$/i.exec(t)
  if (m && MONTHS.includes(m[2].toLowerCase())) return iso(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1])
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(t)
  if (m && MONTHS.includes(m[1].toLowerCase())) return iso(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2])
  return null
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)

/** Bucket index for days past due (≤ 0 = current). */
export const bucketOf = (days: number) => (days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4)

export interface Mapping { client: number; invoice: number; date: number; due: number; amount: number; paid: number; balance: number }

/** Guesses column roles from header names (-1 = not present). */
export function guessMapping(head: string[]): Mapping {
  const h = head.map((x) => x.toLowerCase().trim())
  const find = (...res: RegExp[]) => {
    for (const re of res) {
      const i = h.findIndex((x) => re.test(x))
      if (i >= 0) return i
    }
    return -1
  }
  return {
    client: find(/client|customer|debtor|account name|company|bill to/, /name/),
    invoice: find(/invoice\s*(no|num|#|id)|^inv|document|ref/, /number|^no\.?$|^#$/),
    date: find(/invoice date|issue|^date$|inv.*date|posting/),
    due: find(/due/),
    amount: find(/^amount|total|invoice amount|original/, /amount/),
    paid: find(/paid|payment|received|applied/),
    balance: find(/balance|outstanding|open|remaining|amount due/),
  }
}

export interface Inv { client: string; invoice: string; date: string | null; due: string; balance: number; days: number; bucket: number; line: number }
export interface Bad { line: number; reason: string }

export function age(rows: string[][], map: Mapping, asOf: string, opts: { fmt: DateFmt; basis: 'due' | 'invoice'; terms: number }): { invs: Inv[]; bad: Bad[] } {
  const invs: Inv[] = [], bad: Bad[] = []
  rows.forEach((r, i) => {
    const line = i + 2
    const get = (k: number) => (k >= 0 ? (r[k] ?? '').trim() : '')
    if (r.every((c) => !c.trim())) return
    const client = get(map.client) || '(no client)'
    const date = map.date >= 0 ? parseDate(get(map.date), opts.fmt) : null
    let due = map.due >= 0 ? parseDate(get(map.due), opts.fmt) : null
    if (!due && date) due = new Date(Date.parse(date + 'T00:00:00Z') + opts.terms * 86400000).toISOString().slice(0, 10)
    let balance = map.balance >= 0 ? parseAmount(get(map.balance)) : NaN
    if (!Number.isFinite(balance)) {
      const amt = parseAmount(get(map.amount))
      const paid = map.paid >= 0 && get(map.paid) ? parseAmount(get(map.paid)) : 0
      balance = amt - (Number.isFinite(paid) ? paid : 0)
    }
    if (!Number.isFinite(balance)) return bad.push({ line, reason: 'no readable amount' })
    if (opts.basis === 'due' && !due) return bad.push({ line, reason: 'no readable due or invoice date' })
    if (opts.basis === 'invoice' && !date) return bad.push({ line, reason: 'no readable invoice date' })
    if (Math.abs(balance) < 0.005) return // fully paid
    const days = opts.basis === 'due' ? daysBetween(due!, asOf) : daysBetween(date!, asOf)
    invs.push({ client, invoice: get(map.invoice), date, due: due ?? '', balance: Math.round(balance * 100) / 100, days, bucket: bucketOf(days), line })
  })
  return { invs, bad }
}

export interface ClientRow { client: string; b: number[]; total: number; count: number; oldest: number }

export function byClient(invs: Inv[]): ClientRow[] {
  const map = new Map<string, ClientRow>()
  for (const v of invs) {
    const c = map.get(v.client) ?? { client: v.client, b: [0, 0, 0, 0, 0], total: 0, count: 0, oldest: 0 }
    c.b[v.bucket] += v.balance
    c.total += v.balance
    c.count++
    c.oldest = Math.max(c.oldest, v.days)
    map.set(v.client, c)
  }
  const r2 = (x: number) => Math.round(x * 100) / 100
  return [...map.values()].map((c) => ({ ...c, b: c.b.map(r2), total: r2(c.total) })).sort((a, b) => b.total - a.total)
}

/** Balance-weighted average days past due over overdue positive balances. */
export function avgDaysLate(invs: Inv[]): number {
  let num = 0, den = 0
  for (const v of invs) if (v.days > 0 && v.balance > 0) {
    num += v.days * v.balance
    den += v.balance
  }
  return den ? num / den : 0
}
