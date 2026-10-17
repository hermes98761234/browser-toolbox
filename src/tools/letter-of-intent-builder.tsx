import { Area, Btn, Check, CopyButton, download, Note, Num, Panel, Row, Select, Split, Txt, uid, useToolState } from '../kit'
import { winAnsi, wrap } from './lib/freelance-agreement-builder'
import { compose, DEALS, letterText, type Clauses, type Deal, type LoiInput, type Party, type Term } from './lib/letter-of-intent-builder'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const inDays = (n: number) => iso(new Date(Date.now() + n * 86400000))
const preset = (d: Deal): Term[] => DEALS[d].terms.map(([label, text]) => ({ id: uid(), label, text }))

const DEF: LoiInput & { accent: string } = {
  deal: 'acquisition',
  date: iso(new Date()),
  subject: DEALS.acquisition.subject,
  from: { company: 'Harbor Peak Capital LLC', name: 'Morgan Ellis', title: 'Managing Partner', address: '500 Grand Avenue, Suite 1200\nChicago, IL 60611', email: 'm.ellis@harborpeak.example' },
  to: { company: 'Northwind Analytics, Inc.', name: 'Dana Whitfield', title: 'Chief Executive Officer', address: '42 Innovation Way\nAustin, TX 78701', email: '' },
  terms: preset('acquisition'),
  clauses: { nonBinding: true, dd: true, conditions: true, exclusivity: true, confidentiality: true, expenses: true, law: true, termination: false, noPublicity: true },
  ddDays: 45,
  exclusivityDays: 60,
  expiry: inDays(14),
  law: 'the State of Delaware',
  conditions: 'satisfactory completion of due diligence\nnegotiation and execution of a definitive purchase agreement\napproval of Buyer\'s investment committee\nno material adverse change in the Company\'s business',
  closing: inDays(105),
  accent: '#1e3a8a',
}

const CLAUSES: [keyof Clauses, string, boolean][] = [
  ['dd', 'Due diligence access', false],
  ['conditions', 'Conditions to closing', false],
  ['exclusivity', 'Exclusivity / no-shop', true],
  ['confidentiality', 'Confidentiality', true],
  ['noPublicity', 'No announcements', true],
  ['expenses', 'Each party pays own costs', true],
  ['termination', 'Termination of the letter', true],
  ['law', 'Governing law', true],
  ['nonBinding', 'Non-binding statement (recommended)', true],
]

function PartyForm({ p, onChange, label }: { p: Party; onChange: (p: Partial<Party>) => void; label: string }) {
  return (
    <>
      <Row>
        <Txt label={`${label} company`} value={p.company} onChange={(company) => onChange({ company })} />
        <Txt label="Signatory" value={p.name} onChange={(name) => onChange({ name })} />
      </Row>
      <Row>
        <Txt label="Title" value={p.title} onChange={(title) => onChange({ title })} />
        <Txt label="Email" value={p.email} onChange={(email) => onChange({ email })} />
      </Row>
      <Area label="Address" value={p.address} onChange={(address) => onChange({ address })} rows={2} />
    </>
  )
}

