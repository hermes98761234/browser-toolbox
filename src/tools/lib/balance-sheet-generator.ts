// Balance Sheet Generator: section totals, the accounting-equation check, liquidity and
// leverage ratios, trial-balance CSV import and a formatted PDF statement (pdf-lib).

export type Section = 'ca' | 'nca' | 'cl' | 'ncl' | 'eq'
export interface Account { id: string; name: string; section: Section; cur: number; prior: number; quick: boolean }

export const SECTIONS: { id: Section; name: string; side: 'A' | 'LE' }[] = [
  { id: 'ca', name: 'Current assets', side: 'A' },
  { id: 'nca', name: 'Non-current assets', side: 'A' },
  { id: 'cl', name: 'Current liabilities', side: 'LE' },
  { id: 'ncl', name: 'Non-current liabilities', side: 'LE' },
  { id: 'eq', name: "Shareholders' equity", side: 'LE' },
]

export type Col = 'cur' | 'prior'
export interface Totals { ca: number; nca: number; cl: number; ncl: number; eq: number; assets: number; liab: number; le: number; diff: number; quickAssets: number }

export function totals(acc: Account[], col: Col): Totals {
  const s = (sec: Section) => acc.filter((a) => a.section === sec).reduce((t, a) => t + a[col], 0)
  const ca = s('ca'), nca = s('nca'), cl = s('cl'), ncl = s('ncl'), eq = s('eq')
  const assets = ca + nca, liab = cl + ncl, le = liab + eq
  const quickAssets = acc.filter((a) => a.section === 'ca' && a.quick).reduce((t, a) => t + a[col], 0)
  return { ca, nca, cl, ncl, eq, assets, liab, le, diff: round2(assets - le), quickAssets }
}

export const round2 = (x: number) => Math.round(x * 100) / 100
const div = (a: number, b: number) => (b !== 0 ? a / b : NaN)

export function ratios(t: Totals) {
  return {
    current: div(t.ca, t.cl),
    quick: div(t.quickAssets, t.cl),
    workingCapital: t.ca - t.cl,
    debtToEquity: div(t.liab, t.eq),
    debtRatio: div(t.liab, t.assets),
    equityRatio: div(t.eq, t.assets),
  }
}

const SEC_WORDS: [RegExp, Section][] = [
  [/^(ca|current assets?)$/i, 'ca'], [/^(nca|non-?current assets?|fixed assets?|long-?term assets?)$/i, 'nca'],
  [/^(cl|current liabilit(y|ies))$/i, 'cl'], [/^(ncl|non-?current liabilit(y|ies)|long-?term liabilit(y|ies))$/i, 'ncl'], [/^(eq|equity|shareholders'? equity|owners'? equity|capital)$/i, 'eq'],
]

/** Guesses the section from an account name (used when the CSV has no section column). */
export function guessSection(name: string): Section {
  const n = name.toLowerCase()
  if (/(retained|capital stock|common stock|share capital|paid-?in|owner|drawings|equity|reserves?)/.test(n)) return 'eq'
  if (/(long-?term|mortgage|bond|deferred tax liab|lease liab.*non|notes payable.*long)/.test(n)) return 'ncl'
  if (/(payable|accrued|unearned|deferred revenue|overdraft|short-?term|current portion|tax(es)? due|wages owed)/.test(n)) return 'cl'
  if (/(equipment|building|land|vehicle|machinery|furniture|depreciation|intangible|goodwill|patent|investment.*long|property)/.test(n)) return 'nca'
  return 'ca'
}

const isQuick = (name: string) => /(cash|bank|receivable|marketable|short-?term invest|money market)/i.test(name)

