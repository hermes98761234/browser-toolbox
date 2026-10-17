// Receipt text parsing: merchant, date, totals, tax and line items from OCR'd or pasted text.

export interface Item { desc: string; qty: number; price: number; total: number }
export interface Parsed {
  merchant: string
  date: string // ISO yyyy-mm-dd or ''
  time: string
  currency: string
  subtotal: number | null
  tax: number | null
  taxRate: number | null
  tip: number | null
  discount: number | null
  total: number | null
  payment: string
  items: Item[]
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Parses an amount like "1,234.56", "1.234,56", "12,50", "-3.00", "3.00-" → number. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,-]/g, '')
  const neg = /-/.test(s)
  s = s.replace(/-/g, '')
  if (!/\d/.test(s)) return null
  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  if (lastSep >= 0 && s.length - lastSep - 1 === 2) s = s.slice(0, lastSep).replace(/[.,]/g, '') + '.' + s.slice(lastSep + 1)
  else s = s.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? (neg ? -n : n) : null
}

const pad = (n: number) => String(n).padStart(2, '0')
const valid = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate()

/** Finds the first plausible date. `dmy` decides ambiguous 03/04/2026 (true = 3 April). */
export function findDate(text: string, dmy = true): string {
  const y4 = (y: number) => (y < 100 ? 2000 + y : y)
  let m = /\b(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text)
  if (m && valid(+m[1], +m[2], +m[3])) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(text)
  if (m) {
    const a = +m[1], b = +m[2], y = y4(+m[3])
    let [d, mo] = dmy ? [a, b] : [b, a]
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]
    if (valid(y, mo, d)) return `${y}-${pad(mo)}-${pad(d)}`
  }
  m = /\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s*(\d{2,4})\b/i.exec(text)
  if (m) {
    const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1, y = y4(+m[3])
    if (valid(y, mo, +m[1])) return `${y}-${pad(mo)}-${pad(+m[1])}`
  }
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2}),?\s*(\d{2,4})\b/i.exec(text)
  if (m) {
    const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1, y = y4(+m[3])
    if (valid(y, mo, +m[2])) return `${y}-${pad(mo)}-${pad(+m[2])}`
  }
  return ''
}

const AMT = String.raw`-?\s?(?:[$€£¥₴]|zł|PLN|EUR|USD|GBP|UAH)?\s?-?\d{1,3}(?:[ ,.]\d{3})*[.,]\d{2}-?(?:\s?(?:€|zł|PLN|EUR|USD|GBP|UAH|грн))?`
const amtAtEnd = new RegExp(`(${AMT})\\s*[A-Z]?\\s*$`)

function detectCurrency(text: string): string {
  const pairs: [RegExp, string][] = [[/€|\bEUR\b/, '€'], [/£|\bGBP\b/, '£'], [/₴|\bUAH\b|грн/i, '₴'], [/zł|\bPLN\b/i, 'zł'], [/¥|\bJPY\b/, '¥'], [/\bCHF\b/, 'CHF'], [/\$|\bUSD\b/, '$']]
  for (const [re, c] of pairs) if (re.test(text)) return c
  return ''
}

const KEY = {
  total: /\b(grand\s*total|total\s*due|amount\s*due|balance\s*due|total|to\s*pay|sum|razem|suma|разом|сума|итого|summe|gesamt|totale|montant)\b/i,
  subtotal: /\b(sub\s*-?\s*total|net\s*total|net\s*amount|zwischensumme)\b/i,
  tax: /\b(tax|vat|gst|hst|pst|mwst|iva|tva|ptu|пдв|ндс)\b/i,
  tip: /\b(tip|gratuity|service\s*charge)\b/i,
  discount: /\b(discount|savings|coupon|promo|rabat)\b/i,
  skip: /\b(change|cash|bar|paid|given|rückgeld|wechselgeld|reszta|решта|сдача|tendered|card|visa|mastercard|amex|maestro|debit|credit|auth|approval|ref|terminal|tel|phone|thank|www\.|vat\s*no|vat\s*reg|tax\s*id|nip|items?\s*sold|qty|loyalty|points)\b/i,
}

