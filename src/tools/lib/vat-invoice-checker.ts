// VAT invoice validation: line maths, per-rate VAT summary, totals, VAT-number formats, rate validity
// and the mandatory-field list (EU VAT Directive art. 226 / UK HMRC full VAT invoice).

export interface Line { desc: string; qty: number; price: number; disc: number; rate: number; statedNet: number | null; statedVat: number | null }
export interface Invoice {
  country: string // supplier country code (ISO, GB, CH, NO …)
  number: string; issueDate: string; supplyDate: string; currency: string
  supplier: string; supplierAddress: string; supplierVat: string
  customer: string; customerAddress: string; customerVat: string
  notes: string
  lines: Line[]
  statedNet: number | null; statedVat: number | null; statedGross: number | null
}

export type Level = 'error' | 'warn' | 'ok'
export interface Issue { level: Level; area: string; msg: string }

/** Standard first, then reduced rates (%), as of 2026. 0 % is always accepted. */
export const RATES: Record<string, number[]> = {
  AT: [20, 13, 10], BE: [21, 12, 6], BG: [20, 9], HR: [25, 13, 5], CY: [19, 9, 5], CZ: [21, 12], DK: [25], EE: [24, 13, 9], FI: [25.5, 14, 10],
  FR: [20, 10, 5.5, 2.1], DE: [19, 7], GR: [24, 13, 6], HU: [27, 18, 5], IE: [23, 13.5, 9, 4.8], IT: [22, 10, 5, 4], LV: [21, 12, 5], LT: [21, 9, 5],
  LU: [17, 14, 8, 3], MT: [18, 7, 5], NL: [21, 9], PL: [23, 8, 5], PT: [23, 13, 6], RO: [21, 11], SK: [23, 19, 5], SI: [22, 9.5, 5], ES: [21, 10, 4],
  SE: [25, 12, 6], GB: [20, 5], CH: [8.1, 3.8, 2.6], NO: [25, 15, 12],
}
export const EU = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'])

const VAT_RE: Record<string, RegExp> = {
  AT: /^U\d{8}$/, BE: /^[01]\d{9}$/, BG: /^\d{9,10}$/, CY: /^\d{8}[A-Z]$/, CZ: /^\d{8,10}$/, DE: /^\d{9}$/, DK: /^\d{8}$/, EE: /^\d{9}$/,
  EL: /^\d{9}$/, ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/, FI: /^\d{8}$/, FR: /^[A-HJ-NP-Z0-9]{2}\d{9}$/, HR: /^\d{11}$/, HU: /^\d{8}$/,
  IE: /^(\d{7}[A-W][A-I]?|\d[A-Z+*]\d{5}[A-W])$/, IT: /^\d{11}$/, LT: /^(\d{9}|\d{12})$/, LU: /^\d{8}$/, LV: /^\d{11}$/, MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/, PL: /^\d{10}$/, PT: /^\d{9}$/, RO: /^\d{2,10}$/, SE: /^\d{10}01$/, SI: /^\d{8}$/, SK: /^\d{10}$/,
  GB: /^(\d{9}|\d{12}|GD[0-4]\d{2}|HA[5-9]\d{2})$/, XI: /^(\d{9}|\d{12})$/, CHE: /^\d{9}(MWST|TVA|IVA)?$/, NO: /^\d{9}(MVA)?$/,
}

/** Prefix used in VAT numbers for a country (Greece uses EL, Switzerland CHE). */
export const vatPrefix = (c: string) => (c === 'GR' ? 'EL' : c === 'CH' ? 'CHE' : c)

export function checkVatNumber(v: string): { ok: boolean; prefix: string; msg: string } {
  const s = v.toUpperCase().replace(/[\s.-]/g, '')
  if (!s) return { ok: false, prefix: '', msg: 'missing' }
  const prefix = s.startsWith('CHE') ? 'CHE' : s.slice(0, 2)
  const re = VAT_RE[prefix]
  if (!re) return { ok: false, prefix, msg: `unknown country prefix “${prefix}”` }
  const body = s.slice(prefix.length)
  return re.test(body) ? { ok: true, prefix, msg: 'format OK' } : { ok: false, prefix, msg: `does not match the ${prefix} format` }
}

export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

export function lineNet(l: Line): number {
  return round2(l.qty * l.price * (1 - l.disc / 100))
}

export interface RateRow { rate: number; net: number; vat: number; vatByLine: number }

/** VAT per rate: VAT on the summed net (recommended) and the sum of per-line rounded VAT. */
export function summary(lines: Line[]): RateRow[] {
  const m = new Map<number, RateRow>()
  for (const l of lines) {
    const r = m.get(l.rate) ?? { rate: l.rate, net: 0, vat: 0, vatByLine: 0 }
    const n = lineNet(l)
    r.net = round2(r.net + n)
    r.vatByLine = round2(r.vatByLine + round2((n * l.rate) / 100))
    m.set(l.rate, r)
  }
  return [...m.values()].map((r) => ({ ...r, vat: round2((r.net * r.rate) / 100) })).sort((a, b) => b.rate - a.rate)
}

