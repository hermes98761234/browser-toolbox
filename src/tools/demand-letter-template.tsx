import { useState } from 'react'
import { Area, Btn, Check, CopyButton, download, JsonButtons, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { addDays, amounts, body, CONSEQUENCES, longDate, money, type Invoice, type Letter, type Tone } from './lib/demand-letter-template'
import { sanitize } from './lib/pdf-watermarker'

interface State extends Letter { paper: 'letter' | 'a4' }
const DEF: State = {
  paper: 'letter', tone: 'firm', date: '2026-10-18', deadlineDays: 14, currency: '$',
  creditor: 'Brightfield Design Studio LLC', creditorAddress: '210 Orchard Lane, Suite 4\nMillbrook, ST 00000', creditorContact: 'accounts@brightfield.example · (555) 010-2290', signer: 'Ines Marlow', signerTitle: 'Owner',
  debtor: 'Copperline Retail Ltd.', debtorAddress: '88 Harbor Terrace\nEastvale, ST 00000', attention: 'Accounts Payable',
  invoices: [
    { id: 'a', ref: 'BDS-1042', issued: '2026-06-20', due: '2026-07-20', amount: 2400, paid: 0 },
    { id: 'b', ref: 'BDS-1057', issued: '2026-08-04', due: '2026-09-03', amount: 1150, paid: 400 },
  ],
  interestRate: 0, lateFee: 0, basis: 'as set out in our agreement dated March 2, 2026',
  payment: 'bank transfer to account 00-0000-0000 (reference: invoice number), or by check payable to Brightfield Design Studio LLC at the address above.',
  consequences: ['collections', 'court', 'suspend'], delivery: 'By email and first-class mail', extra: '',
}
const TONES: [Tone, string][] = [['friendly', '1 · Friendly reminder'], ['firm', '2 · Firm demand'], ['final', '3 · Final demand']]

function lines(addr: string) { return addr.split('\n').map((x) => x.trim()).filter(Boolean) }

function plainText(s: State): string {
  const b = body(s)
  const a = amounts(s)
  const m = (x: number) => money(x, s.currency)
  const table = a.rows.map((r) => `  ${r.inv.ref || '—'}  due ${longDate(r.inv.due)}  ${r.overdue} days overdue  balance ${m(r.balance)}${r.interest ? `  interest ${m(r.interest)}` : ''}`).join('\n')
  return [s.creditor, ...lines(s.creditorAddress), s.creditorContact, '', longDate(s.date), s.delivery, '', s.debtor, ...lines(s.debtorAddress), s.attention ? `Attention: ${s.attention}` : '', '',
    `Re: ${b.subject}`, '', `Dear ${s.attention || s.debtor},`, '', ...b.paras.slice(0, 1), '', table, `  Total due: ${m(a.total)}`, '', ...b.paras.slice(1).flatMap((p) => [p, '']),
    s.tone === 'friendly' ? 'Kind regards,' : 'Sincerely,', '', '', s.signer, s.signerTitle, s.creditor].filter((x, i, arr) => !(x === '' && arr[i - 1] === '')).join('\n')
}

async function makePdf(s: State): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const reg = await doc.embedFont(StandardFonts.TimesRoman), bold = await doc.embedFont(StandardFonts.TimesRomanBold)
  const [W, H] = s.paper === 'a4' ? [595.28, 841.89] : [612, 792]
  const M = 72, size = 11, lh = 14.5
  const T = (t: string) => sanitize(t).text
  let page = doc.addPage([W, H])
  let y = H - M
  const need = (h: number) => { if (y - h < M) { page = doc.addPage([W, H]); y = H - M } }
  const text = (t: string, o: { b?: boolean; sz?: number; x?: number; right?: boolean; col?: number } = {}) => {
    const f = o.b ? bold : reg, sz = o.sz ?? size
    const tt = T(t)
    const x = o.right ? W - M - f.widthOfTextAtSize(tt, sz) : o.x ?? M
    page.drawText(tt, { x, y, size: sz, font: f, color: rgb(o.col ?? 0.08, o.col ?? 0.08, o.col ?? 0.1) })
  }
  const para = (t: string, b = false) => {
    const words = T(t).split(/\s+/).filter(Boolean)
    let line = ''
    const f = b ? bold : reg
    for (const w of words) {
      const tryL = line ? line + ' ' + w : w
      if (f.widthOfTextAtSize(tryL, size) > W - 2 * M) { need(lh); text(line, { b }); y -= lh; line = w } else line = tryL
    }
    if (line) { need(lh); text(line, { b }); y -= lh }
    y -= 6
  }
  // Letterhead
  text(s.creditor, { b: true, sz: 15 })
  y -= 16
  for (const l of [...lines(s.creditorAddress), s.creditorContact].filter(Boolean)) { text(l, { sz: 9.5, col: 0.35 }); y -= 12 }
  page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.8, color: rgb(0.6, 0.6, 0.65) })
  y -= 22
  text(longDate(s.date))
  y -= lh
  if (s.delivery) { text(s.delivery, { sz: 9.5, col: 0.35 }); y -= lh }
  y -= 8
  for (const l of [s.debtor, ...lines(s.debtorAddress)]) { text(l); y -= lh }
  if (s.attention) { text(`Attention: ${s.attention}`); y -= lh }
  y -= 10
  const b = body(s)
  para(`Re: ${b.subject}`, true)
  para(`Dear ${s.attention || s.debtor},`)
  para(b.paras[0])
  // Invoice table
  const a = amounts(s)
  const m = (x: number) => money(x, s.currency)
  const cols = [M, M + 100, M + 200, M + 290, M + 380]
  need(lh * (a.rows.length + 3))
  ;['Invoice', 'Due date', 'Days overdue', 'Balance', s.interestRate ? 'Interest' : ''].forEach((h, i) => page.drawText(h, { x: cols[i], y, size: 9.5, font: bold }))
  y -= 4
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.72) })
  y -= 12
  for (const r of a.rows) {
    ;[r.inv.ref, longDate(r.inv.due), String(r.overdue), m(r.balance), s.interestRate ? m(r.interest) : ''].forEach((v, i) => page.drawText(T(v), { x: cols[i], y, size: 9.5, font: reg }))
    y -= 13
  }
  if (a.fees) { page.drawText('Late fees', { x: cols[0], y, size: 9.5, font: reg }); page.drawText(T(m(a.fees)), { x: cols[3], y, size: 9.5, font: reg }); y -= 13 }
  page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.72) })
  page.drawText('Total due', { x: cols[0], y: y - 2, size: 10.5, font: bold })
  page.drawText(T(m(a.total)), { x: cols[3], y: y - 2, size: 10.5, font: bold })
  y -= 24
  for (const p of b.paras.slice(1)) para(p)
  need(80)
  y -= 4
  text(s.tone === 'friendly' ? 'Kind regards,' : 'Sincerely,')
  y -= 44
  text(s.signer, { b: true }); y -= lh
  if (s.signerTitle) { text(s.signerTitle); y -= lh }
  text(s.creditor)
  return doc.save()
}

