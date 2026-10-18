// Recurring invoices: schedules (with month-end clamping), totals, numbering and PDF rendering via pdf-lib.

export type Freq = 'weekly' | 'monthly' | 'quarterly' | 'yearly'
export interface Line { desc: string; qty: number; price: number }
export interface Template {
  id: string
  client: string
  email: string
  address: string
  items: Line[]
  taxPct: number
  freq: Freq
  start: string
  terms: number
  active: boolean
  /** stop after this many invoices (0 = no limit) */
  limit: number
  note: string
}
export interface Invoice { id: string; number: string; templateId: string; client: string; email: string; address: string; issue: string; due: string; items: Line[]; taxPct: number; subtotal: number; tax: number; total: number; paid: boolean; note: string }
export interface Business { name: string; address: string; email: string; taxId: string; payment: string; currency: string; prefix: string; next: number }

const D = 86400000
const parse = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10)
export const addDays = (s: string, n: number) => fmt(parse(s) + n * D)

/** Adds months keeping the start's day-of-month, clamped to the month's last day (31 Jan → 28/29 Feb → 31 Mar). */
export function addMonthsClamped(start: string, n: number): string {
  const y = +start.slice(0, 4), m = +start.slice(5, 7) - 1 + n, d = +start.slice(8, 10)
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return fmt(Date.UTC(y, m, Math.min(d, last)))
}

/** k-th issue date of a schedule (k = 0 is the start). */
export function issueDate(t: Pick<Template, 'start' | 'freq'>, k: number): string {
  return t.freq === 'weekly' ? addDays(t.start, 7 * k) : addMonthsClamped(t.start, k * (t.freq === 'monthly' ? 1 : t.freq === 'quarterly' ? 3 : 12))
}

/** Issue dates in [from, to], honouring the invoice limit. */
export function scheduleBetween(t: Template, from: string, to: string): string[] {
  const out: string[] = []
  for (let k = 0; k < 2000; k++) {
    if (t.limit > 0 && k >= t.limit) break
    const d = issueDate(t, k)
    if (d > to) break
    if (d >= from) out.push(d)
  }
  return out
}

export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100
export function totals(items: Line[], taxPct: number): { subtotal: number; tax: number; total: number } {
  const subtotal = round2(items.reduce((a, l) => a + round2(l.qty * l.price), 0))
  const tax = round2((subtotal * taxPct) / 100)
  return { subtotal, tax, total: round2(subtotal + tax) }
}

/** Monthly-equivalent revenue of a template (for MRR). */
export function monthly(t: Template): number {
  const f = t.freq === 'weekly' ? 52 / 12 : t.freq === 'monthly' ? 1 : t.freq === 'quarterly' ? 1 / 3 : 1 / 12
  return t.active ? totals(t.items, t.taxPct).subtotal * f : 0
}

export const invoiceNumber = (prefix: string, n: number, issue: string) => prefix.replace('{YYYY}', issue.slice(0, 4)).replace('{MM}', issue.slice(5, 7)) + String(n).padStart(4, '0')

/** Invoices that should exist up to `today` but have not been generated yet. */
export function dueToGenerate(templates: Template[], invoices: Invoice[], today: string): { t: Template; issue: string }[] {
  const have = new Set(invoices.map((i) => i.templateId + '|' + i.issue))
  const out: { t: Template; issue: string }[] = []
  for (const t of templates) {
    if (!t.active) continue
    for (const d of scheduleBetween(t, '0000-01-01', today)) if (!have.has(t.id + '|' + d)) out.push({ t, issue: d })
  }
  return out.sort((a, b) => (a.issue < b.issue ? -1 : a.issue > b.issue ? 1 : 0))
}

export function makeInvoice(t: Template, issue: string, number: string, id: string): Invoice {
  const tt = totals(t.items, t.taxPct)
  return { id, number, templateId: t.id, client: t.client, email: t.email, address: t.address, issue, due: addDays(issue, t.terms), items: t.items.map((l) => ({ ...l })), taxPct: t.taxPct, ...tt, paid: false, note: t.note }
}

// ---------- PDF ----------

