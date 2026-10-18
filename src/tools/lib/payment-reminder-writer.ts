// Overdue-payment reminder logic: days overdue, escalation stage, late fees, templates and substitution.

export interface Invoice { id: string; number: string; amount: number; issued: string; due: string }
export type Stage = 'upcoming' | 'friendly' | 'firm' | 'final' | 'collections'
export type Tone = 'warm' | 'neutral' | 'formal'

export const STAGES: Record<Stage, { name: string; range: string; color: string }> = {
  upcoming: { name: 'Before due date', range: 'not yet due', color: '#0ea5e9' },
  friendly: { name: 'Friendly nudge', range: '1–7 days late', color: '#10b981' },
  firm: { name: 'Firm reminder', range: '8–30 days late', color: '#f59e0b' },
  final: { name: 'Final notice', range: '31–60 days late', color: '#f97316' },
  collections: { name: 'Pre-collections', range: '61+ days late', color: '#ef4444' },
}

const DAY = 864e5
const utc = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN }
/** Whole days from `a` to `b` (ISO dates); positive when b is later. */
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY)
export const addDays = (iso: string, n: number) => new Date(utc(iso) + n * DAY).toISOString().slice(0, 10)

export function stageFor(daysLate: number): Stage {
  if (daysLate <= 0) return 'upcoming'
  if (daysLate <= 7) return 'friendly'
  if (daysLate <= 30) return 'firm'
  if (daysLate <= 60) return 'final'
  return 'collections'
}

/** Simple (non-compounding) late interest: amount × monthly rate × days/30, plus a flat fee once overdue. */
export function lateFee(amount: number, daysLate: number, monthlyPct: number, flat: number): number {
  if (daysLate <= 0) return 0
  return Math.round((amount * (monthlyPct / 100) * (daysLate / 30) + flat) * 100) / 100
}

/** Suggested follow-up dates after the due date for the remaining stages. */
export function schedule(due: string, today: string): { date: string; stage: Stage; past: boolean }[] {
  return ([[-3, 'upcoming'], [1, 'friendly'], [10, 'firm'], [31, 'final'], [61, 'collections']] as [number, Stage][]).map(([d, stage]) => {
    const date = addDays(due, d)
    return { date, stage, past: daysBetween(date, today) > 0 }
  })
}

export function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => vars[k] ?? m)
}

type T = { subject: string; body: string }
const SIGN = '\n\n{{closing}}\n{{sender}}\n{{company}}'
const PAY = '\n\nYou can pay here: {{payment}}'
export const TEMPLATES: Record<Stage, Record<Tone, T>> = {
  upcoming: {
    warm: { subject: 'Friendly heads-up: invoice {{invoices}} due {{due}}', body: 'Hi {{contact}},\n\nHope all is well! Just a quick note that {{invoice_phrase}} for {{total}} is due on {{due}}. No action is needed if it is already scheduled.{{list}}' + PAY + '\n\nThanks so much!' + SIGN },
    neutral: { subject: 'Reminder: invoice {{invoices}} due {{due}}', body: 'Hello {{contact}},\n\nThis is a reminder that {{invoice_phrase}} for {{total}} is due on {{due}}.{{list}}' + PAY + '\n\nThank you.' + SIGN },
    formal: { subject: 'Upcoming payment: invoice {{invoices}} ({{total}}) due {{due}}', body: 'Dear {{contact}},\n\nPlease be advised that {{invoice_phrase}} in the amount of {{total}} falls due on {{due}}.{{list}}' + PAY + '\n\nKind regards.' + SIGN },
  },
  friendly: {
    warm: { subject: 'Quick check-in on invoice {{invoices}}', body: 'Hi {{contact}},\n\nI hope you are doing well. I noticed that {{invoice_phrase}} for {{total}} was due on {{due}} and I have not seen the payment yet. It may simply have slipped through the cracks — it happens to all of us!{{list}}' + PAY + '\n\nIf it is already on its way, please ignore this message. Thank you!' + SIGN },
    neutral: { subject: 'Payment reminder: invoice {{invoices}} ({{days}} days overdue)', body: 'Hello {{contact}},\n\nOur records show that {{invoice_phrase}} for {{total}}, due on {{due}}, is now {{days}} days overdue.{{list}}' + PAY + '\n\nPlease let me know if you have any questions about the invoice.' + SIGN },
    formal: { subject: 'Overdue invoice {{invoices}} — {{total}}', body: 'Dear {{contact}},\n\nWe would like to remind you that payment of {{total}} for {{invoice_phrase}}, which fell due on {{due}}, has not yet been received.{{list}}' + PAY + '\n\nWe would be grateful if you could arrange payment at your earliest convenience.' + SIGN },
  },
  firm: {
    warm: { subject: 'Following up: invoice {{invoices}} is {{days}} days overdue', body: 'Hi {{contact}},\n\nI am following up on {{invoice_phrase}} for {{total}}, which was due on {{due}} and is now {{days}} days overdue. I know things get busy, but I would really appreciate it if you could take care of this by {{deadline}}.{{list}}{{fee_line}}' + PAY + '\n\nIf there is a problem with the invoice or you need to split the payment, just reply and we will work something out.' + SIGN },
    neutral: { subject: 'Second reminder: invoice {{invoices}} overdue by {{days}} days', body: 'Hello {{contact}},\n\nThis is a second reminder that {{invoice_phrase}} for {{total}} remains unpaid {{days}} days after the due date of {{due}}. Please arrange payment by {{deadline}}.{{list}}{{fee_line}}' + PAY + '\n\nIf payment has been sent, please share the transfer reference so we can match it.' + SIGN },
    formal: { subject: 'Second notice: outstanding balance {{total}} (invoice {{invoices}})', body: 'Dear {{contact}},\n\nDespite our earlier reminder, {{invoice_phrase}} for {{total}}, due on {{due}}, remains outstanding ({{days}} days overdue). We request that payment be made no later than {{deadline}}.{{list}}{{fee_line}}' + PAY + '\n\nPlease contact us immediately if there is any dispute regarding this invoice.' + SIGN },
  },
  final: {
    warm: { subject: 'Final reminder before we pause work — invoice {{invoices}}', body: 'Hi {{contact}},\n\n{{invoice_phrase_cap}} for {{total}} is now {{days}} days overdue (due {{due}}). I value working with you, but I will need to pause further work until the balance is settled. Could you please pay by {{deadline}}?{{list}}{{fee_line}}' + PAY + '\n\nIf cash flow is the issue, let\'s talk about a payment plan.' + SIGN },
    neutral: { subject: 'Final notice: invoice {{invoices}} — payment required by {{deadline}}', body: 'Hello {{contact}},\n\nThis is a final notice for {{invoice_phrase}} totalling {{total}}, now {{days}} days past the due date of {{due}}. Payment must be received by {{deadline}}. After that date we may suspend services and apply late charges as set out in our terms.{{list}}{{fee_line}}' + PAY + SIGN },
    formal: { subject: 'FINAL NOTICE — overdue account {{total}}', body: 'Dear {{contact}},\n\nWe refer to our previous reminders regarding {{invoice_phrase}} for {{total}}, due on {{due}} and now {{days}} days overdue. Unless full payment is received by {{deadline}}, we will suspend services and charge late payment interest in accordance with our agreed terms.{{list}}{{fee_line}}' + PAY + SIGN },
  },
  collections: {
    warm: { subject: 'Urgent: invoice {{invoices}} — let\'s resolve this', body: 'Hi {{contact}},\n\n{{invoice_phrase_cap}} for {{total}} has been outstanding for {{days}} days. I would much rather sort this out directly with you than involve a third party, so please pay or contact me by {{deadline}}.{{list}}{{fee_line}}' + PAY + SIGN },
    neutral: { subject: 'Account {{total}} overdue {{days}} days — action required by {{deadline}}', body: 'Hello {{contact}},\n\n{{invoice_phrase_cap}} totalling {{total}} remains unpaid {{days}} days after the due date. If we do not receive payment or hear from you by {{deadline}}, the matter will be passed to a collection service.{{list}}{{fee_line}}' + PAY + SIGN },
    formal: { subject: 'Notice before collection proceedings — {{total}} outstanding', body: 'Dear {{contact}},\n\nDespite repeated reminders, {{invoice_phrase}} for {{total}} remains unpaid {{days}} days after the due date of {{due}}. If full payment is not received by {{deadline}}, we will refer this debt for collection without further notice, which may involve additional costs.{{list}}{{fee_line}}' + PAY + SIGN },
  },
}

