import { useState } from 'react'
import { Area, Btn, Check, CopyButton, download, Note, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, today, useToolState } from '../kit'
import { mdToHtml } from './lib/job-description-builder'
import { buildPolicy, type Answers } from './lib/privacy-policy-generator'

const DEF: Answers = {
  company: 'Bluebird Coffee Roasters', site: 'https://bluebird.example', email: 'privacy@bluebird.example', address: '12 Harbour Street, Dublin, Ireland', effective: today(),
  regions: { eu: true, uk: true, ca: false, br: false, canada: false },
  data: { contact: true, account: true, payment: true, location: false, usage: true, content: false, phone: false },
  features: { newsletter: true, shop: true, analytics: true, ads: false, forms: true, comments: false, social: false, support: true },
  cookies: true, analyticsTool: 'Plausible Analytics', paymentTool: 'Stripe', emailTool: 'Mailchimp', hosting: 'Netlify',
  sells: false, transfers: true, children: 'none', retention: 'We keep account data while your account is open and for 30 days after you close it. Order records are kept for 7 years to meet tax law. Newsletter data is kept until you unsubscribe.', dpo: '',
}
type Group = 'regions' | 'data' | 'features'
const LABELS: Record<Group, [string, string][]> = {
  regions: [['eu', 'European Union (GDPR)'], ['uk', 'United Kingdom (UK GDPR)'], ['ca', 'California (CCPA / CPRA)'], ['br', 'Brazil (LGPD)'], ['canada', 'Canada (PIPEDA)']],
  data: [['contact', 'Name & email'], ['phone', 'Phone number'], ['account', 'User accounts (login)'], ['payment', 'Payments / billing'], ['location', 'Location'], ['usage', 'Usage & device data, IP'], ['content', 'User content (uploads, reviews)']],
  features: [['shop', 'Online shop / orders'], ['newsletter', 'Newsletter / marketing email'], ['analytics', 'Analytics'], ['ads', 'Advertising / remarketing'], ['forms', 'Contact form'], ['support', 'Customer support / chat'], ['comments', 'Comments or reviews'], ['social', 'Sign in with Google / Apple / Facebook']],
}

