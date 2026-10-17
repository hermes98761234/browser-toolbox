import { describe, expect, it } from 'vitest'
import { buildPolicy, type Answers } from './privacy-policy-generator'

const base: Answers = {
  company: 'Acme', site: 'acme.test', email: 'privacy@acme.test', address: '', effective: '2026-10-17',
  regions: { eu: false, uk: false, ca: false, br: false, canada: false },
  data: { contact: true, account: false, payment: false, location: false, usage: false, content: false, phone: false },
  features: { newsletter: false, shop: false, analytics: false, ads: false, forms: true, comments: false, social: false, support: false },
  cookies: false, analyticsTool: '', paymentTool: '', emailTool: '', hosting: '', sells: false, transfers: false, children: 'none', retention: '', dpo: '',
}

describe('privacy-policy-generator', () => {
  it('includes only relevant sections', () => {
    const { markdown, sections } = buildPolicy(base)
    expect(markdown.startsWith('# Privacy Policy\n\n**Effective date:** 2026-10-17')).toBe(true)
    expect(sections).not.toContain('Legal bases for processing (GDPR)')
    expect(sections).not.toContain('Cookies and similar technologies')
    expect(sections).not.toContain('Marketing emails')
    expect(markdown).toContain('We do not sell your personal information.')
    expect(markdown).toContain('not directed to children under 13')
  })
  it('adds GDPR, CCPA, cookies and newsletter content', () => {
    const { markdown, sections } = buildPolicy({
      ...base, cookies: true, analyticsTool: 'Plausible', sells: true,
      regions: { ...base.regions, eu: true, uk: true, ca: true },
      features: { ...base.features, newsletter: true, analytics: true },
    })
    expect(sections).toContain('Legal bases for processing (GDPR)')
    expect(markdown).toContain('EU and UK General Data Protection Regulation')
    expect(markdown).toContain('(we use Plausible)')
    expect(markdown).toContain('Do Not Sell or Share')
    expect(markdown).toContain('(in the UK, the ICO)')
    expect(markdown).toContain('not directed to children under 16')
    expect(sections).toContain('Marketing emails')
  })
  it('handles COPPA', () => {
    expect(buildPolicy({ ...base, children: 'under13' }).markdown).toContain('COPPA')
  })
})
