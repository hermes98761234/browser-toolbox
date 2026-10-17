// Bank statement CSV parsing, column detection, merchant cleanup and keyword categorisation.

export interface Txn { date: string; desc: string; amount: number; merchant: string; category: string }
export interface Rule { kw: string; cat: string }
export type DateFmt = 'ymd' | 'dmy' | 'mdy'

export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const delim = [',', ';', '\t', '|'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === delim) { row.push(cell.trim()); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

export interface Columns { date: number; desc: number; amount: number; debit: number; credit: number }

/** Guesses column roles from header names (falls back to content). -1 = absent. */
export function detectColumns(head: string[], sample: string[][]): Columns {
  const h = head.map((x) => x.toLowerCase())
  const find = (re: RegExp) => h.findIndex((x) => re.test(x))
  let date = find(/date|posted|booking|datum/)
  let desc = find(/desc|narrative|details|payee|merchant|memo|name|reference|transaction/)
  const debit = find(/debit|withdraw|paid out|money out|outflow/)
  const credit = find(/credit|deposit|paid in|money in|inflow/)
  let amount = find(/^amount|amount$|value|sum|betrag/)
  if (date < 0) date = head.findIndex((_, i) => sample.every((r) => /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(r[i] ?? '')))
  if (amount < 0 && debit < 0) amount = head.findIndex((_, i) => i !== date && sample.every((r) => /^[-+(]?[$€£]?\s?[\d.,]+\)?$/.test(r[i] ?? '')))
  if (desc < 0) {
    let best = -1, len = -1
    head.forEach((_, i) => {
      if (i === date || i === amount) return
      const l = sample.reduce((a, r) => a + (r[i]?.length ?? 0), 0)
      if (l > len) { len = l; best = i }
    })
    desc = best
  }
  return { date, desc, amount, debit, credit }
}

/** Parses "1,234.56", "1.234,56", "(12.00)", "-$5", "12.50 CR". */
export function parseAmount(s: string): number {
  let t = (s ?? '').trim()
  if (!t) return 0
  let neg = /^\(.*\)$/.test(t) || /^[^\d]*-/.test(t) || /-$/.test(t) || /\bDR\b/i.test(t)
  if (/\bCR\b/i.test(t)) neg = false
  t = t.replace(/[^\d.,]/g, '')
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.')
  if (lc > ld) t = t.replace(/\./g, '').replace(',', '.') // comma decimal
  else t = t.replace(/,/g, '')
  const v = Number(t)
  return Number.isFinite(v) ? (neg ? -v : v) : 0
}

export function detectDateFormat(samples: string[]): DateFmt {
  let dmy = 0, mdy = 0
  for (const s of samples) {
    const m = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})/.exec(s.trim())
    if (!m) continue
    if (m[1].length === 4) return 'ymd'
    if (Number(m[1]) > 12) dmy++
    if (Number(m[2]) > 12) mdy++
  }
  return mdy > dmy ? 'mdy' : 'dmy'
}

/** → YYYY-MM-DD, or '' if unparseable. */
export function parseDate(s: string, fmt: DateFmt): string {
  const m = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})/.exec((s ?? '').trim())
  if (!m) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
  }
  let [y, mo, d] = fmt === 'ymd' ? [m[1], m[2], m[3]] : fmt === 'dmy' ? [m[3], m[2], m[1]] : [m[3], m[1], m[2]]
  if (y.length === 2) y = `20${y}`
  if (Number(mo) > 12 || Number(d) > 31) return ''
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** "CARD 1234 TESCO STORES 3021 LONDON 12/09" → "Tesco Stores". */
export function normalizeMerchant(desc: string): string {
  const star = /^(?:\S+\s+)?(sq|tst|pp|paypal|sp|ws|pypl|lyft|google|apple)\s*\*\s*(.+)$/i.exec(desc)
  let t = (star ? star[2] : desc.replace(/\*.*$/, ''))
    .replace(/^(pos|card|visa|debit|purchase|payment|dd|so|bp|fpi|contactless|apple pay|google pay)\b[\s:*-]*/gi, '')
    .replace(/\b(card|ref|auth)\s*[:#]?\s*\w*\d\w*/gi, ' ')
    .replace(/\b\d{2}[/.-]\d{2}([/.-]\d{2,4})?\b/g, ' ')
    .replace(/#?\b\d{3,}\b/g, ' ')
    .replace(/\b(london|new york|nyc|ca|ny|tx|gb|us|uk|usa|www|com|ltd|inc|llc)\b\.?/gi, ' ')
    .replace(/[^\p{L}\p{N}&' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  t = t.split(' ').slice(0, 3).join(' ')
  return t.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()) || desc.trim()
}

export function categorize(desc: string, amount: number, rules: Rule[]): string {
  const d = desc.toLowerCase()
  for (const r of rules) {
    const k = r.kw.trim().toLowerCase()
    if (k && d.includes(k)) return r.cat
  }
  return amount > 0 ? 'Income' : 'Uncategorized'
}

export function toTxns(rows: string[][], cols: Columns, fmt: DateFmt, rules: Rule[], flip = false): Txn[] {
  return rows
    .map((r) => {
      let amount = cols.amount >= 0 ? parseAmount(r[cols.amount]) : 0
      if (cols.amount < 0 || (amount === 0 && cols.debit >= 0)) amount = parseAmount(r[cols.credit] ?? '') - Math.abs(parseAmount(r[cols.debit] ?? ''))
      if (flip) amount = -amount
      const desc = r[cols.desc] ?? ''
      return { date: parseDate(r[cols.date] ?? '', fmt), desc, amount, merchant: normalizeMerchant(desc), category: categorize(desc, amount, rules) }
    })
    .filter((t) => t.date && (t.amount !== 0 || t.desc))
}

export function groupSum<K extends string>(txns: Txn[], key: (t: Txn) => K): Map<K, { total: number; count: number }> {
  const m = new Map<K, { total: number; count: number }>()
  for (const t of txns) {
    const k = key(t)
    const e = m.get(k) ?? { total: 0, count: 0 }
    e.total += t.amount
    e.count++
    m.set(k, e)
  }
  return m
}
