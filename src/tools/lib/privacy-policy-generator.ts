// Assembles a privacy policy in Markdown from questionnaire answers. Sections appear only when relevant.

export interface Answers {
  company: string; site: string; email: string; address: string; effective: string
  regions: { eu: boolean; uk: boolean; ca: boolean; br: boolean; canada: boolean }
  data: { contact: boolean; account: boolean; payment: boolean; location: boolean; usage: boolean; content: boolean; phone: boolean }
  features: { newsletter: boolean; shop: boolean; analytics: boolean; ads: boolean; forms: boolean; comments: boolean; social: boolean; support: boolean }
  cookies: boolean; analyticsTool: string; paymentTool: string; emailTool: string; hosting: string
  sells: boolean; transfers: boolean; children: 'none' | 'under13' | 'teens'; retention: string; dpo: string
}

const join = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const li = (xs: (string | false)[]) => xs.filter(Boolean).map((x) => `- ${x}`).join('\n')

export function buildPolicy(a: Answers): { markdown: string; sections: string[] } {
  const co = a.company.trim() || 'We'
  const site = a.site.trim() || 'our website'
  const contact = a.email.trim() || '[your email]'
  const gdpr = a.regions.eu || a.regions.uk
  const out: [string, string][] = []
  const sec = (title: string, body: string) => {
    if (body.trim()) out.push([title, body.trim()])
  }

  sec('Who we are', `${co} ("we", "us", "our") operates ${site}. This policy explains what personal data we collect, why we collect it, how we use and share it, and the choices and rights you have.${gdpr ? ` For the purposes of data protection law, ${co} is the data controller.` : ''}${a.address.trim() ? `\n\nPostal address: ${a.address.trim()}` : ''}`)

  const collected = li([
    a.data.contact && '**Contact details** such as your name and email address, when you contact us or sign up.',
    a.data.phone && '**Phone number**, if you choose to give it to us.',
    a.data.account && '**Account information** such as your username and password (stored in hashed form).',
    a.data.payment && `**Payment information**. Payments are handled by ${a.paymentTool.trim() || 'our payment processor'}; we do not store full card numbers. We keep a record of what you bought and the billing address.`,
    a.data.location && '**Location data**, approximate (from your IP address) or precise if you allow it in your browser or device.',
    a.data.usage && '**Usage and device data**: pages viewed, links clicked, browser type, operating system, referring site, IP address and timestamps.',
    a.data.content && '**Content you provide**, such as comments, reviews, uploads or messages.',
  ])
  sec('Information we collect', collected ? `We collect the following information:\n\n${collected}` : 'We do not intentionally collect personal information beyond what is technically necessary to serve the website (such as server logs kept for security).')

  const uses = li([
    (a.data.account || a.features.shop) && 'To provide our services, create and manage your account, and fulfil orders.',
    a.features.shop && 'To process payments, prevent fraud and send order confirmations and receipts.',
    (a.features.forms || a.features.support) && 'To answer your questions and provide customer support.',
    a.features.newsletter && 'To send newsletters and marketing emails you have signed up for. You can unsubscribe at any time using the link in every email.',
    a.features.analytics && 'To understand how visitors use the site so we can improve it.',
    a.features.ads && 'To show and measure advertising, including ads on other websites based on your visits to ours.',
    a.features.comments && 'To publish comments and reviews you choose to post.',
    'To keep our services secure and comply with legal obligations.',
  ])
  sec('How we use your information', uses)

  if (gdpr) {
    sec('Legal bases for processing (GDPR)', `Under the ${join([a.regions.eu && 'EU', a.regions.uk && 'UK'].filter(Boolean) as string[])} General Data Protection Regulation we rely on:\n\n${li([
      (a.data.account || a.features.shop) && '**Contract**: to provide the service or products you request.',
      (a.features.newsletter || a.features.ads || a.cookies) && '**Consent**: for marketing emails, non-essential cookies and personalised advertising. You can withdraw consent at any time.',
      '**Legitimate interests**: to secure, maintain and improve our services, where those interests are not overridden by your rights.',
      '**Legal obligation**: to keep records such as invoices for tax purposes.',
    ])}`)
  }

  if (a.cookies) {
    sec('Cookies and similar technologies', `We use cookies and similar technologies.\n\n${li([
      '**Strictly necessary cookies** make the site work (for example, keeping you signed in or remembering your cart).',
      a.features.analytics && `**Analytics cookies** help us understand site usage${a.analyticsTool.trim() ? ` (we use ${a.analyticsTool.trim()})` : ''}.`,
      a.features.ads && '**Advertising cookies** are set by us or our partners to show relevant ads and measure their performance.',
    ])}\n\n${gdpr ? 'Non-essential cookies are only set after you give consent in our cookie banner. ' : ''}You can block or delete cookies in your browser settings; some parts of the site may not work without them.`)
  }

  const providers = li([
    a.hosting.trim() && `Hosting: ${a.hosting.trim()}`,
    a.features.analytics && a.analyticsTool.trim() && `Analytics: ${a.analyticsTool.trim()}`,
    a.data.payment && a.paymentTool.trim() && `Payments: ${a.paymentTool.trim()}`,
    a.features.newsletter && a.emailTool.trim() && `Email delivery: ${a.emailTool.trim()}`,
  ])
  sec('How we share information', `${a.sells ? 'We may sell or share personal information with third parties for advertising purposes; see "Your rights" for how to opt out.' : 'We do not sell your personal information.'} We share it only with:\n\n${li([
    '**Service providers** who process data on our behalf under contract and only on our instructions.',
    a.features.ads && '**Advertising partners**, where you have allowed it.',
    a.features.social && '**Social login providers** (such as Google or Apple) when you choose to sign in with them; we receive basic profile information they share with your permission.',
    '**Authorities**, when required by law or to protect rights, property and safety.',
    '**A buyer or successor**, if our business is merged or sold.',
  ])}${providers ? `\n\nService providers we currently use:\n\n${providers}` : ''}`)

  if (a.transfers) sec('International transfers', `Your information may be processed in countries other than your own.${gdpr ? ' When we transfer personal data outside the EEA or UK, we use safeguards such as the European Commission\'s Standard Contractual Clauses or adequacy decisions.' : ' We take steps to make sure it remains protected.'}`)

  sec('How long we keep information', a.retention.trim() || 'We keep personal information only as long as necessary for the purposes described above, then delete or anonymise it.')

  const rights: string[] = []
  if (gdpr) rights.push(`**If you are in the ${join([a.regions.eu && 'EEA', a.regions.uk && 'UK'].filter(Boolean) as string[])}**, you have the right to access, correct, delete, restrict or object to the processing of your data, to data portability, and to withdraw consent. You can also complain to your local data protection authority${a.regions.uk ? ' (in the UK, the ICO)' : ''}.`)
  if (a.regions.ca) rights.push(`**If you are a California resident** (CCPA/CPRA), you have the right to know what personal information we collect, use and disclose; to delete and correct it; to opt out of its sale or sharing${a.sells ? ' (use the "Do Not Sell or Share My Personal Information" link on our site)' : ' (we do not sell or share it)'}; to limit the use of sensitive information; and not to be discriminated against for exercising these rights. We honour Global Privacy Control signals.`)
  if (a.regions.br) rights.push('**If you are in Brazil** (LGPD), you have the right to confirmation of processing, access, correction, anonymisation, portability, deletion, information about sharing, and to revoke consent.')
  if (a.regions.canada) rights.push('**If you are in Canada** (PIPEDA), you may access and correct your personal information and withdraw consent, subject to legal and contractual limits.')
  rights.push(`To exercise any right, email us at ${contact}. We will respond within the time required by law${gdpr ? ' (normally one month)' : ''} and may need to verify your identity.`)
  sec('Your rights', rights.join('\n\n'))

  if (a.features.newsletter) sec('Marketing emails', 'You can unsubscribe from marketing emails at any time by clicking the link at the bottom of any email or by contacting us. We will still send important messages about your account or orders.')

  sec('Security', 'We use reasonable technical and organisational measures to protect your information, including encryption in transit (HTTPS) and access controls. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.')

  sec("Children's privacy", a.children === 'none'
    ? `Our services are not directed to children under ${gdpr ? 16 : 13}, and we do not knowingly collect their personal information. If you believe a child has given us personal data, contact us and we will delete it.`
    : a.children === 'under13'
      ? 'Our services may be used by children under 13. We collect personal information from children only with verifiable parental consent as required by the Children\'s Online Privacy Protection Act (COPPA). Parents can review, delete or stop further collection of their child\'s information by contacting us.'
      : `Our services may be used by teenagers. ${gdpr ? 'Where we rely on consent and the user is under 16 (or the lower age set by their country), we ask for consent from a parent or guardian. ' : ''}We do not use personal data of users under 18 for targeted advertising.`)

  sec('Changes to this policy', 'We may update this policy from time to time. We will post the new version on this page with a new effective date and, for significant changes, notify you by email or a notice on the site.')
  sec('Contact us', `Questions about this policy or your data? Email ${contact}${a.address.trim() ? ` or write to ${a.address.trim()}` : ''}.${a.dpo.trim() ? `\n\nOur data protection officer can be reached at ${a.dpo.trim()}.` : ''}`)

  const head = `# Privacy Policy\n\n**Effective date:** ${a.effective || '[date]'}`
  return { markdown: [head, ...out.map(([t, b]) => `## ${t}\n\n${b}`)].join('\n\n') + '\n', sections: out.map(([t]) => t) }
}
