import { useState } from 'react'
import { Btn, CopyButton, download, money, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, today, Txt, uid, useToolState } from '../kit'
import { addDays, compose, mailto, schedule, STAGES, type Invoice, type Stage, type Tone } from './lib/payment-reminder-writer'

const T0 = today()
const DEF = {
  client: 'Brightleaf Studio Ltd', contact: 'Priya', email: 'accounts@brightleaf.example', sender: 'Alex Morgan', company: 'Morgan Web Services',
  payment: 'https://pay.example.com/inv/1042 (or bank transfer: IBAN XX00 1234 5678 9012, ref INV-1042)', currency: '$',
  asOf: '', graceDays: 7, feePct: 1.5, feeFlat: 0, tone: 'neutral' as Tone, stage: 'auto' as Stage | 'auto',
  invoices: [{ id: 'i1', number: '1042', amount: 2450, issued: addDays(T0, -44), due: addDays(T0, -14) }] as Invoice[],
}

export default function PaymentReminderWriter() {
  const [s, set, reset] = useToolState('payment-reminder-writer', DEF)
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null)
  const asOf = s.asOf || today()
  const r = compose(s.invoices, { ...s, today: asOf }, s.stage === 'auto' ? undefined : s.stage)
  const subject = draft?.subject ?? r.subject
  const body = draft?.body ?? r.body
  const oldest = s.invoices.filter((i) => i.due).sort((a, b) => a.due.localeCompare(b.due))[0]
  const plan = oldest ? schedule(oldest.due, asOf) : []
  const m = (x: number) => money(x, s.currency)
  const editInv = (id: string, p: Partial<Invoice>) => { setDraft(null); set({ invoices: s.invoices.map((i) => (i.id === id ? { ...i, ...p } : i)) }) }
  const upd = (p: Partial<typeof DEF>) => { setDraft(null); set(p) }
  const eml = () => `To: ${s.email}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body.replace(/\n/g, '\r\n')}`

  return (
    <Split>
      <div>
        <Panel title="Invoices" actions={<Btn onClick={() => upd({ invoices: [...s.invoices, { id: uid(), number: String(1043 + s.invoices.length - 1), amount: 500, issued: addDays(asOf, -30), due: addDays(asOf, -5) }] })}>+ Invoice</Btn>}>
          {s.invoices.map((i) => (
            <div key={i.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(70px,1fr) minmax(90px,1fr) minmax(120px,1.3fr) auto', gap: 6, alignItems: 'end', marginBottom: 6 }}>
              <Txt label="Invoice #" value={i.number} onChange={(number) => editInv(i.id, { number })} />
              <Num label={`Amount (${s.currency.trim()})`} value={i.amount} min={0} onChange={(amount) => editInv(i.id, { amount })} />
              <Txt label="Due date" type="date" value={i.due} onChange={(due) => editInv(i.id, { due })} />
              <Btn kind="ghost" disabled={s.invoices.length < 2} onClick={() => upd({ invoices: s.invoices.filter((x) => x.id !== i.id) })} title="Remove">✕</Btn>
            </div>
          ))}
          <Row>
            <Txt label="As of (today)" type="date" value={asOf} onChange={(v) => upd({ asOf: v === today() ? '' : v })} />
            <Select label="Currency" value={s.currency} onChange={(currency) => upd({ currency })} options={['$', '€', '£', '₴', 'zł', 'CHF ', 'A$', 'C$']} />
          </Row>
        </Panel>
        <Panel title="People">
          <Row>
            <Txt label="Client company" value={s.client} onChange={(client) => upd({ client })} />
            <Txt label="Contact first name" value={s.contact} onChange={(contact) => upd({ contact })} />
          </Row>
          <Txt label="Client email" type="email" value={s.email} onChange={(email) => upd({ email })} />
          <Row>
            <Txt label="Your name" value={s.sender} onChange={(sender) => upd({ sender })} />
            <Txt label="Your business" value={s.company} onChange={(company) => upd({ company })} />
          </Row>
          <Txt label="How to pay (link or bank details)" value={s.payment} onChange={(payment) => upd({ payment })} />
        </Panel>
        <Panel title="Terms">
          <Row>
            <Num label="Pay-by deadline" unit="days" value={s.graceDays} min={1} max={60} onChange={(graceDays) => upd({ graceDays })} />
            <Num label="Late interest" unit="% / month" value={s.feePct} min={0} max={10} step={0.1} onChange={(feePct) => upd({ feePct })} />
            <Num label="Flat late fee" unit={s.currency.trim()} value={s.feeFlat} min={0} onChange={(feeFlat) => upd({ feeFlat })} />
          </Row>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>Late charges are mentioned from the firm stage onwards and only if your contract or invoice terms allow them.</p>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Outstanding" value={m(r.principal)} sub={r.fees ? `+ ${m(r.fees)} late charges` : `${s.invoices.length} invoice(s)`} />
          <Stat label="Days overdue" value={Math.max(0, r.days)} sub={r.days <= 0 ? `due in ${-r.days} days` : 'oldest invoice'} tone={r.days > 30 ? 'bad' : r.days > 0 ? 'accent' : 'good'} />
          <Stat label="Stage" value={<span style={{ color: STAGES[r.stage].color }}>{STAGES[r.stage].name}</span>} sub={STAGES[r.stage].range} />
        </Stats>
        <Panel title="Escalation">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
            {plan.map((p) => (
              <div key={p.stage} style={{ borderTop: `4px solid ${STAGES[p.stage].color}`, padding: '6px 4px', opacity: p.stage === r.stage ? 1 : p.past ? 0.55 : 0.85, background: p.stage === r.stage ? 'var(--panel2)' : undefined, borderRadius: 4 }}>
                <b style={{ fontSize: 12 }}>{STAGES[p.stage].name}</b>
                <div className="muted" style={{ fontSize: 11 }}>{p.date}</div>
              </div>
            ))}
          </div>
          <Row>
            <Seg value={s.stage} onChange={(stage) => upd({ stage })} options={[['auto', 'Auto'], ...(Object.keys(STAGES) as Stage[]).map((k) => [k, STAGES[k].name.split(' ')[0]] as [Stage, string])]} />
          </Row>
          <Row>
            <Seg value={s.tone} onChange={(tone) => upd({ tone })} options={[['warm', '😊 Warm'], ['neutral', '🙂 Neutral'], ['formal', '🎩 Formal']]} />
          </Row>
        </Panel>
        <Panel
          title="Email"
          actions={
            <>
              <a className="k-btn primary" href={mailto(s.email, subject, body)}>✉ Open in mail app</a>
              <CopyButton text={`Subject: ${subject}\n\n${body}`} label="Copy all" />
              <Btn kind="ghost" onClick={() => download(`reminder-${s.invoices[0]?.number ?? 'invoice'}.eml`, eml(), 'message/rfc822')}>⬇ .eml</Btn>
            </>
          }
        >
          <label className="k-field">
            <span className="k-label">To</span>
            <input className="k-text" value={s.email} readOnly />
          </label>
          <label className="k-field">
            <span className="k-label">Subject <CopyButton text={subject} label="Copy" /></span>
            <input className="k-text" value={subject} onChange={(e) => setDraft({ subject: e.target.value, body })} />
          </label>
          <textarea className="k-area" rows={16} value={body} onChange={(e) => setDraft({ subject, body: e.target.value })} aria-label="Email body" />
          {draft && <Row><Note tone="info">You edited this draft. Changing any field regenerates it.</Note><Btn kind="ghost" onClick={() => setDraft(null)}>Regenerate</Btn></Row>}
          <Btn kind="ghost" onClick={() => { setDraft(null); reset() }}>Reset example</Btn>
        </Panel>
        <Note>Tips: send the first nudge within a few days of the due date, keep each message short with one clear call to action, and always include the invoice number, amount and a direct way to pay. Check local rules before charging statutory late-payment interest.</Note>
      </div>
    </Split>
  )
}