export default function DemandLetterTemplate() {
  const [s, set, reset] = useToolState('demand-letter-template', DEF)
  const [err, setErr] = useState('')
  const a = amounts(s)
  const b = body(s)
  const m = (x: number) => money(x, s.currency)
  const editI = (id: string, p: Partial<Invoice>) => set({ invoices: s.invoices.map((i) => (i.id === id ? { ...i, ...p } : i)) })
  const toggle = (k: string) => set({ consequences: s.consequences.includes(k) ? s.consequences.filter((x) => x !== k) : [...s.consequences, k] })
  const missing = [!s.creditor && 'your name', !s.debtor && 'debtor name', !s.invoices.length && 'at least one invoice'].filter(Boolean)
  const pdf = async () => {
    setErr('')
    try {
      const bytes = await makePdf(s)
      download(`demand-letter-${(s.debtor || 'debtor').replace(/[^\w]+/g, '-').toLowerCase()}.pdf`, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }))
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <Split>
      <div>
        <Note tone="warn"><b>Informational template, not legal advice.</b> Debt-collection rules differ by country and state, and consumer debts often have extra protections. Only mention steps you genuinely intend and are legally allowed to take, and check with a lawyer or advice service for significant sums.</Note>
        <Panel title="Tone">
          <Seg value={s.tone} onChange={(tone) => set({ tone })} options={TONES} />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>{s.tone === 'friendly' ? 'A polite first reminder: assumes an oversight, offers help.' : s.tone === 'firm' ? 'A clear demand with a deadline and the next steps you may take.' : 'A last letter before action, stating exactly what happens after the deadline.'}</p>
        </Panel>
        <Panel title="From (creditor)">
          <Row>
            <Txt label="Business or name" value={s.creditor} onChange={(creditor) => set({ creditor })} />
            <Txt label="Email · phone" value={s.creditorContact} onChange={(creditorContact) => set({ creditorContact })} />
          </Row>
          <Area label="Address" value={s.creditorAddress} onChange={(creditorAddress) => set({ creditorAddress })} rows={2} />
          <Row>
            <Txt label="Signed by" value={s.signer} onChange={(signer) => set({ signer })} />
            <Txt label="Title" value={s.signerTitle} onChange={(signerTitle) => set({ signerTitle })} />
          </Row>
        </Panel>
        <Panel title="To (debtor)">
          <Row>
            <Txt label="Name" value={s.debtor} onChange={(debtor) => set({ debtor })} />
            <Txt label="Attention (optional)" value={s.attention} onChange={(attention) => set({ attention })} />
          </Row>
          <Area label="Address" value={s.debtorAddress} onChange={(debtorAddress) => set({ debtorAddress })} rows={2} />
        </Panel>
        <Panel title="What is owed" actions={<Btn onClick={() => set({ invoices: [...s.invoices, { id: uid(), ref: '', issued: s.date, due: s.date, amount: 0, paid: 0 }] })}>+ Invoice</Btn>}>
          <Table head={['Ref', 'Due', 'Amount', 'Paid', '']} rows={s.invoices.map((i) => [
            <input key="r" value={i.ref} onChange={(e) => editI(i.id, { ref: e.target.value })} aria-label="Invoice ref" style={{ width: 90 }} />,
            <input key="d" type="date" value={i.due} onChange={(e) => editI(i.id, { due: e.target.value })} aria-label="Due date" />,
            <input key="a" type="number" min={0} value={i.amount} onChange={(e) => editI(i.id, { amount: Math.max(0, Number(e.target.value) || 0) })} aria-label="Amount" style={{ width: 86 }} />,
            <input key="p" type="number" min={0} value={i.paid} onChange={(e) => editI(i.id, { paid: Math.max(0, Number(e.target.value) || 0) })} aria-label="Paid" style={{ width: 76 }} />,
            <Btn key="x" kind="ghost" onClick={() => set({ invoices: s.invoices.filter((x) => x.id !== i.id) })} title="Remove">✕</Btn>,
          ])} />
          <Row>
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'CHF ', 'zł ', '']} />
            <Num label="Interest (simple)" value={s.interestRate} onChange={(interestRate) => set({ interestRate })} unit="% / yr" min={0} max={100} />
            <Num label="Late fees" value={s.lateFee} onChange={(lateFee) => set({ lateFee })} min={0} />
          </Row>
          {(s.interestRate > 0 || s.lateFee > 0) && <Txt label="Basis for interest / fees" value={s.basis} onChange={(basis) => set({ basis })} hint="Contract clause or statute. Only charge what you're entitled to." />}
        </Panel>
        <Panel title="Deadline, payment & next steps">
          <Row>
            <Txt label="Letter date" type="date" value={s.date} onChange={(date) => set({ date })} />
            <Num label="Days to pay" value={s.deadlineDays} onChange={(deadlineDays) => set({ deadlineDays: Math.max(1, Math.round(deadlineDays)) })} min={1} step={1} hint={`Deadline: ${longDate(addDays(s.date, s.deadlineDays))}`} />
          </Row>
          <Area label="How to pay" value={s.payment} onChange={(payment) => set({ payment })} rows={2} />
          {s.tone !== 'friendly' && (
            <>
              <span className="k-label">Steps if unpaid</span>
              {CONSEQUENCES.map(([k, t]) => <div key={k}><Check label={t[0].toUpperCase() + t.slice(1)} value={s.consequences.includes(k)} onChange={() => toggle(k)} /></div>)}
            </>
          )}
          <Txt label="Delivery line" value={s.delivery} onChange={(delivery) => set({ delivery })} hint="e.g. By certified mail, return receipt requested" />
          <Area label="Extra paragraph (optional)" value={s.extra} onChange={(extra) => set({ extra })} rows={2} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Outstanding" value={m(a.principal)} />
          <Stat label="Interest + fees" value={m(a.interest + a.fees)} />
          <Stat label="Total demanded" value={m(a.total)} tone="accent" />
          <Stat label="Pay by" value={longDate(addDays(s.date, s.deadlineDays))} />
        </Stats>
        <Panel title="Letter" actions={<>
          <Select label="" value={s.paper} onChange={(paper) => set({ paper })} options={[['letter', 'US Letter'], ['a4', 'A4']]} />
          <Btn kind="primary" disabled={missing.length > 0} onClick={() => void pdf()}>⬇ PDF</Btn>
          <CopyButton text={() => plainText(s)} label="Copy text" />
        </>}>
          {missing.length > 0 && <Note tone="err">Add {missing.join(', ')}.</Note>}
          {err && <Note tone="err">{err}</Note>}
          <article style={{ background: '#fff', color: '#16161a', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 14.5, lineHeight: 1.55, padding: 'clamp(18px, 5vw, 44px)', borderRadius: 8, boxShadow: '0 2px 14px rgba(0,0,0,.14)' }}>
            <div style={{ borderBottom: '1px solid #aaa', paddingBottom: 8, marginBottom: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 19 }}>{s.creditor}</div>
              <div style={{ fontSize: 12.5, color: '#555', whiteSpace: 'pre-line' }}>{[s.creditorAddress, s.creditorContact].filter(Boolean).join('\n')}</div>
            </div>
            <p style={{ margin: 0 }}>{longDate(s.date)}</p>
            {s.delivery && <p style={{ margin: 0, fontSize: 12.5, color: '#555' }}>{s.delivery}</p>}
            <p style={{ whiteSpace: 'pre-line', margin: '14px 0' }}>{[s.debtor, s.debtorAddress, s.attention && `Attention: ${s.attention}`].filter(Boolean).join('\n')}</p>
            <p style={{ fontWeight: 700 }}>Re: {b.subject}</p>
            <p>Dear {s.attention || s.debtor},</p>
            <p>{b.paras[0]}</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, margin: '8px 0 14px' }}>
              <thead><tr style={{ borderBottom: '1px solid #bbb', textAlign: 'left' }}><th>Invoice</th><th>Due</th><th>Overdue</th><th style={{ textAlign: 'right' }}>Balance</th>{s.interestRate > 0 && <th style={{ textAlign: 'right' }}>Interest</th>}</tr></thead>
              <tbody>
                {a.rows.map((r) => <tr key={r.inv.id}><td>{r.inv.ref}</td><td>{longDate(r.inv.due)}</td><td>{r.overdue} days</td><td style={{ textAlign: 'right' }}>{m(r.balance)}</td>{s.interestRate > 0 && <td style={{ textAlign: 'right' }}>{m(r.interest)}</td>}</tr>)}
                {a.fees > 0 && <tr><td colSpan={3}>Late fees</td><td style={{ textAlign: 'right' }}>{m(a.fees)}</td>{s.interestRate > 0 && <td />}</tr>}
              </tbody>
              <tfoot><tr style={{ borderTop: '1px solid #bbb', fontWeight: 700 }}><td colSpan={3}>Total due</td><td colSpan={s.interestRate > 0 ? 2 : 1} style={{ textAlign: 'right' }}>{m(a.total)}</td></tr></tfoot>
            </table>
            {b.paras.slice(1).map((p, i) => <p key={i}>{p}</p>)}
            <p style={{ marginBottom: 40 }}>{s.tone === 'friendly' ? 'Kind regards,' : 'Sincerely,'}</p>
            <p style={{ margin: 0 }}><b>{s.signer}</b><br />{s.signerTitle}{s.signerTitle && <br />}{s.creditor}</p>
          </article>
          <Row>
            <JsonButtons name="demand-letter.json" data={s} onLoad={(d) => set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
        <Panel title="Before you send">
          <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
            <li>Escalate gradually: reminder → firm demand → final demand, a week or two apart.</li>
            <li>Keep copies and proof of delivery (certified mail or a tracked email).</li>
            <li>Stay factual and polite. Never threaten criminal action, public shaming or contact with employers or family.</li>
            <li>Interest and fees should come from your contract or statute; many places cap them.</li>
            <li>Small claims limits and pre-action requirements vary; look up your local court’s rules.</li>
          </ul>
        </Panel>
      </div>
    </Split>
  )
}
