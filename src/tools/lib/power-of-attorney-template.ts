// Power of attorney draft builder: form data → numbered sections (reuses the NDA DOCX/Markdown writers).
import type { Section } from './nda-template-generator'

export type Kind = 'general' | 'durable' | 'limited' | 'springing'
export interface Person { name: string; address: string; phone: string }
export interface PoaData {
  kind: Kind
  principal: Person
  agent: Person & { relation: string }
  successor: Person & { relation: string }
  useSuccessor: boolean
  coAgent: Person & { relation: string }
  useCoAgent: boolean
  coMode: 'jointly' | 'severally'
  powers: string[]
  limitedPurpose: string
  start: string
  end: string
  state: string
  county: string
  compensation: 'none' | 'reasonable' | 'fixed'
  fee: string
  gifts: boolean
  giftLimit: string
  accounting: boolean
  instructions: string
  witnesses: number
  notary: boolean
  signDate: string
}

export const POWERS: [string, string][] = [
  ['realEstate', 'Real property: buy, sell, lease, mortgage, manage and insure real estate'],
  ['tangible', 'Tangible personal property: vehicles, household goods and other belongings'],
  ['banking', 'Banking: open, close and operate accounts, deposit and withdraw funds, access safe-deposit boxes'],
  ['investments', 'Stocks, bonds, funds and other investments: buy, sell, vote and transfer'],
  ['business', 'Business operations: operate, buy, sell or wind up any business interest'],
  ['insurance', 'Insurance and annuities: buy, change, borrow against or cancel policies'],
  ['retirement', 'Retirement plans: make contributions, elections and rollovers'],
  ['benefits', 'Government benefits: apply for and receive Social Security, Medicare, veterans’ and other benefits'],
  ['tax', 'Taxes: prepare, sign and file tax returns, and deal with tax authorities'],
  ['claims', 'Claims and litigation: sue, defend, settle and enforce claims'],
  ['family', 'Personal and family maintenance: pay household, education and living expenses'],
  ['digital', 'Digital assets: access email, online accounts and electronic records'],
  ['estates', 'Estates and trusts: act on the principal’s interests in estates and trusts'],
]

