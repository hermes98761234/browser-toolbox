// Letter of intent composer: deal presets, key-term sections and binding / non-binding boilerplate.

export type Deal = 'acquisition' | 'investment' | 'lease' | 'realestate' | 'partnership'
export interface Term { id: string; label: string; text: string }
export interface Party { company: string; name: string; title: string; address: string; email: string }
export interface Clauses { nonBinding: boolean; dd: boolean; conditions: boolean; exclusivity: boolean; confidentiality: boolean; expenses: boolean; law: boolean; termination: boolean; noPublicity: boolean }
export interface LoiInput {
  deal: Deal; date: string; subject: string; from: Party; to: Party; terms: Term[]; clauses: Clauses
  ddDays: number; exclusivityDays: number; expiry: string; law: string; conditions: string; closing: string
}

export const DEALS: Record<Deal, { label: string; subject: string; intro: (i: LoiInput) => string; terms: [string, string][] }> = {
  acquisition: {
    label: 'Business acquisition',
    subject: 'Proposed acquisition of Northwind Analytics, Inc.',
    intro: (i) => `This letter of intent (the "Letter") sets out the principal terms on which ${i.from.company || 'the Buyer'} ("Buyer") proposes to acquire ${i.to.company || 'the Company'} (the "Company") from its shareholders (the "Transaction").`,
    terms: [
      ['Structure', 'Buyer will acquire 100% of the issued and outstanding shares of the Company, free and clear of all liens and encumbrances.'],
      ['Purchase Price', 'USD 4,800,000 on a cash-free, debt-free basis, assuming a normalised level of working capital.'],
      ['Consideration', '80% in cash at closing; 10% held in escrow for 12 months to secure indemnification claims; 10% as an earn-out payable if trailing-twelve-month revenue exceeds USD 3,000,000 one year after closing.'],
      ['Key Employees', 'Closing is conditioned on the CEO and CTO signing employment agreements on mutually acceptable terms.'],
    ],
  },
  investment: {
    label: 'Equity investment',
    subject: 'Proposed Series A investment',
    intro: (i) => `This letter of intent summarises the principal terms of a proposed equity investment by ${i.from.company || 'the Investor'} ("Investor") in ${i.to.company || 'the Company'} (the "Company").`,
    terms: [
      ['Investment Amount', 'USD 2,000,000 for newly issued Series A Preferred Shares.'],
      ['Valuation', 'USD 8,000,000 pre-money, fully diluted, including an unallocated option pool of 10%.'],
      ['Liquidation Preference', '1x non-participating preference.'],
      ['Board', 'Investor will appoint one director to a five-member board.'],
      ['Pro-Rata Rights', 'Investor may participate in future financings to maintain its ownership percentage.'],
    ],
  },
  lease: {
    label: 'Commercial lease',
    subject: 'Proposed lease of Suite 400, 120 Market Street',
    intro: (i) => `On behalf of ${i.from.company || 'the Tenant'} ("Tenant"), we are pleased to submit this letter of intent to lease the premises described below from ${i.to.company || 'the Landlord'} ("Landlord").`,
    terms: [
      ['Premises', 'Approximately 6,200 rentable square feet on the 4th floor of 120 Market Street.'],
      ['Term', 'Sixty (60) months commencing on the later of 1 March or substantial completion of tenant improvements.'],
      ['Base Rent', 'USD 38.00 per rentable square foot per year, triple net, increasing 3% annually.'],
      ['Free Rent', 'Three (3) months of base rent abatement at the start of the term.'],
      ['Tenant Improvements', 'Landlord will provide an allowance of USD 45.00 per rentable square foot.'],
      ['Security Deposit', 'Two (2) months of base rent.'],
    ],
  },
  realestate: {
    label: 'Property purchase',
    subject: 'Offer to purchase 18 Harbor Lane',
    intro: (i) => `${i.from.company || 'The Purchaser'} ("Purchaser") submits this letter of intent to purchase the real property described below from ${i.to.company || 'the Seller'} ("Seller").`,
    terms: [
      ['Property', 'Land and improvements at 18 Harbor Lane, including all fixtures, permits and transferable warranties.'],
      ['Purchase Price', 'USD 1,250,000.'],
      ['Earnest Money', 'USD 50,000 deposited with the escrow agent within five (5) business days after signing the purchase agreement, applicable to the price at closing.'],
      ['Financing', 'Purchaser may terminate if it cannot obtain a loan of at least 70% of the price on commercially reasonable terms within 45 days.'],
    ],
  },
  partnership: {
    label: 'Partnership / joint venture',
    subject: 'Proposed joint venture for regional distribution',
    intro: (i) => `This letter of intent records the shared understanding of ${i.from.company || 'Party A'} and ${i.to.company || 'Party B'} (together, the "Parties") regarding a proposed joint venture (the "Venture").`,
    terms: [
      ['Purpose', 'To distribute the Parties\' combined product lines in the Nordic region.'],
      ['Contributions', 'Party A contributes USD 500,000 in cash; Party B contributes its existing distribution contracts and warehouse lease.'],
      ['Ownership', '50 / 50, with profits and losses shared in proportion to ownership.'],
      ['Governance', 'A four-member management committee, two members appointed by each Party; deadlocks escalate to the CEOs.'],
    ],
  },
}

