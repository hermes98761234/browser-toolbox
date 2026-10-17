// Residential lease builder: a tiny {{mustache}} renderer, the clause list, money maths and a minimal DOCX writer.
import { makeZip } from './image-compressor'

export interface Lease {
  landlord: string
  landlordAddr: string
  tenants: string
  address: string
  unitType: string
  furnished: boolean
  kind: 'fixed' | 'monthly'
  start: string // YYYY-MM-DD
  months: number
  rent: number
  currency: string
  dueDay: number
  payMethod: string
  graceDays: number
  lateFee: number
  deposit: number
  depositDays: number // days to return the deposit after move-out
  utilitiesLandlord: string[]
  utilitiesTenant: string[]
  pets: boolean
  petDeposit: number
  smoking: boolean
  maxOccupants: number
  parking: string
  entryHours: number
  noticeDays: number
  law: string
  extra: string
}

/** {{name}} substitution plus {{#if name}}…{{/if}} / {{#unless name}}…{{/unless}} blocks. */
export function render(tpl: string, data: Record<string, unknown>): string {
  const truthy = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v)
  let out = tpl
  for (let i = 0; i < 5; i++) {
    const next = out.replace(/\{\{#(if|unless) (\w+)\}\}((?:(?!\{\{#(?:if|unless) )[\s\S])*?)\{\{\/\1\}\}/g, (_, k: string, name: string, body: string) =>
      (k === 'if') === truthy(data[name]) ? body : '',
    )
    if (next === out) break
    out = next
  }
  return out.replace(/\{\{(\w+)\}\}/g, (_, n: string) => {
    const v = data[n]
    return v === undefined || v === null ? '' : Array.isArray(v) ? v.join(', ') : String(v)
  })
}

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const end = new Date(Date.UTC(y, m - 1 + months, d))
  // e.g. 31 Jan + 1 month overflows into March: the term then ends on the last day of February
  if (end.getUTCDate() !== d) end.setUTCDate(0)
  else end.setUTCDate(end.getUTCDate() - 1)
  return end.toISOString().slice(0, 10)
}

export function longDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/** Rent for the first, partial month when the lease starts after the due day (daily proration on actual month length). */
export function prorated(rent: number, startIso: string, dueDay = 1): { days: number; amount: number } {
  const [y, m, d] = startIso.split('-').map(Number)
  if (!y || d === dueDay) return { days: 0, amount: 0 }
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const days = d < dueDay ? dueDay - d : dim - d + dueDay
  return { days, amount: Math.round(((rent * days) / dim) * 100) / 100 }
}

