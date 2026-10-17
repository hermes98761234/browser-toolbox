import { describe, expect, it } from 'vitest'
import { build, docxDocument, placeholders, toDocx, toHtml, toMarkdown, type Answers } from './terms-of-service-generator'

const A: Answers = {
  site: 'Acme Notes', company: 'Acme Ltd', url: 'https://acme.example', email: 'legal@acme.example', address: '', country: 'Ireland', region: '',
  effective: '2026-10-17', biz: 'saas', accounts: true, ugc: false, payments: true, subscriptions: true, trial: true, trialDays: 14,
  refundDays: 30, minAge: 16, links: true, ai: false, dmca: false, arbitration: false, privacyUrl: '', noticeDays: 30, liabilityCap: '',
}

describe('terms-of-service-generator', () => {
  it('includes optional sections only when enabled', () => {
    const t = build(A).map((s) => s.title)
    expect(t).toContain('Accounts')
    expect(t).not.toContain('Your Content')
    expect(t).not.toContain('Copyright complaints')
    expect(build({ ...A, ugc: true, dmca: true }).map((s) => s.title)).toEqual(expect.arrayContaining(['Your Content', 'Copyright complaints']))
  })
  it('fills answers and marks missing ones as placeholders', () => {
    const fees = build(A).find((s) => s.title.startsWith('Fees'))!.paras.join(' ')
    expect(fees).toContain('14 days')
    expect(fees).toContain('within 30 days')
    expect(placeholders(build(A))).toEqual([])
    expect(placeholders(build({ ...A, company: '', country: ' ' }))).toEqual(['[COMPANY LEGAL NAME]', '[COUNTRY]'])
  })
  it('exports Markdown, escaped HTML and a DOCX zip', () => {
    const secs = build({ ...A, site: 'A <b> & co' })
    expect(toMarkdown('Terms', '2026-10-17', secs)).toMatch(/^# Terms\n\n\*Effective date: 2026-10-17\*\n\n## 1\. Agreement/)
    expect(toHtml('Terms', 'x', secs)).toContain('A &lt;b&gt; &amp; co')
    expect(docxDocument('T', 'x', secs)).toContain('<w:t xml:space="preserve">1. Agreement to these Terms</w:t>')
    const z = toDocx('T', 'x', secs)
    expect([z[0], z[1], z[2], z[3]]).toEqual([0x50, 0x4b, 3, 4])
  })
})
