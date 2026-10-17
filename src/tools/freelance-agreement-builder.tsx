import { useMemo, type ReactNode } from 'react'
import { Area, Btn, Check, CopyButton, download, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { numberSections, payment, render, winAnsi, wrap, type Milestone } from './lib/freelance-agreement-builder'

interface State {
  step: string
  fName: string; fBiz: string; fAddr: string; fEmail: string
  cName: string; cCompany: string; cAddr: string; cEmail: string
  date: string; title: string; scope: string; deliverables: string; exclusions: string; revisions: number
  payType: 'fixed' | 'hourly' | 'milestones'; currency: string; fixed: number; rate: number; hours: number; capHours: boolean; milestones: Milestone[]
  depositPct: number; terms: number; lateFee: number; expenses: boolean
  start: string; end: string; feedbackDays: number
  ip: 'assign' | 'license'; portfolio: boolean; confidentiality: boolean; killFee: number; noticeDays: number; nonSolicit: number; liabilityCap: boolean; law: string; disputes: 'courts' | 'mediation' | 'arbitration'
}

const DEF: State = {
  step: 'parties',
  fName: 'Alex Rivera', fBiz: 'Rivera Studio', fAddr: '12 Harbour Lane, Bristol BS1 4RD, UK', fEmail: 'alex@riverastudio.co',
  cName: 'Priya Shah', cCompany: 'Brightleaf Tea Ltd', cAddr: '88 Market Street, Manchester M1 1PT, UK', cEmail: 'priya@brightleaf.tea',
  date: new Date().toISOString().slice(0, 10), title: 'Brand refresh and e-commerce website',
  scope: 'Design and build a new brand identity and a responsive Shopify storefront for Brightleaf Tea.',
  deliverables: 'Logo suite (primary, secondary, icon) with usage guide\nColour palette and typography system\nShopify theme customisation for up to 8 page templates\nProduct photography retouching for 30 images\nLaunch support for 14 days after go-live',
  exclusions: 'Copywriting, paid advertising, hosting fees and third-party app subscriptions.',
  revisions: 2,
  payType: 'milestones', currency: '£', fixed: 6000, rate: 65, hours: 90, capHours: true,
  milestones: [
    { name: 'Brand identity approved', amount: 2400, due: '' },
    { name: 'Store design approved', amount: 2100, due: '' },
    { name: 'Launch', amount: 1500, due: '' },
  ],
  depositPct: 25, terms: 14, lateFee: 1.5, expenses: true,
  start: '', end: '', feedbackDays: 5,
  ip: 'assign', portfolio: true, confidentiality: true, killFee: 25, noticeDays: 14, nonSolicit: 12, liabilityCap: true, law: 'England and Wales', disputes: 'mediation',
}

const TEMPLATE = `# Freelance Services Agreement

This Freelance Services Agreement (the “Agreement”) is made on {{dateLong}} between:

**Freelancer:** {{fName}}{{#if fBiz}}, trading as {{fBiz}}{{/if}}, of {{fAddr}} ({{fEmail}}); and
**Client:** {{cName}}{{#if cCompany}} on behalf of {{cCompany}}{{/if}}, of {{cAddr}} ({{cEmail}}).

## Services
The Freelancer will provide the following services for the project “{{title}}”: {{scope}}

## Deliverables
{{#each deliverables}}- {{this}}
{{/each}}
{{#if exclusions}}The following are not included unless agreed in writing: {{exclusions}}{{/if}}

## Timeline
{{#if start}}Work will begin on {{startLong}}{{else}}Work will begin once the deposit is received{{/if}}{{#if end}} and is scheduled for completion by {{endLong}}{{/if}}. The Client will provide feedback, content and approvals within {{feedbackDays}} business days of each request; delays on the Client’s side extend the timeline accordingly.

## Revisions and changes
The fee includes {{revisions}} round(s) of revisions per deliverable. Further revisions or changes in scope will be quoted separately and require written approval before work starts.

## Fees and payment
{{#eq payType "fixed"}}The total fee is a fixed {{fixedTxt}}.{{/eq}}{{#eq payType "hourly"}}Work is billed at {{rateTxt}} per hour, estimated at {{hours}} hours ({{totalTxt}}).{{#if capHours}} Hours above the estimate will not be billed without the Client’s prior written approval.{{/if}}{{/eq}}{{#eq payType "milestones"}}The total fee of {{totalTxt}} is payable in milestones:
{{#each milestones}}- {{name}}: {{amountTxt}}{{#if due}} (due {{due}}){{/if}}
{{/each}}{{/eq}}
{{#if depositPct}}A non-refundable deposit of {{depositPct}}% ({{depositTxt}}) is due before work begins and is credited against the total fee.{{/if}} Invoices are payable within {{terms}} days of issue.{{#if lateFee}} Overdue amounts accrue interest at {{lateFee}}% per month.{{/if}}{{#if expenses}} Pre-approved out-of-pocket expenses (such as stock assets, fonts or licences) will be invoiced at cost.{{/if}}

## Intellectual property
{{#eq ip "assign"}}Upon receipt of full payment, the Freelancer assigns to the Client all rights, title and interest in the final deliverables. Until then, the Freelancer retains ownership. Pre-existing materials, tools and third-party assets remain with their owners and are licensed to the Client for use in the deliverables.{{else}}The Freelancer retains ownership of all work product and, upon full payment, grants the Client a perpetual, non-exclusive, worldwide licence to use the final deliverables for the purposes of this project.{{/eq}}{{#if portfolio}} The Freelancer may display the work in their portfolio and marketing after public launch, unless the Client requests otherwise in writing.{{/if}}

{{#if confidentiality}}## Confidentiality
Each party will keep confidential any non-public information received from the other and use it only to perform this Agreement. This obligation survives termination for two (2) years.

{{/if}}## Independent contractor
The Freelancer is an independent contractor, not an employee, and is responsible for their own taxes, insurance and equipment. The Freelancer controls how and when the services are performed.

## Termination
Either party may terminate this Agreement with {{noticeDays}} days’ written notice. The Client will pay for all work completed up to the termination date{{#if killFee}}, plus a cancellation fee of {{killFee}}% of the remaining unpaid fee if the Client terminates without cause{{/if}}. Either party may terminate immediately if the other materially breaches this Agreement and does not remedy it within 10 days of notice.

{{#if nonSolicit}}## Non-solicitation
During the project and for {{nonSolicit}} months afterwards, neither party will directly solicit the other’s employees or subcontractors who worked on the project.

{{/if}}{{#if liabilityCap}}## Limitation of liability
Except for breaches of confidentiality or wilful misconduct, each party’s total liability under this Agreement is limited to the fees paid under it. Neither party is liable for indirect or consequential losses.

{{/if}}## Governing law and disputes
This Agreement is governed by the laws of {{law}}. {{#eq disputes "mediation"}}The parties will first try to resolve any dispute through good-faith negotiation and then mediation before starting court proceedings.{{/eq}}{{#eq disputes "arbitration"}}Any dispute not resolved by negotiation within 30 days will be settled by binding arbitration under the rules agreed by the parties.{{/eq}}{{#eq disputes "courts"}}The courts of {{law}} have exclusive jurisdiction.{{/eq}}

## Entire agreement
This Agreement is the entire agreement between the parties about the project and replaces any prior discussions. Changes must be in writing and signed by both parties.

Signed by the parties:

{{fName}} (Freelancer) — signature: ______________________  date: __________

{{cName}}{{#if cCompany}}, {{cCompany}}{{/if}} (Client) — signature: ______________________  date: __________
`

const STEPS: [string, string][] = [['parties', '1 Parties'], ['scope', '2 Scope'], ['pay', '3 Payment'], ['time', '4 Timeline'], ['clauses', '5 Clauses']]
const longDate = (iso: string) => (iso ? new Date(iso + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

function Md({ text }: { text: string }) {
  const inline = (l: string): ReactNode[] => l.split(/(\*\*[^*]+\*\*)/).map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p))
  const out: ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) out.push(<ul key={out.length} style={{ margin: '4px 0 8px' }}>{list.map((x, i) => <li key={i}>{inline(x)}</li>)}</ul>)
    list = []
  }
  for (const l of text.split('\n')) {
    if (l.startsWith('- ')) { list.push(l.slice(2)); continue }
    flush()
    if (l.startsWith('# ')) out.push(<h2 key={out.length} style={{ textAlign: 'center', margin: '0 0 12px', fontFamily: 'Georgia, serif' }}>{l.slice(2)}</h2>)
    else if (l.startsWith('## ')) out.push(<h4 key={out.length} style={{ margin: '14px 0 4px' }}>{l.slice(3)}</h4>)
    else if (l.trim()) out.push(<p key={out.length} style={{ margin: '4px 0' }}>{inline(l)}</p>)
  }
  flush()
  return <>{out}</>
}

