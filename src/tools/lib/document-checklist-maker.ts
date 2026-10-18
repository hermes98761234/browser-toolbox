// Document checklists: compact template library, progress maths, Markdown / CSV / printable HTML exports.

export type ItemState = 'todo' | 'done' | 'na'
export interface Item { id: string; section: string; text: string; required: boolean; state: ItemState; note: string }
export interface Checklist { id: string; title: string; who: string; due: string; template: string; items: Item[] }

/** Templates: "# Section" lines start a section; "* text" = required, "- text" = optional; "text :: hint" adds a note hint. */
export const TEMPLATES: { id: string; name: string; icon: string; body: string }[] = [
  { id: 'passport', name: 'Passport application', icon: '🛂', body: `# Forms
* Completed application form (unsigned until told to sign)
* Proof of citizenship :: birth certificate or previous passport
* Photocopy of proof of citizenship (front and back)
# Identity
* Government photo ID :: driver's licence or national ID
* Photocopy of ID (front and back)
* One passport photo (2×2 in / 35×45 mm, recent, white background)
# Fees & other
* Application fee payment
- Expedite / courier fee
- Name-change document :: marriage certificate or court order
- Parental consent form (applicants under 16)` },
  { id: 'mortgage', name: 'Mortgage application', icon: '🏠', body: `# Identity
* Photo ID for every borrower
* Proof of address :: utility bill < 3 months
# Income
* Last 2–3 payslips
* Last 2 years of tax returns / W-2 / P60
* Employer contact or employment letter
- Profit & loss statement (self-employed)
- Bonus / commission history
# Assets & debts
* Bank statements, last 2–3 months
* Proof of deposit source :: savings, gift letter
* List of debts and monthly payments
- Investment / retirement account statements
# Property
* Purchase agreement / offer letter
- Home insurance quote
- Survey / valuation report` },
  { id: 'rental', name: 'Rental application', icon: '🔑', body: `# Applicant
* Photo ID
* Completed rental application
* Proof of income :: payslips or offer letter
# References
* Previous landlord reference
- Employer reference
- Personal reference
# Money
* Holding deposit / first month
* Security deposit
- Guarantor form and guarantor ID
- Credit report` },
  { id: 'tax', name: 'Personal tax return', icon: '🧾', body: `# Income
* Wage statements (W-2 / P60 / equivalent)
- Freelance / 1099 income records
- Interest and dividend statements
- Rental income and expenses
- Crypto / stock sale records
# Deductions & credits
- Mortgage interest statement
- Charitable donation receipts
- Childcare and education expenses
- Medical expense receipts
- Retirement contribution statements
# Admin
* Last year's return
* Tax ID / social security numbers for dependants
* Bank details for refund` },
  { id: 'visa', name: 'Schengen visa', icon: '✈️', body: `# Application
* Signed visa application form
* Passport (valid 3+ months after return, 2 blank pages)
* Two recent photos (35×45 mm)
* Visa fee
# Travel
* Return flight reservation
* Accommodation booking / invitation letter
* Travel medical insurance (≥ €30,000 cover)
* Day-by-day itinerary
# Means & ties
* Bank statements, last 3–6 months
* Employment letter / proof of enrolment
- Sponsorship letter and sponsor's bank statements
- Property deed or family ties evidence` },
  { id: 'onboard', name: 'New hire paperwork', icon: '💼', body: `# Before day one
* Signed offer letter / contract
* Right-to-work documents
* Tax forms (W-4 / P46 / equivalent)
* Bank details for payroll
# Personal
* Emergency contact form
- Benefits enrolment forms
- Pension / retirement opt-in
# Policies
* Signed NDA / confidentiality agreement
* Handbook acknowledgement
- Equipment agreement` },
  { id: 'car', name: 'Buying a used car', icon: '🚗', body: `# Before paying
* Vehicle history report :: VIN check
* Independent inspection
* Logbook / title in seller's name
* Service history
# At sale
* Bill of sale signed by both
* Odometer disclosure
* Insurance in place before driving away
# After
* Register / transfer ownership
- Road tax / emissions test
- Cancel the seller's plates if required` },
  { id: 'business', name: 'Starting a company', icon: '🏢', body: `# Formation
* Company name search
* Articles of organisation / incorporation
* Registered agent / office address
* Operating agreement / shareholders' agreement
# Tax & banking
* Tax ID (EIN / UTR / VAT)
* Business bank account
- Payroll registration
# Compliance
- Business licence / permits
- Business insurance
- Trademark search` },
  { id: 'move', name: 'Moving house', icon: '📦', body: `# Six weeks before
* Notice to landlord / sale completion date
* Book movers or van
- Declutter and sell / donate
# Two weeks before
* Change of address with post office
* Transfer utilities (power, gas, water, internet)
* Update bank, employer, doctor, insurance
# Moving day
* Meter readings with photos
* Keys handed over
- Essentials box packed` },
]