export function totals(lines: Line[]) {
  const s = summary(lines)
  const net = round2(s.reduce((a, r) => a + r.net, 0))
  const vat = round2(s.reduce((a, r) => a + r.vat, 0))
  const vatByLine = round2(s.reduce((a, r) => a + r.vatByLine, 0))
  return { net, vat, vatByLine, gross: round2(net + vat) }
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol + 1e-9

export function check(inv: Invoice, todayIso: string): Issue[] {
  const out: Issue[] = []
  const add = (level: Level, area: string, msg: string) => out.push({ level, area, msg })
  // mandatory fields
  const req: [keyof Invoice, string][] = [['number', 'Invoice number'], ['issueDate', 'Date of issue'], ['supplier', 'Supplier name'], ['supplierAddress', 'Supplier address'], ['supplierVat', 'Supplier VAT number'], ['customer', 'Customer name'], ['customerAddress', 'Customer address']]
  for (const [k, n] of req) if (!String(inv[k] ?? '').trim()) add('error', 'Fields', `${n} is missing`)
  if (!inv.lines.length) add('error', 'Lines', 'No line items')
  inv.lines.forEach((l, i) => {
    if (!l.desc.trim()) add('error', 'Lines', `Line ${i + 1}: description of goods/services is missing`)
    if (!(l.qty > 0)) add('warn', 'Lines', `Line ${i + 1}: quantity should be positive`)
  })
  if (inv.issueDate && inv.issueDate > todayIso) add('warn', 'Dates', 'Issue date is in the future')
  if (inv.supplyDate && inv.issueDate && inv.supplyDate > inv.issueDate) add('warn', 'Dates', 'Supply date is after the issue date — fine for advance payments, otherwise check it')
  if (!inv.supplyDate) add('warn', 'Dates', 'Date of supply not stated (required when it differs from the issue date)')
  if (inv.number && !/\d/.test(inv.number)) add('warn', 'Fields', 'Invoice number should be part of a unique sequential series')
  // VAT numbers
  const sv = checkVatNumber(inv.supplierVat)
  if (inv.supplierVat.trim()) {
    if (!sv.ok) add('error', 'VAT IDs', `Supplier VAT number ${sv.msg}`)
    else if (sv.prefix !== vatPrefix(inv.country) && !(inv.country === 'GB' && sv.prefix === 'XI')) add('warn', 'VAT IDs', `Supplier VAT number is from ${sv.prefix}, but the supplier country is ${inv.country}`)
  }
  const cv = inv.customerVat.trim() ? checkVatNumber(inv.customerVat) : null
  if (cv && !cv.ok) add('error', 'VAT IDs', `Customer VAT number ${cv.msg}`)
  // line maths
  inv.lines.forEach((l, i) => {
    const n = lineNet(l)
    if (l.statedNet !== null && !near(l.statedNet, n, 0.005)) add('error', 'Maths', `Line ${i + 1}: net should be ${n.toFixed(2)}, invoice says ${l.statedNet.toFixed(2)}`)
    const v = round2((n * l.rate) / 100)
    if (l.statedVat !== null && !near(l.statedVat, v, 0.005)) add('error', 'Maths', `Line ${i + 1}: VAT at ${l.rate}% should be ${v.toFixed(2)}, invoice says ${l.statedVat.toFixed(2)}`)
  })
  // rates
  const rates = RATES[inv.country]
  const custCountry = cv?.ok ? (cv.prefix === 'EL' ? 'GR' : cv.prefix) : ''
  const crossEu = EU.has(inv.country) && EU.has(custCountry) && custCountry !== inv.country
  for (const r of new Set(inv.lines.map((l) => l.rate))) {
    if (r < 0 || r > 30) add('error', 'Rates', `${r}% is not a plausible VAT rate`)
    else if (rates && r !== 0 && !rates.includes(r)) add('error', 'Rates', `${r}% is not a ${inv.country} VAT rate (valid: ${rates.join(', ')}%, or 0%)`)
  }
  if (crossEu) {
    if (inv.lines.some((l) => l.rate > 0)) add('warn', 'Reverse charge', `B2B supply ${inv.country} → ${custCountry}: usually 0% with reverse charge, but VAT is charged`)
    else if (!/reverse charge|autoliquidation|steuerschuldnerschaft|inversione contabile|art\.?\s*196/i.test(inv.notes)) add('error', 'Reverse charge', 'Zero-rated intra-EU B2B invoice must say “Reverse charge” (art. 196 VAT Directive)')
  } else if (inv.lines.some((l) => l.rate === 0) && !inv.notes.trim()) add('warn', 'Rates', '0% lines need a reason on the invoice (exemption, export, reverse charge …)')
  if (crossEu && !cv) add('error', 'VAT IDs', 'Customer VAT number is required for intra-EU reverse charge')
  // totals
  const t = totals(inv.lines)
  if (inv.statedNet !== null && !near(inv.statedNet, t.net, 0.005)) add('error', 'Totals', `Net total should be ${t.net.toFixed(2)}, invoice says ${inv.statedNet.toFixed(2)}`)
  if (inv.statedVat !== null) {
    const tol = Math.max(0.011, 0.005 * inv.lines.length)
    if (near(inv.statedVat, t.vat, 0.005)) { /* exact */ } else if (near(inv.statedVat, t.vatByLine, 0.005) || near(inv.statedVat, t.vat, tol)) add('warn', 'Totals', `VAT total ${inv.statedVat.toFixed(2)} differs from the per-rate result ${t.vat.toFixed(2)} by ${Math.abs(inv.statedVat - t.vat).toFixed(2)} — a rounding-method difference (per-line rounding gives ${t.vatByLine.toFixed(2)}); usually tolerated`)
    else add('error', 'Totals', `VAT total should be ${t.vat.toFixed(2)}, invoice says ${inv.statedVat.toFixed(2)}`)
  }
  if (inv.statedGross !== null) {
    const expect = round2((inv.statedNet ?? t.net) + (inv.statedVat ?? t.vat))
    if (!near(inv.statedGross, expect, 0.005)) add('error', 'Totals', `Gross should be net + VAT = ${expect.toFixed(2)}, invoice says ${inv.statedGross.toFixed(2)}`)
  }
  if (!out.some((i) => i.level !== 'ok')) add('ok', 'All', 'No problems found')
  return out
}
