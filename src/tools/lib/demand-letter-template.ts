// Payment demand letter: amounts owed (with optional simple interest) and tone-specific wording.

export interface Invoice { id: string; ref: string; issued: string; due: string; amount: number; paid: number }
export type Tone = 'friendly' | 'firm' | 'final'
export interface Letter {
  tone: Tone; date: string; deadlineDays: number; currency: string
  creditor: string; creditorAddress: string; creditorContact: string; signer: string; signerTitle: string
  debtor: string; debtorAddress: string; attention: string
  invoices: Invoice[]; interestRate: number; lateFee: number; basis: string
  payment: string; consequences: string[]; delivery: string; extra: string
}

const DAY = 86400000
const utc = (d: string) => Date.parse(d + 'T00:00:00Z')
export const daysBetween = (a: string, b: string) => {
  const x = utc(a), y = utc(b)
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / DAY) : 0
}
export const addDays = (d: string, n: number) => {
  const t = utc(d)
  return Number.isFinite(t) ? new Date(t + n * DAY).toISOString().slice(0, 10) : d
}
export const longDate = (d: string) => {
  const t = utc(d)
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : d
}

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

/** Simple (non-compounding) interest on the outstanding balance from due date to `asOf`, actual/365. */
export function interest(inv: Invoice, ratePct: number, asOf: string): number {
  const bal = Math.max(0, inv.amount - inv.paid)
  const days = Math.max(0, daysBetween(inv.due, asOf))
  return r2((bal * (ratePct / 100) * days) / 365)
}

export interface Amounts { principal: number; interest: number; fees: number; total: number; rows: { inv: Invoice; balance: number; overdue: number; interest: number }[] }

export function amounts(l: Pick<Letter, 'invoices' | 'interestRate' | 'lateFee' | 'date'>): Amounts {
  const rows = l.invoices.map((inv) => ({ inv, balance: r2(Math.max(0, inv.amount - inv.paid)), overdue: Math.max(0, daysBetween(inv.due, l.date)), interest: l.interestRate > 0 ? interest(inv, l.interestRate, l.date) : 0 }))
  const principal = r2(rows.reduce((a, r) => a + r.balance, 0))
  const int = r2(rows.reduce((a, r) => a + r.interest, 0))
  const fees = r2(Math.max(0, l.lateFee))
  return { principal, interest: int, fees, total: r2(principal + int + fees), rows }
}

export const money = (x: number, cur: string) => `${cur}${x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const CONSEQUENCES: [string, string][] = [
  ['collections', 'refer the account to a collection agency'],
  ['court', 'file a claim in the appropriate court (for example, small claims) to recover the debt'],
  ['costs', 'seek court costs and any further interest the law allows'],
  ['suspend', 'suspend any further work, deliveries or services on your account'],
  ['credit', 'report the unpaid debt to credit reference agencies, where the law permits'],
]

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join('; ')}; and ${items[items.length - 1]}`)

/** Letter body as paragraphs (no letterhead/addresses). */
export function body(l: Letter): { subject: string; paras: string[] } {
  const a = amounts(l)
  const m = (x: number) => money(x, l.currency)
  const deadline = longDate(addDays(l.date, l.deadlineDays))
  const refs = l.invoices.map((i) => i.ref).filter(Boolean)
  const what = refs.length === 1 ? `invoice ${refs[0]}` : refs.length ? `invoices ${refs.join(', ')}` : 'the amount owed'
  const remain = refs.length > 1 ? 'remain' : 'remains'
  const oldest = Math.max(0, ...a.rows.map((r) => r.overdue))
  const breakdown = a.interest || a.fees
    ? ` This consists of ${m(a.principal)} outstanding principal${a.interest ? `, ${m(a.interest)} interest at ${l.interestRate}% per year` : ''}${a.fees ? `, and ${m(a.fees)} in late fees` : ''}${l.basis ? ` (${l.basis})` : ''}.`
    : ''
  const cons = l.consequences.map((k) => CONSEQUENCES.find((c) => c[0] === k)?.[1]).filter((x): x is string => !!x)
  const P: string[] = []
  const subject = l.tone === 'final' ? `FINAL DEMAND FOR PAYMENT: ${m(a.total)}` : l.tone === 'firm' ? `Demand for payment of overdue account: ${m(a.total)}` : `Payment reminder: ${what}`
  if (l.tone === 'friendly') {
    P.push(`We hope all is well. Our records show that ${what} ${remain} unpaid, now ${oldest} days past the due date, with a balance of ${m(a.total)}.${breakdown}`)
    P.push(`It may simply have been overlooked. We would be grateful if you could arrange payment by ${deadline}. If you have already paid, please accept our thanks and send us the payment details so we can update our records.`)
    P.push(`If there is a problem with the invoice or you would like to discuss a payment plan, just reply to this letter; we are happy to help.`)
  } else if (l.tone === 'firm') {
    P.push(`Despite previous reminders, ${what} ${remain} unpaid. As of ${longDate(l.date)} the amount due is ${m(a.total)}, and the oldest item is ${oldest} days overdue.${breakdown}`)
    P.push(`We ask that you pay the full balance no later than ${deadline}.`)
    if (cons.length) P.push(`If payment or a written payment proposal is not received by that date, we intend to take further steps, which may include the following: ${list(cons)}.`)
    P.push(`If you dispute any part of this amount, please tell us in writing before the deadline, stating the reason, so that we can look into it.`)
  } else {
    P.push(`This is our final demand for payment of ${m(a.total)} owed for ${what}. The balance has been overdue for up to ${oldest} days, and earlier requests for payment have not been answered or settled.${breakdown}`)
    P.push(`Unless the full amount is received by ${deadline}, we will proceed without further notice to ${cons.length ? list(cons) : 'take the steps available to us to recover the debt'}.`)
    P.push(`We would prefer to resolve this without further action. If you are unable to pay in full, contact us before the deadline with a written proposal. If you believe this amount is not owed, set out your reasons in writing before the deadline.`)
  }
  if (l.payment.trim()) P.push(`Payment can be made as follows: ${l.payment.trim()}`)
  if (l.extra.trim()) P.push(l.extra.trim())
  P.push(l.tone === 'friendly' ? 'Thank you for your prompt attention.' : 'We look forward to receiving your payment.')
  return { subject, paras: P }
}
