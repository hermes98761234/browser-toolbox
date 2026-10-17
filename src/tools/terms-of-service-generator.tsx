import { Btn, Check, CopyButton, download, Note, Num, Panel, Row, Select, Split, Stat, Stats, Txt, today, useToolState } from '../kit'
import { build, placeholders, toDocx, toHtml, toMarkdown, type Answers, type Biz } from './lib/terms-of-service-generator'

const DEF: Answers & { title: string } = {
  title: 'Terms of Service',
  site: 'Pebble Notes', company: 'Pebble Software Ltd', url: 'https://pebblenotes.example', email: 'legal@pebblenotes.example', address: '',
  country: '', region: '', effective: today(), biz: 'saas',
  accounts: true, ugc: true, payments: true, subscriptions: true, trial: true, trialDays: 14, refundDays: 14, minAge: 16,
  links: true, ai: false, dmca: true, arbitration: false, privacyUrl: 'https://pebblenotes.example/privacy', noticeDays: 30, liabilityCap: '',
}

const BIZ: [Biz, string][] = [['saas', 'SaaS / web app'], ['app', 'Mobile app'], ['shop', 'Online store'], ['marketplace', 'Marketplace'], ['community', 'Community / forum'], ['blog', 'Blog / content site']]
const BIZ_PRESET: Record<Biz, Partial<Answers>> = {
  saas: { accounts: true, payments: true, subscriptions: true, trial: true, ugc: true },
  app: { accounts: true, payments: true, subscriptions: true, trial: false, ugc: false },
  shop: { accounts: true, payments: true, subscriptions: false, trial: false, ugc: false, refundDays: 30 },
  marketplace: { accounts: true, payments: true, subscriptions: false, trial: false, ugc: true, dmca: true },
  community: { accounts: true, payments: false, subscriptions: false, trial: false, ugc: true, dmca: true },
  blog: { accounts: false, payments: false, subscriptions: false, trial: false, ugc: false, dmca: false },
}

function Highlight({ text }: { text: string }) {
  const parts = text.split(/(\[[A-Z ]+\])/g)
  return <>{parts.map((p, i) => (/^\[[A-Z ]+\]$/.test(p) ? <mark key={i} style={{ background: 'rgba(245,158,11,.3)', color: 'inherit', borderRadius: 4, padding: '0 3px' }}>{p}</mark> : p))}</>
}