export default function FreelanceAgreementBuilder() {
  const [s, set, reset] = useToolState('freelance-agreement-builder', DEF)
  const m = (x: number) => `${s.currency}${x.toLocaleString('en-GB', { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
  const pay = payment({ type: s.payType, fixed: s.fixed, rate: s.rate, hours: s.hours, milestones: s.milestones, depositPct: s.depositPct })

  const { text, error } = useMemo(() => {
    const data = {
      ...s,
      dateLong: longDate(s.date), startLong: longDate(s.start), endLong: longDate(s.end),
      deliverables: s.deliverables.split('\n').map((x) => x.trim()).filter(Boolean),
      milestones: s.milestones.map((x) => ({ ...x, amountTxt: m(x.amount), due: x.due ? longDate(x.due) : '' })),
      fixedTxt: m(s.fixed), rateTxt: m(s.rate), totalTxt: m(pay.total), depositTxt: m(pay.deposit),
    }
    try {
      return { text: numberSections(render(TEMPLATE, data)), error: '' }
    } catch (e) {
      return { text: '', error: (e as Error).message }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, pay.total, pay.deposit])

  const missing = [
    !s.fName && 'freelancer name', !s.cName && 'client name', !s.fEmail && 'freelancer email', !s.cEmail && 'client email', !s.title && 'project title', !s.scope && 'scope',
    !s.deliverables.trim() && 'deliverables', pay.total <= 0 && 'a fee', s.end && s.start && s.end < s.start && 'an end date after the start', !s.law && 'governing law',
  ].filter(Boolean) as string[]
  const idx = STEPS.findIndex(([k]) => k === s.step)
  const fileBase = `agreement-${(s.cCompany || s.cName || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const plain = text.replace(/\*\*/g, '')

  const pdf = async () => {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    doc.setTitle(`Freelance Services Agreement — ${s.title}`)
    const reg = await doc.embedFont(StandardFonts.TimesRoman)
    const bold = await doc.embedFont(StandardFonts.TimesRomanBold)
    const W = 595.28, H = 841.89, M = 64
    let page = doc.addPage([W, H])
    let y = H - M
    const pages = [page]
    const line = (t: string, f = reg, size = 11, indent = 0, center = false) => {
      for (const l of wrap(winAnsi(t), W - 2 * M - indent, (x) => f.widthOfTextAtSize(x, size))) {
        if (y < M + 20) {
          page = doc.addPage([W, H])
          pages.push(page)
          y = H - M
        }
        page.drawText(l, { x: center ? (W - f.widthOfTextAtSize(l, size)) / 2 : M + indent, y, size, font: f, color: rgb(0.1, 0.1, 0.12) })
        y -= size * 1.38
      }
    }
    for (const l of text.split('\n')) {
      if (l.startsWith('# ')) { line(l.slice(2), bold, 18, 0, true); y -= 8 }
      else if (l.startsWith('## ')) { y -= 6; line(l.slice(3), bold, 12) }
      else if (l.startsWith('- ')) line(`•  ${l.slice(2)}`, reg, 11, 12)
      else if (!l.trim()) y -= 5
      else if (l.startsWith('**')) {
        line(l.replace(/\*\*/g, ''), reg, 11)
      } else line(l)
    }
    pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}  ·  Initials: ______ / ______`, { x: M, y: 34, size: 9, font: reg, color: rgb(0.45, 0.45, 0.5) }))
    download(`${fileBase}.pdf`, new Blob([(await doc.save()) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }))
  }

  const ms = (i: number, p: Partial<Milestone>) => set({ milestones: s.milestones.map((x, j) => (j === i ? { ...x, ...p } : x)) })

  return (
    <Split>
      <div>
        <Panel title="Build your agreement" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.step} onChange={(step) => set({ step })} options={STEPS} />
          <div style={{ marginTop: 12 }}>
            {s.step === 'parties' && (
              <>
                <h4 style={{ margin: '4px 0' }}>Freelancer (you)</h4>
                <Row><Txt label="Full name" value={s.fName} onChange={(fName) => set({ fName })} /><Txt label="Business name (optional)" value={s.fBiz} onChange={(fBiz) => set({ fBiz })} /></Row>
                <Row><Txt label="Address" value={s.fAddr} onChange={(fAddr) => set({ fAddr })} /><Txt label="Email" type="email" value={s.fEmail} onChange={(fEmail) => set({ fEmail })} /></Row>
                <h4 style={{ margin: '12px 0 4px' }}>Client</h4>
                <Row><Txt label="Contact name" value={s.cName} onChange={(cName) => set({ cName })} /><Txt label="Company (optional)" value={s.cCompany} onChange={(cCompany) => set({ cCompany })} /></Row>
                <Row><Txt label="Address" value={s.cAddr} onChange={(cAddr) => set({ cAddr })} /><Txt label="Email" type="email" value={s.cEmail} onChange={(cEmail) => set({ cEmail })} /></Row>
                <Txt label="Agreement date" type="date" value={s.date} onChange={(date) => set({ date })} />
              </>
            )}
            {s.step === 'scope' && (
              <>
                <Txt label="Project title" value={s.title} onChange={(title) => set({ title })} />
                <Area label="Scope of services" value={s.scope} onChange={(scope) => set({ scope })} rows={3} />
                <Area label="Deliverables (one per line)" value={s.deliverables} onChange={(deliverables) => set({ deliverables })} rows={6} />
                <Area label="Not included (optional)" value={s.exclusions} onChange={(exclusions) => set({ exclusions })} rows={2} />
                <Num label="Revision rounds included" value={s.revisions} onChange={(revisions) => set({ revisions: Math.max(0, Math.round(revisions)) })} min={0} max={20} />
              </>
            )}
            {s.step === 'pay' && (
              <>
                <Row>
                  <Seg value={s.payType} onChange={(payType) => set({ payType })} options={[['fixed', 'Fixed fee'], ['hourly', 'Hourly'], ['milestones', 'Milestones']]} />
                  <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'A$', 'C$', 'CHF ']} />
                </Row>
                {s.payType === 'fixed' && <Num label="Fixed fee" value={s.fixed} onChange={(fixed) => set({ fixed })} unit={s.currency} min={0} />}
                {s.payType === 'hourly' && (
                  <>
                    <Row><Num label="Hourly rate" value={s.rate} onChange={(rate) => set({ rate })} unit={s.currency} min={0} /><Num label="Estimated hours" value={s.hours} onChange={(hours) => set({ hours })} unit="h" min={0} /></Row>
                    <Check label="Client must approve hours above the estimate" value={s.capHours} onChange={(capHours) => set({ capHours })} />
                  </>
                )}
                {s.payType === 'milestones' && (
                  <>
                    {s.milestones.map((x, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 140px auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                        <input className="k-text" value={x.name} onChange={(e) => ms(i, { name: e.target.value })} aria-label="Milestone" />
                        <input className="k-text" type="number" min={0} value={x.amount} onChange={(e) => ms(i, { amount: Math.max(0, Number(e.target.value) || 0) })} aria-label="Amount" />
                        <input className="k-text" type="date" value={x.due} onChange={(e) => ms(i, { due: e.target.value })} aria-label="Due date" />
                        <Btn kind="ghost" onClick={() => set({ milestones: s.milestones.filter((_, j) => j !== i) })} title="Remove">✕</Btn>
                      </div>
                    ))}
                    <Btn onClick={() => set({ milestones: [...s.milestones, { name: 'New milestone', amount: 0, due: '' }] })}>+ Milestone</Btn>
                  </>
                )}
                <Row>
                  <Num label="Deposit" value={s.depositPct} onChange={(depositPct) => set({ depositPct })} unit="%" min={0} max={100} />
                  <Num label="Payment terms" value={s.terms} onChange={(terms) => set({ terms })} unit="days" min={0} />
                  <Num label="Late interest" value={s.lateFee} onChange={(lateFee) => set({ lateFee })} unit="%/mo" min={0} max={10} />
                </Row>
                <Check label="Client reimburses pre-approved expenses" value={s.expenses} onChange={(expenses) => set({ expenses })} />
              </>
            )}
            {s.step === 'time' && (
              <>
                <Row><Txt label="Start date (blank = on deposit)" type="date" value={s.start} onChange={(start) => set({ start })} /><Txt label="Completion date (optional)" type="date" value={s.end} onChange={(end) => set({ end })} /></Row>
                <Num label="Client feedback window" value={s.feedbackDays} onChange={(feedbackDays) => set({ feedbackDays })} unit="business days" min={1} />
              </>
            )}
            {s.step === 'clauses' && (
              <>
                <Seg value={s.ip} onChange={(ip) => set({ ip })} options={[['assign', 'Assign IP on full payment'], ['license', 'Keep IP, license to client']]} />
                <Check label="Freelancer may show the work in a portfolio" value={s.portfolio} onChange={(portfolio) => set({ portfolio })} />
                <Check label="Confidentiality clause" value={s.confidentiality} onChange={(confidentiality) => set({ confidentiality })} />
                <Check label="Limit liability to fees paid" value={s.liabilityCap} onChange={(liabilityCap) => set({ liabilityCap })} />
                <Row>
                  <Num label="Kill fee (0 = none)" value={s.killFee} onChange={(killFee) => set({ killFee })} unit="%" min={0} max={100} />
                  <Num label="Termination notice" value={s.noticeDays} onChange={(noticeDays) => set({ noticeDays })} unit="days" min={0} />
                  <Num label="Non-solicit (0 = none)" value={s.nonSolicit} onChange={(nonSolicit) => set({ nonSolicit })} unit="months" min={0} />
                </Row>
                <Row>
                  <Txt label="Governing law" value={s.law} onChange={(law) => set({ law })} placeholder="e.g. the State of New York" />
                  <Select label="Disputes" value={s.disputes} onChange={(disputes) => set({ disputes })} options={[['mediation', 'Negotiate, then mediation'], ['arbitration', 'Arbitration'], ['courts', 'Courts']]} />
                </Row>
              </>
            )}
          </div>
          <Row>
            <Btn disabled={idx <= 0} onClick={() => set({ step: STEPS[idx - 1][0] })}>← Back</Btn>
            <Btn kind="primary" disabled={idx >= STEPS.length - 1} onClick={() => set({ step: STEPS[idx + 1][0] })}>Next →</Btn>
          </Row>
        </Panel>
        <Note tone="warn">This generator produces a solid starting draft, not legal advice. Laws differ by country and state — have a lawyer review agreements for large or unusual projects.</Note>
      </div>
      <div>
        <Stats>
          <Stat label="Total fee" value={m(pay.total)} tone="accent" />
          <Stat label="Deposit" value={m(pay.deposit)} sub={`${s.depositPct}% up front`} />
          <Stat label="Balance" value={m(pay.balance)} />
          <Stat label="Checklist" value={missing.length ? `${missing.length} to fill` : 'Complete'} tone={missing.length ? 'bad' : 'good'} />
        </Stats>
        {missing.length > 0 && <Note tone="warn">Still missing: {missing.join(', ')}.</Note>}
        {error && <Note tone="err">Template error: {error}</Note>}
        <Panel
          title="Agreement preview"
          actions={
            <>
              <Btn kind="primary" onClick={() => void pdf()}>⬇ PDF</Btn>
              <Btn onClick={() => download(`${fileBase}.md`, text, 'text/markdown')}>⬇ Markdown</Btn>
              <CopyButton text={() => plain} label="Copy text" />
              <Btn onClick={() => window.print()}>🖨 Print</Btn>
            </>
          }
        >
          <style>{'@media print { body * { visibility: hidden } .fa-paper, .fa-paper * { visibility: visible } .fa-paper { position: absolute; inset: 0 0 auto 0; max-height: none !important; overflow: visible !important; box-shadow: none !important } }'}</style>
          <div className="fa-paper" style={{ background: '#fff', color: '#1e1e24', padding: '28px 32px', borderRadius: 8, boxShadow: 'var(--shadow)', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 14, lineHeight: 1.55, maxHeight: 720, overflow: 'auto' }}>
            <Md text={text} />
          </div>
        </Panel>
      </div>
    </Split>
  )
}