/** Parses "Account, [Section], Amount[, Prior]" lines (comma, semicolon or tab separated). */
export function parseTrialBalance(text: string): Omit<Account, 'id'>[] {
  const out: Omit<Account, 'id'>[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const sep = line.includes('\t') ? /\t/ : line.includes(';') ? /;/ : /,(?=(?:[^"]*"[^"]*")*[^"]*$)/
    const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
    const num = (c: string | undefined) => {
      if (c === undefined || c === '') return NaN
      const neg = /^\(.*\)$/.test(c) || /^-/.test(c)
      const v = Number(c.replace(/[()\s$€£,-]/g, ''))
      return Number.isFinite(v) ? (neg ? -v : v) : NaN
    }
    const name = cells[0]
    if (!name) continue
    let section: Section | null = null
    let rest = cells.slice(1)
    for (const [re, sec] of SEC_WORDS) if (rest[0] && re.test(rest[0])) { section = sec; rest = rest.slice(1); break }
    const cur = num(rest[0])
    if (!Number.isFinite(cur)) continue // header or junk
    const prior = num(rest[1])
    out.push({ name, section: section ?? guessSection(name), cur, prior: Number.isFinite(prior) ? prior : 0, quick: isQuick(name) })
  }
  return out
}

export const fmtAmt = (x: number, cur = '') => {
  const s = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return x < 0 ? `(${cur}${s})` : `${cur}${s}`
}

/** A4/Letter PDF of the statement with optional comparative column. */
export async function balancePdf(o: { company: string; date: string; prior: string; currency: string; accounts: Account[]; showPrior: boolean; letter?: boolean }): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle(`${o.company} – Balance Sheet`)
  doc.setCreator('Browser Toolbox Balance Sheet Generator')
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const [W, H] = o.letter ? [612, 792] : [595.28, 841.89]
  let page = doc.addPage([W, H])
  const M = 56
  let y = H - M
  const colR = o.showPrior ? W - M - 110 : W - M, colP = W - M
  const ink = rgb(0.12, 0.14, 0.2), grey = rgb(0.45, 0.47, 0.52), accent = rgb(0.16, 0.24, 0.45)
  const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, (ch) => ({ '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', '€': 'EUR ', '₴': 'UAH ', '…': '...' })[ch] ?? '?')
  const text = (s: string, x: number, size: number, f = reg, c = ink, align: 'l' | 'r' | 'c' = 'l') => {
    const t = safe(s)
    const w = f.widthOfTextAtSize(t, size)
    page.drawText(t, { x: align === 'r' ? x - w : align === 'c' ? x - w / 2 : x, y, size, font: f, color: c })
  }
  const need = (h: number) => {
    if (y - h < M) {
      page = doc.addPage([W, H])
      y = H - M
    }
  }
  const cur = safe(o.currency)
  text(o.company, W / 2, 18, bold, ink, 'c')
  y -= 22
  text('Balance Sheet', W / 2, 13, bold, accent, 'c')
  y -= 16
  text(`As of ${o.date}`, W / 2, 10, reg, grey, 'c')
  y -= 30
  const header = () => {
    text(`(in ${cur.trim() || 'currency units'})`, M, 8.5, reg, grey)
    text(o.date, colR, 9, bold, ink, 'r')
    if (o.showPrior) text(o.prior, colP, 9, bold, grey, 'r')
    y -= 6
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: ink })
    y -= 16
  }
  header()
  const T = totals(o.accounts, 'cur'), P = totals(o.accounts, 'prior')
  const line = (label: string, a: number, b: number, opts: { bold?: boolean; indent?: number; rule?: 'single' | 'double'; size?: number } = {}) => {
    need(18)
    const f = opts.bold ? bold : reg
    const size = opts.size ?? 10
    if (opts.rule) {
      page.drawLine({ start: { x: colR - 90, y: y + size + 2 }, end: { x: colR, y: y + size + 2 }, thickness: 0.5, color: ink })
      if (o.showPrior) page.drawLine({ start: { x: colP - 90, y: y + size + 2 }, end: { x: colP, y: y + size + 2 }, thickness: 0.5, color: grey })
    }
    text(label, M + (opts.indent ?? 0), size, f)
    text(fmtAmt(a), colR, size, f, ink, 'r')
    if (o.showPrior) text(fmtAmt(b), colP, size, f, grey, 'r')
    if (opts.rule === 'double') {
      for (const dy of [-3, -5.5]) {
        page.drawLine({ start: { x: colR - 90, y: y + dy }, end: { x: colR, y: y + dy }, thickness: 0.6, color: ink })
        if (o.showPrior) page.drawLine({ start: { x: colP - 90, y: y + dy }, end: { x: colP, y: y + dy }, thickness: 0.6, color: grey })
      }
    }
    y -= size + 6
  }
  const heading = (s: string, big = false) => {
    need(30)
    y -= big ? 6 : 2
    text(s.toUpperCase(), M, big ? 11 : 9.5, bold, big ? accent : ink)
    y -= big ? 18 : 15
  }
  const section = (sec: Section) => {
    const meta = SECTIONS.find((s) => s.id === sec)!
    heading(meta.name)
    for (const a of o.accounts.filter((x) => x.section === sec)) line(a.name, a.cur, a.prior, { indent: 14 })
    line(`Total ${meta.name.toLowerCase()}`, T[sec], P[sec], { bold: true, rule: 'single', indent: 0 })
    y -= 4
  }
  heading('Assets', true)
  section('ca')
  section('nca')
  line('TOTAL ASSETS', T.assets, P.assets, { bold: true, rule: 'double', size: 10.5 })
  y -= 12
  heading("Liabilities and shareholders' equity", true)
  section('cl')
  section('ncl')
  line('Total liabilities', T.liab, P.liab, { bold: true, rule: 'single' })
  y -= 4
  section('eq')
  line("TOTAL LIABILITIES AND EQUITY", T.le, P.le, { bold: true, rule: 'double', size: 10.5 })
  y -= 16
  need(30)
  const ok = Math.abs(T.diff) < 0.005
  text(ok ? 'Check: total assets equal total liabilities and equity.' : `Out of balance by ${fmtAmt(T.diff)} - review the accounts before issuing.`, M, 9, reg, ok ? rgb(0.05, 0.5, 0.3) : rgb(0.75, 0.1, 0.1))
  const pages = doc.getPages()
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 60, y: 28, size: 8, font: reg, color: grey }))
  return doc.save()
}