export default function PrivacyPolicyGenerator() {
  const [s, set, reset] = useToolState('privacy-policy-generator', DEF)
  const [tab, setTab] = useState<'preview' | 'md' | 'html'>('preview')
  const { markdown, sections } = buildPolicy(s)
  const html = mdToHtml(markdown)
  const words = markdown.split(/\s+/).filter(Boolean).length
  const group = (g: Group) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '2px 12px' }}>
      {LABELS[g].map(([k, l]) => <Check key={k} label={l} value={(s[g] as Record<string, boolean>)[k]} onChange={(v) => set({ [g]: { ...s[g], [k]: v } } as Partial<Answers>)} />)}
    </div>
  )
  const fullHtml = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Privacy Policy · ${s.company.replace(/</g, '&lt;')}</title><style>body{font:16px/1.65 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#1f2937}h2{margin-top:32px}</style></head><body>\n${html}\n</body></html>`
  const warn: string[] = []
  if (!s.email.trim()) warn.push('Add a contact email; every privacy law requires a way to reach you.')
  if (s.features.analytics && !s.cookies && !/plausible|fathom|simple analytics|umami/i.test(s.analyticsTool)) warn.push('Most analytics tools set cookies. Tick “Uses cookies” unless your tool is cookieless.')
  if (s.features.ads && !s.cookies) warn.push('Advertising almost always uses cookies or device identifiers. Tick “Uses cookies”.')
  if (s.regions.ca && s.sells) warn.push('Selling or sharing data of Californians requires a “Do Not Sell or Share” link on your site.')
  if (s.children === 'under13') warn.push('COPPA needs verifiable parental consent before collecting data from under-13s. Get legal advice.')

  return (
    <Split>
      <div>
        <Panel title="1 · Your business" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Txt label="Business name" value={s.company} onChange={(company) => set({ company })} />
            <Txt label="Website" value={s.site} onChange={(site) => set({ site })} />
          </Row>
          <Row>
            <Txt label="Privacy contact email" type="email" value={s.email} onChange={(email) => set({ email })} />
            <Txt label="Effective date" type="date" value={s.effective} onChange={(effective) => set({ effective })} />
          </Row>
          <Txt label="Postal address (optional)" value={s.address} onChange={(address) => set({ address })} />
        </Panel>
        <Panel title="2 · Where are your users?">{group('regions')}</Panel>
        <Panel title="3 · What data do you collect?">{group('data')}</Panel>
        <Panel title="4 · What does your site do?">
          {group('features')}
          <Check label="Uses cookies or similar tracking" value={s.cookies} onChange={(cookies) => set({ cookies })} />
          <Row>
            {s.features.analytics && <Txt label="Analytics tool" value={s.analyticsTool} onChange={(analyticsTool) => set({ analyticsTool })} placeholder="Google Analytics" />}
            {s.data.payment && <Txt label="Payment processor" value={s.paymentTool} onChange={(paymentTool) => set({ paymentTool })} placeholder="Stripe, PayPal" />}
          </Row>
          <Row>
            {s.features.newsletter && <Txt label="Email service" value={s.emailTool} onChange={(emailTool) => set({ emailTool })} placeholder="Mailchimp" />}
            <Txt label="Hosting provider" value={s.hosting} onChange={(hosting) => set({ hosting })} placeholder="Vercel, AWS" />
          </Row>
        </Panel>
        <Panel title="5 · Sharing, retention, children">
          <Check label="We sell or share personal data for advertising" value={s.sells} onChange={(sells) => set({ sells })} />
          <Check label="Data is processed in other countries" value={s.transfers} onChange={(transfers) => set({ transfers })} />
          <Select label="Children" value={s.children} onChange={(children) => set({ children })} options={[['none', 'Not for children'], ['teens', 'Teenagers may use it'], ['under13', 'Directed at children under 13']]} />
          <Area label="Retention (how long you keep data)" value={s.retention} onChange={(retention) => set({ retention })} rows={3} />
          <Txt label="Data protection officer (optional)" value={s.dpo} onChange={(dpo) => set({ dpo })} placeholder="dpo@example.com" />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Sections" value={sections.length + 1} />
          <Stat label="Words" value={words} sub={`~${Math.max(1, Math.round(words / 230))} min read`} />
          <Stat label="Laws covered" value={Object.values(s.regions).filter(Boolean).length} tone="accent" />
        </Stats>
        {warn.map((w) => <Note key={w} tone="warn">{w}</Note>)}
        <Panel title="Your privacy policy" actions={<>
          <CopyButton text={markdown} label="Copy Markdown" />
          <CopyButton text={html} label="Copy HTML" />
          <Btn onClick={() => download('privacy-policy.md', markdown, 'text/markdown')}>⬇ .md</Btn>
          <Btn onClick={() => download('privacy-policy.html', fullHtml, 'text/html')}>⬇ .html</Btn>
        </>}>
          <Seg value={tab} onChange={setTab} options={[['preview', 'Preview'], ['md', 'Markdown'], ['html', 'HTML']]} label="Output format" />
          <div style={{ marginTop: 10, border: '1px solid var(--line)', borderRadius: 8, maxHeight: 820, overflow: 'auto', background: 'var(--panel)' }}>
            {tab === 'preview' ? <div style={{ padding: '4px 18px', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: html }} /> : <pre style={{ margin: 0, padding: 14, whiteSpace: 'pre-wrap', fontSize: 13 }}>{tab === 'md' ? markdown : html}</pre>}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Sections included: {sections.join(' · ')}.</p>
        </Panel>
        <Note tone="warn">This generator produces a solid starting draft, not legal advice. Laws change and every business is different; have a lawyer review the policy, especially if you handle health, financial or children's data.</Note>
      </div>
    </Split>
  )
}