export function parseReceipt(text: string, dmy = true): Parsed {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const out: Parsed = { merchant: '', date: findDate(text, dmy), time: '', currency: detectCurrency(text), subtotal: null, tax: null, taxRate: null, tip: null, discount: null, total: null, payment: '', items: [] }
  const tm = /\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\s*([ap]\.?m\.?)?/i.exec(text)
  if (tm) {
    let h = +tm[1]
    if (tm[3] && /p/i.test(tm[3]) && h < 12) h += 12
    if (tm[3] && /a/i.test(tm[3]) && h === 12) h = 0
    out.time = `${pad(h)}:${tm[2]}`
  }
  out.merchant = lines.find((l) => /[a-z]{3,}/i.test(l) && !amtAtEnd.test(l) && !/\d{2}[-/.]\d{2}|receipt|invoice|welcome|tel|phone|www|@/i.test(l))?.slice(0, 60) ?? ''
  const pay = /\b(visa|mastercard|amex|american express|maestro|discover|apple pay|google pay|contactless|debit|credit|cash)\b/i.exec(text)
  if (pay) {
    const last4 = /(?:\*{2,}|x{2,}|ending(?: in)?\s*)\s*(\d{4})\b/i.exec(text)
    out.payment = pay[1].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) + (last4 ? ` ····${last4[1]}` : '')
  }
  const totals: number[] = []
  for (const line of lines) {
    const am = amtAtEnd.exec(line)
    if (!am) continue
    const value = parseAmount(am[1])
    if (value === null) continue
    const label = line.slice(0, am.index).trim()
    if (KEY.subtotal.test(label)) out.subtotal = value
    else if (KEY.tax.test(label) && !/incl|included|excl/i.test(label) && !KEY.total.test(label.replace(KEY.tax, ''))) {
      out.tax = (out.tax ?? 0) + value
      const rate = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(label)
      if (rate) out.taxRate = Number(rate[1].replace(',', '.'))
    } else if (KEY.tax.test(label) && /incl|included/i.test(label)) {
      out.tax = value // VAT already included in the prices (EU style)
      const rate = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(label)
      if (rate) out.taxRate = Number(rate[1].replace(',', '.'))
    } else if (KEY.tip.test(label)) out.tip = value
    else if (KEY.discount.test(label)) out.discount = -Math.abs(value)
    else if (KEY.total.test(label)) totals.push(value)
    else if (totals.length || KEY.skip.test(label) || !/[a-z]{2,}/i.test(label)) continue
    else {
      // line item, optionally "2 x 3.50" / "2 @ 3.50" / "3.50 x 2"
      let qty = 1, price = value
      const q = /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:x|@|×|\*)\s*(\d+[.,]\d{2})/i.exec(label) ?? /(\d+[.,]\d{2})\s*(?:x|×|\*)\s*(\d+)(?!\S)/i.exec(label)
      let desc = label
      if (q) {
        const a = parseAmount(q[1])!, b = parseAmount(q[2])!
        ;[qty, price] = /\d+[.,]\d{2}/.test(q[1]) && !/\d+[.,]\d{2}/.test(q[2]) ? [b, a] : [a, b]
        desc = label.replace(q[0], ' ').trim()
      } else if (/^\d{1,3}\s+\D/.test(label)) {
        qty = +label.split(' ')[0]
        desc = label.replace(/^\d+\s+/, '')
        price = qty ? Math.round((value / qty) * 100) / 100 : value
      }
      desc = desc.replace(/\s+[A-Z]$/, '').replace(/[.\s]+$/, '').trim()
      out.items.push({ desc, qty, price, total: value })
    }
  }
  if (totals.length) out.total = Math.max(...totals)
  if (out.total === null && out.subtotal !== null) out.total = round2(out.subtotal + (out.tax ?? 0) + (out.tip ?? 0))
  if (out.taxRate === null && out.tax && out.subtotal) out.taxRate = round2((out.tax / out.subtotal) * 100)
  return out
}

export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

export interface Check { label: string; ok: boolean; detail: string }

/** Arithmetic checks between items, subtotal, tax, tip, discount and total (1-cent tolerance). */
export function checks(p: { items: Item[]; subtotal: number | null; tax: number | null; tip: number | null; discount: number | null; total: number | null; taxIncluded: boolean }): Check[] {
  const out: Check[] = []
  const f = (x: number) => x.toFixed(2)
  const itemSum = round2(p.items.reduce((a, i) => a + i.total, 0))
  for (const it of p.items) if (Math.abs(round2(it.qty * it.price) - it.total) > 0.011) out.push({ label: `“${it.desc}” line`, ok: false, detail: `${it.qty} × ${f(it.price)} = ${f(round2(it.qty * it.price))}, receipt says ${f(it.total)}` })
  const base = p.subtotal ?? (p.items.length ? itemSum : null)
  if (p.items.length && p.subtotal !== null) {
    const ok = Math.abs(itemSum + (p.discount ?? 0) - p.subtotal) < 0.011 || Math.abs(itemSum - p.subtotal) < 0.011
    out.push({ label: 'Items add up to subtotal', ok, detail: `items ${f(itemSum)}${p.discount ? ` ${f(p.discount)} discount` : ''} vs subtotal ${f(p.subtotal)}` })
  }
  if (base !== null && p.total !== null) {
    const expect = round2(base + (p.taxIncluded ? 0 : (p.tax ?? 0)) + (p.tip ?? 0) + (p.subtotal === null ? (p.discount ?? 0) : 0))
    out.push({ label: p.taxIncluded ? 'Subtotal + tip = total (tax included)' : 'Subtotal + tax + tip = total', ok: Math.abs(expect - p.total) < 0.011, detail: `${f(expect)} vs total ${f(p.total)} (diff ${f(round2(p.total - expect))})` })
  }
  return out
}

export const SAMPLE_TEXT = `GREEN LEAF MARKET
214 Elm Street, Portland OR 97204
Tel (503) 555-0142
10/14/2026  6:42 PM   Reg 03  #4471

Organic Bananas 2 x 0.79      1.58
Sourdough Loaf                5.49
Oat Milk 1L                   3.99
Free Range Eggs 12ct          6.29
Avocado 3 @ 1.25              3.75
Dark Chocolate 70%            3.49
Coffee Beans 340g            12.99

SUBTOTAL                     37.58
TAX 4.5%                      1.69
TOTAL                        39.27

VISA ************4821        39.27
AUTH 093311
THANK YOU FOR SHOPPING LOCAL!`
