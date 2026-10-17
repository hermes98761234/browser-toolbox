// Terms of Service template engine: answers → numbered sections → Markdown / HTML / DOCX (WordprocessingML).
import { zip } from './metadata-stripper'

export type Biz = 'saas' | 'shop' | 'blog' | 'marketplace' | 'community' | 'app'

export interface Answers {
  site: string; company: string; url: string; email: string; address: string
  country: string; region: string; effective: string; biz: Biz
  accounts: boolean; ugc: boolean; payments: boolean; subscriptions: boolean; trial: boolean; trialDays: number
  refundDays: number; minAge: number; links: boolean; ai: boolean; dmca: boolean; arbitration: boolean
  privacyUrl: string; noticeDays: number; liabilityCap: string
}

export interface Section { title: string; paras: string[] }

const BIZ: Record<Biz, string> = {
  saas: 'an online software service', shop: 'an online store', blog: 'a website publishing articles and media', marketplace: 'an online marketplace connecting buyers and sellers', community: 'an online community', app: 'a mobile and web application',
}

/** Replaces empty answers with visible [PLACEHOLDER] markers. */
const ph = (v: string, name: string) => (v.trim() ? v.trim() : `[${name}]`)

export function build(a: Answers): Section[] {
  const S = ph(a.site, 'SITE NAME'), C = ph(a.company, 'COMPANY LEGAL NAME'), U = ph(a.url, 'WEBSITE URL'), E = ph(a.email, 'CONTACT EMAIL')
  const law = [a.region.trim(), ph(a.country, 'COUNTRY')].filter(Boolean).join(', ')
  const out: Section[] = []
  const add = (title: string, ...paras: string[]) => out.push({ title, paras })
  add('Agreement to these Terms',
    `These Terms of Service (“Terms”) govern your access to and use of ${S} at ${U} (the “Service”), ${BIZ[a.biz]} operated by ${C} (“we”, “us”, “our”).`,
    'By accessing or using the Service you agree to be bound by these Terms. If you do not agree, do not use the Service.')
  add('Eligibility', `You must be at least ${a.minAge} years old to use the Service. If you use the Service on behalf of an organisation, you confirm that you are authorised to accept these Terms for it.`)
  if (a.accounts)
    add('Accounts',
      'Some features require an account. You agree to provide accurate information and to keep it up to date.',
      'You are responsible for safeguarding your password and for all activity under your account. Tell us immediately at ' + E + ' if you suspect unauthorised use.')
  if (a.ugc)
    add('Your Content',
      'You keep ownership of the content you submit (“User Content”). You grant us a worldwide, non-exclusive, royalty-free licence to host, store, reproduce and display User Content solely to operate and improve the Service.',
      'You are responsible for your User Content and confirm that you have the rights needed to post it. We may remove content that breaks these Terms or the law.')
  add('Acceptable use',
    'You agree not to: (a) break any law or third-party right; (b) upload malware or interfere with the Service’s security or performance; (c) scrape, copy or reverse-engineer the Service except as permitted by law; (d) send spam or impersonate others; (e) use the Service to harass, abuse or harm anyone.')
  if (a.payments) {
    const p = [`Prices are shown before you pay and include or exclude taxes as indicated at checkout. Payments are processed by third-party payment providers; we do not store full card details.`]
    if (a.subscriptions) p.push('Subscriptions renew automatically at the end of each billing period until cancelled. You can cancel at any time in your account settings; cancellation takes effect at the end of the current period.')
    if (a.trial) p.push(`Free trials last ${a.trialDays} days. Unless you cancel before the trial ends, you will be charged for the plan you selected.`)
    p.push(a.refundDays > 0 ? `You may request a full refund within ${a.refundDays} days of purchase by contacting ${E}. Statutory rights you have as a consumer are not affected.` : `Payments are non-refundable except where required by law. Statutory rights you have as a consumer are not affected.`)
    if (a.subscriptions) p.push(`We may change prices with at least ${a.noticeDays} days’ notice; changes apply from your next billing period.`)
    add(a.biz === 'shop' ? 'Orders, payment and refunds' : 'Fees, payment and refunds', ...p)
  }
  if (a.biz === 'marketplace')
    add('Marketplace transactions', `${S} is a venue. Contracts for goods or services listed by sellers are made directly between buyers and sellers. We are not a party to those contracts and do not guarantee the quality, safety or legality of listings.`)
  add('Intellectual property', `The Service, including its software, design, text and trademarks, is owned by ${C} or its licensors and protected by law. These Terms do not grant you any right to use our trademarks or branding.`)
  if (a.ai)
    add('AI-generated output', 'Parts of the Service use automated or AI systems. Output may be inaccurate or incomplete; review it before relying on it. You are responsible for how you use output, and output may not be unique to you.')
  if (a.links) add('Third-party links and services', 'The Service may link to websites or services we do not control. We are not responsible for their content, policies or practices, and your use of them is at your own risk.')
  if (a.dmca)
    add('Copyright complaints', `If you believe content on the Service infringes your copyright, send a notice to ${E} that identifies the work, the infringing material and its location, your contact details, and a statement made in good faith and under penalty of perjury that you are the rights holder or authorised to act for them. Repeat infringers’ accounts will be terminated.`)
  add('Privacy', `Our Privacy Policy${a.privacyUrl.trim() ? ` (${a.privacyUrl.trim()})` : ''} explains how we collect and use personal data. By using the Service you acknowledge it.`)
  add('Termination', `You may stop using the Service at any time${a.accounts ? ' and delete your account' : ''}. We may suspend or terminate access if you materially breach these Terms or if required by law. Sections that by their nature should survive termination will survive.`)
  add('Disclaimers', 'The Service is provided “as is” and “as available”. To the fullest extent permitted by law we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose and non-infringement.')
  add('Limitation of liability',
    `To the fullest extent permitted by law, ${C} will not be liable for any indirect, incidental, special, consequential or punitive damages, or for loss of profits, data or goodwill. Our total liability for any claim relating to the Service is limited to ${a.liabilityCap.trim() || 'the amount you paid us in the 12 months before the claim'}.`,
    'Nothing in these Terms limits liability that cannot be limited by law, such as liability for death or personal injury caused by negligence or for fraud.')
  add('Indemnity', `You agree to indemnify ${C} against claims arising from your breach of these Terms or misuse of the Service${a.ugc ? ', including your User Content' : ''}.`)
  add('Governing law and disputes',
    `These Terms are governed by the laws of ${law}, without regard to conflict-of-law rules. Courts located in ${law} have exclusive jurisdiction, except that consumers keep any right to bring proceedings where they live.`,
    ...(a.arbitration ? ['Before filing a claim, you agree to try to resolve the dispute informally by contacting us. Any dispute not resolved within 60 days will be settled by binding individual arbitration, and you waive the right to participate in a class action, except where such waivers are prohibited by law.'] : []))
  add('Changes to these Terms', `We may update these Terms from time to time. If changes are material we will give at least ${a.noticeDays} days’ notice by email or in the Service. Continuing to use the Service after changes take effect means you accept them.`)
  add('Contact', `${C}${a.address.trim() ? `, ${a.address.trim()}` : ''}. Email: ${E}.`)
  return out
}