export default function TermsOfServiceGenerator() {
  const [s, set, reset] = useToolState('terms-of-service-generator', DEF)
  const secs = build(s)
  const missing = placeholders(secs)
  const words = secs.reduce((a, x) => a + x.paras.join(' ').split(/\s+/).length, 0)
  const base = (s.site.trim() || 'terms').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-terms'
  const md = () => toMarkdown(s.title, s.effective, secs)

  return (
    <Split>
      <div>
        <Panel title="About your business">
          <Select label="Type of site" value={s.biz} onChange={(biz) => set({ biz, ...BIZ_PRESET[biz] })} options={BIZ} />
          <Row>
            <Txt label="Site / product name" value={s.site} onChange={(site) => set({ site })} />
            <Txt label="Legal entity name" value={s.company} onChange={(company) => set({ company })} placeholder="Acme Ltd" />
          </Row>
          <Row>
            <Txt label="Website URL" value={s.url} onChange={(url) => set({ url })} />
            <Txt label="Legal contact email" value={s.email} onChange={(email) => set({ email })} />
          </Row>
          <Txt label="Postal address (optional)" value={s.address} onChange={(address) => set({ address })} />
        </Panel>
        <Panel title="Jurisdiction">
          <Row>
            <Txt label="Country of governing law" value={s.country} onChange={(country) => set({ country })} placeholder="e.g. Ireland, United States" />
            <Txt label="State / province (optional)" value={s.region} onChange={(region) => set({ region })} placeholder="e.g. Delaware" />
          </Row>
          <Row>
            <Txt label="Effective date" type="date" value={s.effective} onChange={(effective) => set({ effective })} />
            <Num label="Minimum age" value={s.minAge} onChange={(minAge) => set({ minAge })} min={13} max={21} step={1} />
            <Num label="Notice of changes" value={s.noticeDays} onChange={(noticeDays) => set({ noticeDays })} unit="days" min={0} />
          </Row>
          <Check label="Arbitration + class-action waiver (mostly US)" value={s.arbitration} onChange={(arbitration) => set({ arbitration })} />
        </Panel>
        <Panel title="What your service does">
          <Check label="Users create accounts" value={s.accounts} onChange={(accounts) => set({ accounts })} />
          <Check label="Users post content (comments, files, listings…)" value={s.ugc} onChange={(ugc) => set({ ugc })} />
          <Check label="Copyright takedown process (DMCA-style)" value={s.dmca} onChange={(dmca) => set({ dmca })} />
          <Check label="Links to third-party sites or integrations" value={s.links} onChange={(links) => set({ links })} />
          <Check label="Uses AI-generated output" value={s.ai} onChange={(ai) => set({ ai })} />
          <Check label="Takes payments" value={s.payments} onChange={(payments) => set({ payments })} />
          {s.payments && (
            <div style={{ paddingLeft: 24 }}>
              <Check label="Recurring subscriptions" value={s.subscriptions} onChange={(subscriptions) => set({ subscriptions })} />
              <Check label="Free trial" value={s.trial} onChange={(trial) => set({ trial })} />
              <Row>
                {s.trial && <Num label="Trial length" value={s.trialDays} onChange={(trialDays) => set({ trialDays })} unit="days" min={1} />}
                <Num label="Refund window (0 = none)" value={s.refundDays} onChange={(refundDays) => set({ refundDays })} unit="days" min={0} />
              </Row>
            </div>
          )}
          <Txt label="Privacy policy URL" value={s.privacyUrl} onChange={(privacyUrl) => set({ privacyUrl })} />
          <Txt label="Liability cap (optional)" value={s.liabilityCap} onChange={(liabilityCap) => set({ liabilityCap })} placeholder="the amount you paid us in the 12 months before the claim" />
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Sections" value={secs.length} />
          <Stat label="Words" value={words} sub={`≈ ${Math.max(1, Math.round(words / 230))} min read`} />
          <Stat label="Placeholders" value={missing.length} tone={missing.length ? 'bad' : 'good'} sub={missing.length ? 'still to fill' : 'all filled'} />
        </Stats>
        <Panel
          title="Preview"
          actions={
            <>
              <Btn kind="primary" onClick={() => download(`${base}.docx`, new Blob([toDocx(s.title, s.effective, secs) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))}>⬇ DOCX</Btn>
              <Btn onClick={() => download(`${base}.html`, toHtml(s.title, s.effective, secs), 'text/html')}>⬇ HTML</Btn>
              <Btn onClick={() => download(`${base}.md`, md(), 'text/markdown')}>⬇ Markdown</Btn>
              <CopyButton text={md} label="Copy MD" />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          {missing.length > 0 && <Note tone="warn">Fill in: {missing.join(', ')} — they are highlighted below.</Note>}
          <article style={{ maxHeight: 760, overflow: 'auto', padding: '4px 18px 18px', border: '1px solid var(--line)', borderRadius: 12, lineHeight: 1.6, fontSize: 15 }}>
            <input value={s.title} onChange={(e) => set({ title: e.target.value })} aria-label="Document title" style={{ font: '800 1.6em system-ui', border: 0, background: 'none', color: 'inherit', width: '100%', marginTop: 12 }} />
            <p style={{ fontStyle: 'italic' }} className="muted">Effective date: {s.effective}</p>
            {secs.map((x, i) => (
              <section key={x.title}>
                <h3 style={{ margin: '18px 0 6px' }}>{i + 1}. {x.title}</h3>
                {x.paras.map((p, j) => <p key={j} style={{ margin: '0 0 8px' }}><Highlight text={p} /></p>)}
              </section>
            ))}
          </article>
        </Panel>
        <Note>
          This generator produces a plain-English starting point, not legal advice. Laws differ between countries (consumer rights in the EU/UK, for example, limit
          disclaimers and arbitration). Have a lawyer review the final text before you publish it.
        </Note>
      </div>
    </Split>
  )
}