export const fmtMoney = (x: number, cur: string) => `${cur}${x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export interface Block {
  t: 'title' | 'h' | 'p' | 'sig'
  text: string
}

const CLAUSES: [string, string][] = [
  ['Parties', 'This Residential Lease Agreement ("Agreement") is made between {{landlord}} ("Landlord"){{#if landlordAddr}}, of {{landlordAddr}},{{/if}} and {{tenants}} ("Tenant"). Each Tenant is jointly and severally liable for all obligations under this Agreement.'],
  ['Premises', 'Landlord leases to Tenant the {{unitType}} located at {{address}} (the "Premises"){{#if furnished}}, furnished as listed in the attached inventory{{/if}}{{#unless furnished}}, unfurnished{{/unless}}.'],
  ['Term', '{{#if fixed}}The lease begins on {{startLong}} and ends on {{endLong}} ({{months}} months). Unless either party gives at least {{noticeDays}} days’ written notice before the end date, the tenancy continues month-to-month on the same terms.{{/if}}{{#unless fixed}}The tenancy begins on {{startLong}} and continues month-to-month until either party gives at least {{noticeDays}} days’ written notice.{{/unless}}'],
  ['Rent', 'Tenant shall pay rent of {{rentText}} per month, due in advance on the {{dueText}} day of each month, by {{payMethod}}.{{#if proText}} Rent for the first partial period of {{proDays}} days is {{proText}}, due at signing.{{/if}}'],
  ['Late payment', 'If rent is not received within {{graceDays}} days after the due date, Tenant shall pay a late fee of {{lateText}}. Returned payments may incur the bank’s charges.'],
  ['Security deposit', 'On signing, Tenant shall pay a security deposit of {{depositText}}. Landlord may deduct unpaid rent and the cost of repairing damage beyond normal wear and tear, and shall return the balance with an itemised statement within {{depositDays}} days after Tenant vacates and returns the keys.'],
  ['Utilities and services', '{{#if utilL}}Landlord pays for: {{utilL}}. {{/if}}{{#if utilT}}Tenant pays for: {{utilT}}, and shall set up these accounts in Tenant’s name where possible.{{/if}}'],
  ['Occupancy', 'The Premises shall be used only as a private residence for no more than {{maxOccupants}} persons. Guests staying more than 14 days in any six-month period require Landlord’s written consent. Tenant shall not sublet or assign without Landlord’s written consent.'],
  ['Pets', '{{#if pets}}Pets are permitted with Landlord’s prior written approval of each animal.{{#if petText}} Tenant shall pay an additional refundable pet deposit of {{petText}}.{{/if}} Tenant is responsible for any damage caused by pets.{{/if}}{{#unless pets}}No pets are permitted on the Premises without Landlord’s prior written consent, except assistance animals as required by law.{{/unless}}'],
  ['Smoking', '{{#if smoking}}Smoking is permitted only in outdoor areas designated by Landlord.{{/if}}{{#unless smoking}}Smoking and vaping of any substance are prohibited inside the Premises and in common areas.{{/unless}}'],
  ['Parking', '{{parking}}'],
  ['Maintenance and repairs', 'Tenant shall keep the Premises clean and in good condition, promptly report needed repairs in writing, and pay for damage caused by Tenant or guests. Landlord shall keep the structure, plumbing, heating, electrical systems and supplied appliances in good working order and make repairs within a reasonable time.'],
  ['Alterations', 'Tenant shall not paint, make alterations, change locks or install fixtures without Landlord’s written consent.'],
  ['Landlord’s entry', 'Landlord may enter the Premises at reasonable times to inspect, repair or show it, after giving at least {{entryHours}} hours’ notice, except in an emergency.'],
  ['Move-out', 'At the end of the tenancy Tenant shall return all keys and leave the Premises clean and in the same condition as at move-in, except for normal wear and tear. A move-in condition checklist signed by both parties forms part of this Agreement.'],
  ['Governing law', 'This Agreement is governed by the laws of {{law}}. If any provision is found invalid, the remaining provisions remain in effect. Any provision that conflicts with mandatory local law is replaced by the minimum the law requires.'],
  ['Additional terms', '{{extra}}'],
  ['Entire agreement', 'This Agreement, together with any signed attachments, is the entire agreement between the parties. Changes must be made in writing and signed by Landlord and all Tenants.'],
]

export function buildLease(l: Lease): Block[] {
  const pro = prorated(l.rent, l.start, l.dueDay)
  const data: Record<string, unknown> = {
    ...l,
    fixed: l.kind === 'fixed',
    startLong: longDate(l.start),
    endLong: longDate(addMonths(l.start, l.months)),
    rentText: fmtMoney(l.rent, l.currency),
    dueText: ordinal(l.dueDay),
    lateText: fmtMoney(l.lateFee, l.currency),
    depositText: fmtMoney(l.deposit, l.currency),
    petText: l.petDeposit > 0 ? fmtMoney(l.petDeposit, l.currency) : '',
    proDays: pro.days,
    proText: pro.days ? fmtMoney(pro.amount, l.currency) : '',
    utilL: l.utilitiesLandlord.join(', '),
    utilT: l.utilitiesTenant.join(', '),
    parking: l.parking.trim(),
    extra: l.extra.trim(),
  }
  const blocks: Block[] = [{ t: 'title', text: 'Residential Lease Agreement' }]
  let n = 0
  for (const [h, tpl] of CLAUSES) {
    const text = render(tpl, data).trim()
    if (!text) continue
    blocks.push({ t: 'h', text: `${++n}. ${h}` })
    for (const para of text.split(/\n+/)) blocks.push({ t: 'p', text: para })
  }
  blocks.push({ t: 'h', text: 'Signatures' })
  for (const who of [`Landlord: ${l.landlord}`, ...l.tenants.split(/\s*(?:,|\band\b|&)\s*/).filter(Boolean).map((t) => `Tenant: ${t}`)]) blocks.push({ t: 'sig', text: who })
  return blocks
}

export function toText(blocks: Block[]): string {
  return blocks.map((b) => (b.t === 'title' ? b.text.toUpperCase() + '\n' : b.t === 'h' ? `\n${b.text}` : b.t === 'sig' ? `\n${b.text}\nSignature: ______________________   Date: ____________` : b.text)).join('\n') + '\n'
}

const xe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function docxXml(blocks: Block[]): string {
  const run = (t: string, rpr = '') => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${xe(t)}</w:t></w:r>`
  const para = (inner: string, ppr = '') => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${inner}</w:p>`
  const font = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
  const body = blocks
    .map((b) => {
      if (b.t === 'title') return para(run(b.text, `${font}<w:b/><w:sz w:val="36"/>`), '<w:jc w:val="center"/><w:spacing w:after="240"/>')
      if (b.t === 'h') return para(run(b.text, `${font}<w:b/><w:sz w:val="24"/>`), '<w:keepNext/><w:spacing w:before="200" w:after="80"/>')
      if (b.t === 'sig')
        return para(run(b.text, `${font}<w:b/><w:sz w:val="22"/>`), '<w:keepNext/><w:spacing w:before="360"/>') + para(run('Signature: ______________________________     Date: ______________', `${font}<w:sz w:val="22"/>`), '<w:spacing w:before="240"/>')
      return para(run(b.text, `${font}<w:sz w:val="22"/>`), '<w:jc w:val="both"/><w:spacing w:after="120"/>')
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`
}

/** Minimal valid .docx (Office Open XML) package. */
export function makeDocx(blocks: Block[]): Uint8Array {
  const enc = new TextEncoder()
  return makeZip([
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: 'word/document.xml', data: enc.encode(docxXml(blocks)) },
  ])
}