const KIND_TITLE: Record<Kind, string> = { general: 'General Power of Attorney', durable: 'Durable General Power of Attorney', limited: 'Limited (Special) Power of Attorney', springing: 'Springing Durable Power of Attorney' }
export const title = (k: Kind) => KIND_TITLE[k]
const v = (s: string, ph: string) => (s.trim() ? s.trim() : `[${ph}]`)
export function longDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '[date]'
  const d = new Date(iso + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

export function build(d: PoaData): Section[] {
  const P = v(d.principal.name, 'Principal name'), A = v(d.agent.name, 'Agent name')
  const durable = d.kind === 'durable' || d.kind === 'springing'
  const S: Section[] = []
  S.push({ heading: '', paras: [`I, **${P}**, of ${v(d.principal.address, 'Principal address')} (the “Principal”), hereby appoint **${A}**${d.agent.relation ? `, my ${d.agent.relation},` : ''} of ${v(d.agent.address, 'Agent address')} (the “Agent”), as my attorney-in-fact to act for me and in my name as set out in this ${title(d.kind)}.`] })
  if (d.useCoAgent) S[0].paras.push(`I also appoint **${v(d.coAgent.name, 'Co-agent name')}** of ${v(d.coAgent.address, 'Co-agent address')} as co-agent. My agents shall act **${d.coMode}**${d.coMode === 'jointly' ? ', and every action requires the agreement of both agents' : ', and each may act alone without the consent of the other'}.`)
  const granted = POWERS.filter(([k]) => d.powers.includes(k))
  S.push({
    heading: 'Powers Granted',
    paras: d.kind === 'limited'
      ? [`My Agent may act for me only for the following limited purpose: ${v(d.limitedPurpose, 'describe the specific transaction or purpose')}.`, ...(granted.length ? [`In carrying out that purpose my Agent may exercise these powers: ${granted.map(([, t]) => t.split(':')[0]).join('; ')}.`] : [])]
      : granted.length
        ? [`I grant my Agent full authority to act for me with respect to the following matters, as initialled by me:`, ...granted.map(([, t], i) => `(${String.fromCharCode(97 + i)}) ${t}. Initials: ______`)]
        : ['[No powers selected — choose at least one power.]'],
  })
  S.push({
    heading: 'Effective Date and Duration',
    paras: [
      d.kind === 'springing'
        ? `This power of attorney becomes effective only upon my incapacity. I shall be considered incapacitated when a licensed physician certifies in writing that I am unable to manage my property or financial affairs. My Agent may rely on that written certification without further inquiry.`
        : `This power of attorney is effective ${d.start ? `on ${longDate(d.start)}` : 'immediately upon signing'}.`,
      durable
        ? `**Durability.** This power of attorney shall not be affected by my subsequent disability or incapacity, or by lapse of time.`
        : `This power of attorney is not durable: it terminates automatically if I become incapacitated.`,
      d.end ? `Unless revoked earlier, this power of attorney ends on ${longDate(d.end)}.` : 'It remains in force until I revoke it in writing, or until my death.',
    ],
  })
  if (d.useSuccessor) S.push({ heading: 'Successor Agent', paras: [`If my Agent dies, becomes incapacitated, resigns, or is unable or unwilling to act, I appoint **${v(d.successor.name, 'Successor name')}**${d.successor.relation ? `, my ${d.successor.relation},` : ''} of ${v(d.successor.address, 'Successor address')} as successor Agent, with the same powers.`] })
  S.push({
    heading: 'Duties, Gifts and Compensation',
    paras: [
      `My Agent shall act in good faith, in my best interest, within the scope of authority granted, and shall keep my property separate from the Agent’s own property.`,
      d.accounting ? `My Agent shall keep complete records of all receipts, disbursements and transactions and provide an accounting to me, or to any person I designate, upon request.` : '',
      d.gifts ? `My Agent may make gifts on my behalf, including to the Agent, not exceeding ${v(d.giftLimit, 'amount')} per recipient per calendar year.` : `My Agent may not make gifts of my property, including to the Agent, and may not change beneficiary designations.`,
      d.compensation === 'none' ? 'My Agent shall serve without compensation but is entitled to reimbursement of reasonable expenses.' : d.compensation === 'reasonable' ? 'My Agent is entitled to reasonable compensation for services and reimbursement of reasonable expenses.' : `My Agent is entitled to compensation of ${v(d.fee, 'fee')} and reimbursement of reasonable expenses.`,
    ].filter(Boolean),
  })
  if (d.instructions.trim()) S.push({ heading: 'Special Instructions', paras: d.instructions.trim().split(/\n\s*\n/).map((p) => p.trim()) })
  S.push({
    heading: 'Reliance, Revocation and Governing Law',
    paras: [
      'Any third party who receives a copy of this document may rely on it. Revocation is not effective as to a third party until the third party has actual knowledge of it.',
      'I revoke all prior general powers of attorney I have signed, except those relating to health care decisions.',
      `This power of attorney is governed by the laws of ${v(d.state, 'State / Country')}.`,
    ],
  })
  return S
}

/** Missing or inconsistent inputs, as human-readable problems. */
export function problems(d: PoaData): string[] {
  const out: string[] = []
  if (!d.principal.name.trim()) out.push('Principal name is missing.')
  if (!d.principal.address.trim()) out.push('Principal address is missing.')
  if (!d.agent.name.trim()) out.push('Agent name is missing.')
  if (d.agent.name.trim() && d.agent.name.trim().toLowerCase() === d.principal.name.trim().toLowerCase()) out.push('The agent must be a different person from the principal.')
  if (d.kind !== 'limited' && !d.powers.length) out.push('Select at least one power.')
  if (d.kind === 'limited' && !d.limitedPurpose.trim()) out.push('Describe the limited purpose.')
  if (d.start && d.end && d.end <= d.start) out.push('The end date must be after the start date.')
  if (d.useSuccessor && !d.successor.name.trim()) out.push('Successor agent name is missing.')
  if (d.useCoAgent && !d.coAgent.name.trim()) out.push('Co-agent name is missing.')
  if (!d.state.trim()) out.push('Governing law (state/country) is missing.')
  if (d.powers.includes('realEstate') && !d.notary) out.push('Real-estate powers usually need a notarised signature to be recorded — consider adding the notary block.')
  return out
}

export const wordCount = (secs: Section[]) => secs.flatMap((s) => [s.heading, ...s.paras]).join(' ').split(/\s+/).filter(Boolean).length