let n = 0
const id = () => `i${Date.now().toString(36)}${(n++).toString(36)}`

export function fromTemplate(body: string): Item[] {
  let section = 'General'
  const out: Item[] = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#')) { section = line.replace(/^#+\s*/, ''); continue }
    const req = line.startsWith('*')
    const [text, hint = ''] = line.replace(/^[*-]\s*/, '').split(' :: ')
    out.push({ id: id(), section, text: text.trim(), required: req, state: 'todo', note: hint.trim() ? `Hint: ${hint.trim()}` : '' })
  }
  return out
}

export interface Progress { done: number; total: number; required: number; requiredDone: number; na: number; pct: number }
export function progress(items: Item[]): Progress {
  const active = items.filter((i) => i.state !== 'na')
  const done = active.filter((i) => i.state === 'done').length
  const req = active.filter((i) => i.required)
  return { done, total: active.length, required: req.length, requiredDone: req.filter((i) => i.state === 'done').length, na: items.length - active.length, pct: active.length ? done / active.length : 1 }
}

export function sections(items: Item[]): string[] {
  return [...new Set(items.map((i) => i.section))]
}

export function daysLeft(due: string, today: string): number | null {
  if (!due) return null
  return Math.round((Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
}

export function toMarkdown(c: Checklist): string {
  const lines = [`# ${c.title}`, '']
  if (c.who) lines.push(`For: ${c.who}  `)
  if (c.due) lines.push(`Due: ${c.due}  `)
  const p = progress(c.items)
  lines.push(`Progress: ${p.done}/${p.total}`, '')
  for (const s of sections(c.items)) {
    lines.push(`## ${s}`)
    for (const i of c.items.filter((x) => x.section === s)) lines.push(`- [${i.state === 'done' ? 'x' : ' '}] ${i.state === 'na' ? '~~' + i.text + '~~ (n/a)' : i.text}${i.required ? ' *' : ''}${i.note ? ` — ${i.note}` : ''}`)
    lines.push('')
  }
  lines.push('`*` = required')
  return lines.join('\n') + '\n'
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function toPrintHtml(c: Checklist): string {
  const p = progress(c.items)
  const body = sections(c.items).map((s) => `<h2>${esc(s)}</h2><ul>${c.items.filter((x) => x.section === s).map((i) => `<li class="${i.state}"><span class="box">${i.state === 'done' ? '✔' : i.state === 'na' ? '–' : ''}</span><div><b>${esc(i.text)}</b>${i.required ? ' <em>required</em>' : ''}${i.note ? `<div class="note">${esc(i.note)}</div>` : ''}</div></li>`).join('')}</ul>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.title)}</title><style>
body{font:14px/1.45 system-ui,sans-serif;color:#111;max-width:760px;margin:24px auto;padding:0 16px}
h1{margin:0 0 4px;font-size:22px}.meta{color:#555;margin-bottom:12px}h2{font-size:15px;border-bottom:2px solid #111;padding-bottom:2px;margin:18px 0 6px;break-after:avoid}
ul{list-style:none;padding:0;margin:0}li{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid #ddd;break-inside:avoid}
.box{flex:0 0 18px;height:18px;border:1.5px solid #111;border-radius:3px;text-align:center;line-height:17px;font-size:13px}
em{font-style:normal;font-size:11px;background:#111;color:#fff;border-radius:3px;padding:0 4px}.note{color:#555;font-size:12px}
li.na b{text-decoration:line-through;color:#888}.sign{margin-top:28px;display:flex;gap:40px}.sign div{flex:1;border-top:1px solid #111;padding-top:4px;color:#555;font-size:12px}
@media print{body{margin:0}}</style></head><body><h1>${esc(c.title)}</h1><div class="meta">${c.who ? `For <b>${esc(c.who)}</b> · ` : ''}${c.due ? `Due <b>${esc(c.due)}</b> · ` : ''}${p.done}/${p.total} ready · ${p.requiredDone}/${p.required} required</div>${body}<div class="sign"><div>Checked by</div><div>Date</div></div></body></html>`
}