export default function LetterOfIntentBuilder() {
  const [s, set, reset] = useToolState('letter-of-intent-builder', DEF)
  const secs = compose(s)
  const text = letterText(s)
  const fileBase = `loi-${(s.to.company || 'draft').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
  const editTerm = (id: string, p: Partial<Term>) => set({ terms: s.terms.map((t) => (t.id === id ? { ...t, ...p } : t)) })
  const moveTerm = (k: number, d: number) => {
    const t = [...s.terms]
    const j = k + d
    if (j < 0 || j >= t.length) return
    ;[t[k], t[j]] = [t[j], t[k]]
    set({ terms: t })
  }
  const missing = [!s.from.company && 'your company', !s.to.company && 'recipient company', !s.to.name && 'recipient name', !s.terms.length && 'at least one key term'].filter(Boolean)
  const expired = s.expiry && s.expiry < s.date

  const pdf = async () => {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    doc.setTitle(`Letter of Intent — ${s.subject}`)
    doc.setAuthor(s.from.company)
    const reg = await doc.embedFont(StandardFonts.TimesRoman)
    const bold = await doc.embedFont(StandardFonts.TimesRomanBold)
    const sans = await doc.embedFont(StandardFonts.HelveticaBold)
    const sansR = await doc.embedFont(StandardFonts.Helvetica)
    const W = 612, H = 792, M = 66
    const hex = parseInt(s.accent.slice(1), 16)
    const accent = rgb(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255)
    const ink = rgb(0.1, 0.1, 0.12), grey = rgb(0.42, 0.42, 0.47)
    const pages = [doc.addPage([W, H])]
    let page = pages[0]
    // letterhead
    page.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: accent })
    page.drawText(winAnsi(s.from.company || 'Your Company'), { x: M, y: H - 58, size: 17, font: sans, color: accent })
    const contact = [s.from.address.replace(/\n/g, '  ·  '), s.from.email].filter(Boolean).join('  ·  ')
    page.drawText(winAnsi(contact), { x: M, y: H - 74, size: 8.5, font: sansR, color: grey, maxWidth: W - 2 * M })
    page.drawLine({ start: { x: M, y: H - 84 }, end: { x: W - M, y: H - 84 }, thickness: 0.8, color: accent })
    let y = H - 112
    const ensure = (h: number) => {
      if (y - h < M + 10) {
        page = doc.addPage([W, H])
        pages.push(page)
        page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: accent })
        y = H - M
      }
    }
    const para = (t: string, f = reg, size = 11, indent = 0, gap = 6) => {
      for (const l of wrap(winAnsi(t), W - 2 * M - indent, (x) => f.widthOfTextAtSize(x, size))) {
        ensure(size * 1.4)
        page.drawText(l, { x: M + indent, y, size, font: f, color: ink })
        y -= size * 1.4
      }
      y -= gap
    }
    para(s.date, reg, 11, 0, 10)
    for (const l of [s.to.name, s.to.title, s.to.company, ...s.to.address.split('\n')].filter((x) => x && x.trim())) para(l, reg, 11, 0, 0)
    y -= 12
    para(`Re: Letter of Intent — ${s.subject}`, bold, 11.5, 0, 10)
    para(`Dear ${s.to.name || 'Sir or Madam'},`)
    para(DEALS[s.deal].intro(s), reg, 11, 0, 10)
    secs.forEach((sec, k) => {
      ensure(40)
      const head = `${k + 1}.  ${sec.title}${sec.binding ? ' (binding)' : ''}`
      para(head, bold, 11, 0, 2)
      para(sec.text, reg, 11, 18, 8)
    })
    para(s.expiry ? `This offer expires if not countersigned by ${s.expiry}. If the above reflects your understanding, please sign and return a copy of this Letter.` : 'If the above reflects your understanding, please sign and return a copy of this Letter.', reg, 11, 0, 14)
    ensure(190)
    para('Sincerely,', reg, 11, 0, 4)
    const sig = (p: Party, x: number, top: number, head: string) => {
      page.drawText(winAnsi(head), { x, y: top, size: 9, font: sans, color: grey })
      page.drawText(winAnsi(p.company), { x, y: top - 16, size: 11, font: bold, color: ink })
      page.drawLine({ start: { x, y: top - 56 }, end: { x: x + 210, y: top - 56 }, thickness: 0.7, color: ink })
      page.drawText(winAnsi(`By: ${p.name}`), { x, y: top - 70, size: 10, font: reg, color: ink })
      page.drawText(winAnsi(`Title: ${p.title}`), { x, y: top - 84, size: 10, font: reg, color: ink })
      page.drawText('Date: ____________', { x, y: top - 98, size: 10, font: reg, color: ink })
    }
    sig(s.from, M, y - 6, 'FOR THE SENDER')
    sig(s.to, M + 250, y - 6, 'ACKNOWLEDGED AND AGREED')
    pages.forEach((p, i) => p.drawText(`Letter of Intent · ${winAnsi(s.subject).slice(0, 60)} · Page ${i + 1} of ${pages.length}`, { x: M, y: 34, size: 8, font: sansR, color: grey }))
    download(`${fileBase}.pdf`, new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' }), 'application/pdf')
  }

  return (
    <Split>
      <div>
        <Panel title="Deal" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select
            label="Deal type"
            value={s.deal}
            onChange={(deal) => set({ deal, subject: DEALS[deal].subject, terms: preset(deal) })}
            options={Object.entries(DEALS).map(([k, v]) => [k as Deal, v.label] as const)}
          />
          <Txt label="Subject line" value={s.subject} onChange={(subject) => set({ subject })} />
          <Row>
            <Txt label="Letter date" type="date" value={s.date} onChange={(date) => set({ date })} />
            <Txt label="Offer expires" type="date" value={s.expiry} onChange={(expiry) => set({ expiry })} />
          </Row>
          <Note>Changing the deal type loads that type's example terms — edit them below.</Note>
        </Panel>
        <Panel title="From (your side)">
          <PartyForm label="Your" p={s.from} onChange={(p) => set({ from: { ...s.from, ...p } })} />
          <label className="k-field">
            <span className="k-label">Letterhead colour</span>
            <input type="color" value={s.accent} onChange={(e) => set({ accent: e.target.value })} style={{ width: 64, height: 34 }} />
          </label>
        </Panel>
        <Panel title="To (recipient)">
          <PartyForm label="Recipient" p={s.to} onChange={(p) => set({ to: { ...s.to, ...p } })} />
        </Panel>
        <Panel title="Key terms (non-binding)" actions={<Btn onClick={() => set({ terms: [...s.terms, { id: uid(), label: 'New term', text: '' }] })}>+ Term</Btn>}>
          {s.terms.map((t, k) => (
            <div key={t.id} style={{ borderLeft: '3px solid var(--line)', paddingLeft: 10, marginBottom: 10 }}>
              <Row wrap={false}>
                <Txt label={`${k + 1}. Heading`} value={t.label} onChange={(label) => editTerm(t.id, { label })} />
                <div style={{ display: 'flex', gap: 2, alignSelf: 'end' }}>
                  <Btn kind="ghost" title="Move up" disabled={k === 0} onClick={() => moveTerm(k, -1)}>↑</Btn>
                  <Btn kind="ghost" title="Move down" disabled={k === s.terms.length - 1} onClick={() => moveTerm(k, 1)}>↓</Btn>
                  <Btn kind="ghost" title="Remove" onClick={() => set({ terms: s.terms.filter((x) => x.id !== t.id) })}>✕</Btn>
                </div>
              </Row>
              <Area value={t.text} onChange={(text) => editTerm(t.id, { text })} rows={3} />
            </div>
          ))}
        </Panel>
        <Panel title="Standard provisions">
          {CLAUSES.map(([k, l, binding]) => (
            <Row key={k} wrap={false}>
              <Check label={l} value={s.clauses[k]} onChange={(v) => set({ clauses: { ...s.clauses, [k]: v } })} />
              <span className="badge" style={{ marginLeft: 'auto', fontSize: 11, color: binding ? 'var(--warn)' : 'var(--muted)' }}>{binding ? 'binding' : 'non-binding'}</span>
            </Row>
          ))}
          <Row>
            {s.clauses.dd && <Num label="Due diligence period" value={s.ddDays} onChange={(ddDays) => set({ ddDays: Math.max(1, Math.round(ddDays)) })} unit="days" min={1} />}
            {s.clauses.exclusivity && <Num label="Exclusivity period" value={s.exclusivityDays} onChange={(exclusivityDays) => set({ exclusivityDays: Math.max(1, Math.round(exclusivityDays)) })} unit="days" min={1} />}
          </Row>
          <Row>
            <Txt label="Target closing date" type="date" value={s.closing} onChange={(closing) => set({ closing })} />
            {s.clauses.law && <Txt label="Governing law" value={s.law} onChange={(law) => set({ law })} placeholder="the State of New York" />}
          </Row>
          {s.clauses.conditions && <Area label="Conditions (one per line)" value={s.conditions} onChange={(conditions) => set({ conditions })} rows={4} />}
        </Panel>
      </div>
      <div>
        <Panel
          title="Letter preview"
          actions={
            <>
              <CopyButton text={text} label="Copy text" />
              <Btn onClick={() => download(`${fileBase}.txt`, text)}>⬇ .txt</Btn>
              <Btn kind="primary" onClick={() => void pdf()}>⬇ PDF</Btn>
            </>
          }
        >
          {missing.length > 0 && <Note tone="warn">Still missing: {missing.join(', ')}.</Note>}
          {expired && <Note tone="err">The expiry date is before the letter date.</Note>}
          <article style={{ background: '#fff', color: '#1a1a1f', borderRadius: 6, boxShadow: '0 2px 12px rgb(0 0 0 / 0.15)', padding: '0 0 28px', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 14, lineHeight: 1.55, overflow: 'hidden' }}>
            <div style={{ height: 8, background: s.accent }} />
            <div style={{ padding: '22px 34px 0' }}>
              <div style={{ fontFamily: 'system-ui, sans-serif', fontWeight: 800, fontSize: 21, color: s.accent }}>{s.from.company || 'Your Company'}</div>
              <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 11.5, color: '#6b6b76', borderBottom: `1px solid ${s.accent}`, paddingBottom: 8 }}>{[s.from.address.replace(/\n/g, ' · '), s.from.email].filter(Boolean).join(' · ')}</div>
              <p style={{ marginTop: 18 }}>{s.date}</p>
              <p style={{ whiteSpace: 'pre-line' }}>{[s.to.name, s.to.title, s.to.company, s.to.address].filter(Boolean).join('\n')}</p>
              <p><b>Re: Letter of Intent — {s.subject}</b></p>
              <p>Dear {s.to.name || 'Sir or Madam'},</p>
              <p>{DEALS[s.deal].intro(s)}</p>
              <ol style={{ paddingLeft: 22 }}>
                {secs.map((sec) => (
                  <li key={sec.title} style={{ marginBottom: 8 }}>
                    <b>{sec.title}.</b>{' '}
                    {sec.binding && <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: 10, background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 5px', marginRight: 4 }}>binding</span>}
                    {sec.text}
                  </li>
                ))}
              </ol>
              <p>{s.expiry ? `This offer expires if not countersigned by ${s.expiry}. ` : ''}If the above reflects your understanding, please sign and return a copy of this Letter.</p>
              <p>Sincerely,</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24, marginTop: 18 }}>
                {[['For the sender', s.from], ['Acknowledged and agreed', s.to]].map(([h, p]) => {
                  const q = p as Party
                  return (
                    <div key={h as string} style={{ fontSize: 13 }}>
                      <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: '#6b6b76' }}>{h as string}</div>
                      <b>{q.company}</b>
                      <div style={{ borderBottom: '1px solid #1a1a1f', height: 38 }} />
                      <div>By: {q.name}</div>
                      <div>Title: {q.title}</div>
                      <div>Date: ____________</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </article>
        </Panel>
        <Note>
          An LOI frames negotiations; only the provisions marked <b>binding</b> create obligations (typically exclusivity, confidentiality, costs and governing law). This builder is a drafting aid, not legal advice — have counsel review before sending.
        </Note>
      </div>
    </Split>
  )
}
