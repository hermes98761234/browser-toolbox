// Loan amortization: level payment, schedules with extra payments, and a minimal XLSX writer.
import { zipDeflate } from './excel-to-csv'

export type Freq = 'monthly' | 'biweekly' | 'accelerated' | 'weekly'
export const PER_YEAR: Record<Freq, number> = { monthly: 12, biweekly: 26, accelerated: 26, weekly: 52 }

/** Level payment for principal `p`, periodic rate `r`, `n` periods. */
export function payment(p: number, r: number, n: number): number {
  if (n <= 0) return 0
  if (r === 0) return p / n
  return (p * r) / (1 - Math.pow(1 + r, -n))
}

export interface LoanIn {
  principal: number
  apr: number // %
  years: number
  freq: Freq
  start: string // first payment date, ISO
  extra: number // added to every payment
  yearlyExtra: number // once a year…
  yearlyMonth: number // …in this calendar month (1–12)
  lumps: { date: string; amount: number }[]
}
export interface Row { n: number; date: string; payment: number; interest: number; principal: number; extra: number; balance: number; cumInterest: number }

const r2 = (x: number) => Math.round(x * 100) / 100

function addPeriod(iso: string, freq: Freq, k: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  if (freq === 'monthly') {
    const day = d.getUTCDate()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() + k)
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    d.setUTCDate(Math.min(day, last))
  } else d.setUTCDate(d.getUTCDate() + k * (freq === 'weekly' ? 7 : 14))
  return d.toISOString().slice(0, 10)
}

/** Scheduled payment per period (accelerated bi-weekly = half the monthly payment, every two weeks). */
export function basePayment(l: Pick<LoanIn, 'principal' | 'apr' | 'years' | 'freq'>): number {
  if (l.freq === 'accelerated') return payment(l.principal, l.apr / 1200, l.years * 12) / 2
  const k = PER_YEAR[l.freq]
  return payment(l.principal, l.apr / 100 / k, Math.round(l.years * k))
}

export function schedule(l: LoanIn, withExtras = true): Row[] {
  const k = PER_YEAR[l.freq]
  const r = l.apr / 100 / k
  const pay = r2(basePayment(l))
  const rows: Row[] = []
  let bal = l.principal, cum = 0
  const maxN = Math.round(l.years * k) + 5
  for (let n = 1; bal > 0.005 && n <= maxN * 2; n++) {
    const date = addPeriod(l.start, l.freq, n - 1)
    const prev = n === 1 ? '' : addPeriod(l.start, l.freq, n - 2)
    const interest = r2(bal * r)
    let princ = Math.min(bal, r2(pay - interest))
    if (princ < 0) princ = 0
    if (bal - princ <= pay * 0.02) princ = bal // last instalment absorbs cent rounding
    let extra = 0
    if (withExtras) {
      extra += l.extra
      const m = Number(date.slice(5, 7))
      const pm = prev ? Number(prev.slice(5, 7)) : 0
      if (l.yearlyExtra > 0 && m === l.yearlyMonth && (pm !== m || !prev)) extra += l.yearlyExtra
      for (const s of l.lumps) if (s.amount > 0 && s.date <= date && (!prev || s.date > prev)) extra += s.amount
    }
    extra = Math.min(extra, r2(bal - princ))
    bal = r2(bal - princ - extra)
    cum = r2(cum + interest)
    rows.push({ n, date, payment: r2(princ + interest), interest, principal: princ, extra: r2(extra), balance: Math.max(0, bal), cumInterest: cum })
    if (n > 5000) break
  }
  return rows
}

export function summary(rows: Row[]) {
  const interest = rows.reduce((a, x) => a + x.interest, 0)
  const paid = rows.reduce((a, x) => a + x.payment + x.extra, 0)
  return { periods: rows.length, interest: r2(interest), paid: r2(paid), payoff: rows[rows.length - 1]?.date ?? '' }
}

/** Yearly totals for charts and the grouped view. */
export function byYear(rows: Row[]) {
  const m = new Map<string, { year: string; interest: number; principal: number; extra: number; balance: number }>()
  for (const x of rows) {
    const y = x.date.slice(0, 4)
    const e = m.get(y) ?? { year: y, interest: 0, principal: 0, extra: 0, balance: 0 }
    e.interest = r2(e.interest + x.interest)
    e.principal = r2(e.principal + x.principal)
    e.extra = r2(e.extra + x.extra)
    e.balance = x.balance
    m.set(y, e)
  }
  return [...m.values()]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const col = (i: number) => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26))

/** Single-sheet XLSX: strings as inline strings, numbers with a 2-decimal style, bold header, frozen first row. */
export async function toXlsx(sheet: string, rows: (string | number)[][]): Promise<Uint8Array> {
  const data = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = `${col(ci)}${ri + 1}`
    if (typeof v === 'number') return `<c r="${ref}" s="${Number.isInteger(v) && ci === 0 ? 0 : 1}"><v>${v}</v></c>`
    return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="2"' : ''}><is><t>${esc(v)}</t></is></c>`
  }).join('')}</row>`).join('')
  const ws = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${rows[0]?.length ?? 1}" width="15" customWidth="1"/></cols><sheetData>${data}</sheetData></worksheet>`
  return zipDeflate([
    { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheet).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>' },
    { name: 'xl/worksheets/sheet1.xml', text: ws },
  ])
}