export interface Ctx { contact: string; client: string; sender: string; company: string; payment: string; currency: string; today: string; graceDays: number; feePct: number; feeFlat: number; tone: Tone }

export function compose(invoices: Invoice[], c: Ctx, stageOverride?: Stage, tpl?: T) {
  const fmt = (x: number) => `${c.currency}${x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const dfmt = (iso: string) => { const t = utc(iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : iso }
  const valid = invoices.filter((i) => Number.isFinite(utc(i.due)) && i.amount > 0)
  const oldest = valid.reduce<Invoice | null>((a, i) => (!a || utc(i.due) < utc(a.due) ? i : a), null)
  const days = oldest ? daysBetween(oldest.due, c.today) : 0
  const stage = stageOverride ?? stageFor(days)
  const principal = valid.reduce((a, i) => a + i.amount, 0)
  const fees = valid.reduce((a, i) => a + lateFee(i.amount, daysBetween(i.due, c.today), c.feePct, c.feeFlat), 0)
  const withFees = stage !== 'upcoming' && stage !== 'friendly' && fees > 0
  const multi = valid.length > 1
  const vars: Record<string, string> = {
    contact: c.contact || 'there', client: c.client, sender: c.sender, company: c.company, payment: c.payment || '[payment details]',
    invoices: valid.map((i) => `#${i.number}`).join(', '),
    invoice_phrase: multi ? `invoices ${valid.map((i) => `#${i.number}`).join(', ')}` : `invoice #${oldest?.number ?? ''}`,
    invoice_phrase_cap: multi ? `Invoices ${valid.map((i) => `#${i.number}`).join(', ')}` : `Invoice #${oldest?.number ?? ''}`,
    total: fmt(principal), due: oldest ? dfmt(oldest.due) : '', days: String(Math.max(0, days)),
    deadline: dfmt(addDays(c.today, c.graceDays)),
    list: multi ? '\n\n' + valid.map((i) => `• #${i.number} — ${fmt(i.amount)}, due ${dfmt(i.due)} (${Math.max(0, daysBetween(i.due, c.today))} days overdue)`).join('\n') : '',
    fee_line: withFees ? `\n\nUnder our payment terms, late charges of ${fmt(fees)} now apply, bringing the balance to ${fmt(principal + fees)}.` : '',
    closing: c.tone === 'warm' ? 'Best wishes,' : c.tone === 'formal' ? 'Yours sincerely,' : 'Regards,',
  }
  const t = tpl ?? TEMPLATES[stage][c.tone]
  return { stage, days, principal, fees: withFees ? fees : 0, subject: render(t.subject, vars), body: render(t.body, vars).replace(/\n{3,}/g, '\n\n'), vars }
}

export const mailto = (to: string, subject: string, body: string) => `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