export const placeholders = (secs: Section[]) => [...new Set(secs.flatMap((s) => s.paras.join(' ').match(/\[[A-Z ]+\]/g) ?? []))]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function toMarkdown(title: string, effective: string, secs: Section[]): string {
  return [`# ${title}`, '', `*Effective date: ${effective}*`, '', ...secs.flatMap((s, i) => [`## ${i + 1}. ${s.title}`, '', ...s.paras.flatMap((p) => [p, ''])])].join('\n').trimEnd() + '\n'
}

export function toHtml(title: string, effective: string, secs: Section[]): string {
  const body = secs.map((s, i) => `<h2>${i + 1}. ${esc(s.title)}</h2>\n${s.paras.map((p) => `<p>${esc(p)}</p>`).join('\n')}`).join('\n')
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#1e293b}h2{font-size:1.15em;margin-top:1.8em}</style></head><body>\n<h1>${esc(title)}</h1>\n<p><em>Effective date: ${esc(effective)}</em></p>\n${body}\n</body></html>\n`
}

const run = (t: string, o: { b?: boolean; i?: boolean; sz?: number } = {}) =>
  `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`
const para = (r: string, after = 160) => `<w:p><w:pPr><w:spacing w:after="${after}"/></w:pPr>${r}</w:p>`

export function docxDocument(title: string, effective: string, secs: Section[]): string {
  const body = [para(run(title, { b: true, sz: 36 }), 120), para(run(`Effective date: ${effective}`, { i: true })), ...secs.flatMap((s, i) => [para(run(`${i + 1}. ${s.title}`, { b: true, sz: 26 }), 80), ...s.paras.map((p) => para(run(p)))])].join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`
}

/** Minimal valid .docx package. */
export function toDocx(title: string, effective: string, secs: Section[]): Uint8Array {
  const enc = new TextEncoder()
  return zip([
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: 'word/document.xml', data: enc.encode(docxDocument(title, effective, secs)) },
  ])
}