export async function invoicesPdf(invoices: Invoice[], biz: Business): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle(invoices.length === 1 ? `Invoice ${invoices[0].number}` : `${invoices.length} invoices`)
  doc.setAuthor(biz.name)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const okChar = new Map<string, boolean>()
  // Standard fonts only cover WinAnsi: replace anything else so generation never fails.
  const safe = (s: string) => [...s].map((ch) => {
    if (!okChar.has(ch)) { try { font.encodeText(ch); okChar.set(ch, true) } catch { okChar.set(ch, false) } }
    return okChar.get(ch) ? ch : '?'
  }).join('')
  const cur = safe(biz.currency) === biz.currency ? biz.currency : biz.currency === '₴' ? 'UAH ' : '?'
  const money = (x: number) => `${x < 0 ? '-' : ''}${cur}${Math.abs(x).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
  const accent = rgb(0.27, 0.29, 0.85), grey = rgb(0.4, 0.42, 0.47), dark = rgb(0.07, 0.09, 0.15)
  for (const inv of invoices) {
    const page = doc.addPage([595.28, 841.89])
    const W = page.getWidth()
    const text = (t: string, x: number, y: number, o: { size?: number; b?: boolean; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
      const f = o.b ? bold : font, size = o.size ?? 10, str = safe(t)
      page.drawText(str, { x: o.right ? x - f.widthOfTextAtSize(str, size) : x, y, size, font: f, color: o.color ?? dark })
    }
    page.drawRectangle({ x: 0, y: 841.89 - 8, width: W, height: 8, color: accent })
    text(biz.name || 'Your business', 50, 780, { size: 18, b: true })
    biz.address.split('\n').forEach((l, i) => text(l, 50, 762 - i * 12, { color: grey }))
    if (biz.email) text(biz.email, 50, 762 - biz.address.split('\n').length * 12, { color: grey })
    if (biz.taxId) text(`Tax ID: ${biz.taxId}`, 50, 750 - biz.address.split('\n').length * 12, { color: grey })
    text('INVOICE', W - 50, 780, { size: 22, b: true, color: accent, right: true })
    text(`No. ${inv.number}`, W - 50, 760, { right: true, b: true })
    text(`Issued ${inv.issue}`, W - 50, 746, { right: true, color: grey })
    text(`Due ${inv.due}`, W - 50, 732, { right: true, color: grey })
    text('BILL TO', 50, 680, { size: 8, b: true, color: grey })
    text(inv.client, 50, 666, { size: 12, b: true })
    inv.address.split('\n').forEach((l, i) => text(l, 50, 652 - i * 12, { color: grey }))
    if (inv.email) text(inv.email, 50, 652 - inv.address.split('\n').length * 12, { color: grey })
    let y = 580
    page.drawRectangle({ x: 50, y: y - 6, width: W - 100, height: 20, color: rgb(0.94, 0.95, 0.98) })
    text('Description', 58, y, { b: true, size: 9 }); text('Qty', 360, y, { b: true, size: 9, right: true }); text('Unit price', 450, y, { b: true, size: 9, right: true }); text('Amount', W - 58, y, { b: true, size: 9, right: true })
    y -= 24
    for (const l of inv.items) {
      text(l.desc.slice(0, 60), 58, y); text(String(l.qty), 360, y, { right: true }); text(money(l.price), 450, y, { right: true }); text(money(round2(l.qty * l.price)), W - 58, y, { right: true })
      page.drawLine({ start: { x: 50, y: y - 8 }, end: { x: W - 50, y: y - 8 }, thickness: 0.5, color: rgb(0.88, 0.89, 0.92) })
      y -= 22
    }
    y -= 8
    text('Subtotal', 450, y, { right: true, color: grey }); text(money(inv.subtotal), W - 58, y, { right: true }); y -= 16
    text(`Tax (${inv.taxPct}%)`, 450, y, { right: true, color: grey }); text(money(inv.tax), W - 58, y, { right: true }); y -= 22
    page.drawRectangle({ x: 330, y: y - 8, width: W - 380, height: 24, color: accent })
    text('Total due', 340, y, { b: true, color: rgb(1, 1, 1) }); text(money(inv.total), W - 58, y, { b: true, right: true, color: rgb(1, 1, 1), size: 12 })
    y -= 50
    if (biz.payment) { text('PAYMENT DETAILS', 50, y, { size: 8, b: true, color: grey }); biz.payment.split('\n').forEach((l, i) => text(l, 50, y - 14 - i * 12)); y -= 30 + biz.payment.split('\n').length * 12 }
    if (inv.note) { text('NOTE', 50, y, { size: 8, b: true, color: grey }); text(inv.note.slice(0, 110), 50, y - 14) }
    text(`${biz.name} · Invoice ${inv.number} · Payment due ${inv.due}`, W / 2 - font.widthOfTextAtSize(safe(`${biz.name} · Invoice ${inv.number} · Payment due ${inv.due}`), 8) / 2, 40, { size: 8, color: grey })
    if (inv.paid) {
      page.drawText('PAID', { x: 380, y: 640, size: 60, font: bold, color: rgb(0.06, 0.6, 0.4), opacity: 0.25 })
    }
  }
  return doc.save()
}