export interface Section { title: string; text: string; binding: boolean }

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Builds numbered sections: deal terms first (non-binding), then the selected standard provisions. */
export function compose(i: LoiInput): Section[] {
  const c = i.clauses
  const out: Section[] = i.terms.filter((t) => t.label.trim() || t.text.trim()).map((t) => ({ title: t.label.trim() || 'Term', text: t.text.trim(), binding: false }))
  if (c.dd) out.push({ title: 'Due Diligence', text: `Following countersignature, the recipient will give ${i.from.company || 'us'} and its advisers reasonable access to books, records, contracts, personnel and premises for ${plural(i.ddDays, 'day')} to complete a customary business, legal, financial and tax review.`, binding: false })
  if (c.conditions && i.conditions.trim()) out.push({ title: 'Conditions', text: `Completion is subject to: ${i.conditions.split('\n').map((x) => x.trim()).filter(Boolean).join('; ')}.`, binding: false })
  if (i.closing.trim()) out.push({ title: 'Timing', text: `The parties will work in good faith toward signing definitive agreements and closing on or before ${i.closing}.`, binding: false })
  if (c.exclusivity) out.push({ title: 'Exclusivity', text: `For ${plural(i.exclusivityDays, 'day')} after countersignature, the recipient will not solicit, encourage or negotiate any alternative proposal for the same transaction with any third party, and will promptly notify the sender of any unsolicited approach.`, binding: true })
  if (c.confidentiality) out.push({ title: 'Confidentiality', text: 'The existence and terms of this Letter and all information exchanged in connection with it are confidential and may be disclosed only to the parties\' advisers, financiers and employees who need to know them, or as required by law.', binding: true })
  if (c.noPublicity) out.push({ title: 'Announcements', text: 'Neither party will make any public announcement about the proposed transaction without the prior written consent of the other.', binding: true })
  if (c.expenses) out.push({ title: 'Costs', text: 'Each party bears its own legal, accounting and other costs in connection with this Letter and the proposed transaction, whether or not it completes.', binding: true })
  if (c.termination) out.push({ title: 'Termination', text: `This Letter terminates on the earlier of signing of definitive agreements, written notice by either party, or ${i.expiry ? `the date falling 90 days after ${i.expiry}` : '90 days after countersignature'}. The binding provisions survive termination as stated.`, binding: true })
  if (c.law) out.push({ title: 'Governing Law', text: `This Letter is governed by the laws of ${i.law || 'the State of Delaware'}.`, binding: true })
  if (c.nonBinding) {
    const b = out.map((s, k) => (s.binding ? k + 1 : 0)).filter(Boolean)
    out.push({ title: 'Binding Effect', text: `This Letter is an expression of intent only and does not create a binding obligation to complete the transaction, which will arise only under definitive written agreements signed by both parties.${b.length ? ` However, section${b.length > 1 ? 's' : ''} ${listNums([...b, out.length + 1])} ${b.length ? 'are' : 'is'} legally binding.` : ''}`, binding: true })
  }
  return out
}

function listNums(n: number[]): string {
  return n.length <= 1 ? String(n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`
}

/** Plain-text version of the whole letter. */
export function letterText(i: LoiInput): string {
  const secs = compose(i)
  const intro = DEALS[i.deal].intro(i)
  const block = (p: Party) => [p.name, p.title, p.company, ...p.address.split('\n')].filter((x) => x && x.trim()).join('\n')
  return [
    block(i.from),
    i.from.email,
    '',
    i.date,
    '',
    block(i.to),
    '',
    `Re: Letter of Intent — ${i.subject}`,
    '',
    `Dear ${i.to.name || 'Sir or Madam'},`,
    '',
    intro,
    '',
    ...secs.flatMap((s, k) => [`${k + 1}. ${s.title}${s.binding ? ' (binding)' : ''}. ${s.text}`, '']),
    i.expiry ? `This offer expires if not countersigned by ${i.expiry}. If the above reflects your understanding, please sign and return a copy of this Letter.` : 'If the above reflects your understanding, please sign and return a copy of this Letter.',
    '',
    'Sincerely,',
    '',
    `${i.from.company}`,
    `By: ______________________   Name: ${i.from.name}   Title: ${i.from.title}`,
    '',
    'ACKNOWLEDGED AND AGREED:',
    `${i.to.company}`,
    `By: ______________________   Name: ${i.to.name}   Title: ${i.to.title}   Date: __________`,
  ].join('\n')
}
