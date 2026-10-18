import { Area, Bar, Btn, Check, CsvButton, download, JsonButtons, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, today, uid, useToolState } from '../kit'
import { latin, lint, summarize, TEMPLATES, wrapBy, type Answer, type Kind, type Question, type Reference } from './lib/reference-check-form'

interface Candidate { id: string; name: string; role: string; refs: Reference[] }
interface State { company: string; checker: string; template: string; questions: Question[]; candidates: Candidate[]; active: string; activeRef: string }

const RELS = ['Manager', 'Skip-level manager', 'Peer', 'Direct report', 'Client', 'Other']
const blank = (): Reference => ({ id: uid(), name: '', title: '', company: '', relationship: 'Manager', years: 1, contact: '', date: today(), consent: false, rehire: '', overall: 0, answers: {}, flags: '' })
const A = (rating: number | undefined, note: string, yes?: Answer['yes']): Answer => ({ rating, note, yes })

const DEF: State = {
  company: 'Northwind Logistics',
  checker: 'Sam Patel (Talent)',
  template: 'general',
  questions: TEMPLATES.general.questions,
  active: 'c1',
  activeRef: 'r1',
  candidates: [
    {
      id: 'c1', name: 'Dana Whitfield', role: 'Operations Manager',
      refs: [
        { id: 'r1', name: 'Grace Okafor', title: 'Head of Fulfilment', company: 'Brightline Retail', relationship: 'Manager', years: 3, contact: 'grace.o@example.com', date: '2026-10-14', consent: true, rehire: 'yes', overall: 5, flags: '',
          answers: { g1: A(undefined, 'Direct manager for 3 years at the Leeds DC.'), g2: A(undefined, 'Ran the night shift (40 staff), inbound scheduling, safety audits.'), g3: A(5, 'Error rate on her shift dropped by a third.'), g4: A(5, 'Never missed a peak-season cut-off.'), g5: A(4, 'Clear and calm; sometimes too brief in written updates.'), g6: A(5, 'People asked to transfer onto her shift.'), g7: A(undefined, 'Delegating budget work — she tends to keep it herself.'), g8: A(undefined, 'Process thinking, coaching new team leads.'), g9: A(undefined, 'Immediately.', 'yes') } },
        { id: 'r2', name: 'Luis Romero', title: 'Transport Planner', company: 'Brightline Retail', relationship: 'Peer', years: 2, contact: '+44 20 7946 0102', date: '2026-10-15', consent: true, rehire: 'yes', overall: 4, flags: '',
          answers: { g1: A(undefined, 'Worked side by side on inbound/outbound handovers.'), g2: A(undefined, 'Shift lead, later ops manager for returns.'), g3: A(4, 'Very thorough.'), g4: A(4, ''), g5: A(3, 'Good in person, emails could be clearer.'), g6: A(5, 'Covered for my team during a sickness wave without being asked.'), g7: A(undefined, 'Stakeholder updates to senior leadership.'), g8: A(undefined, 'Reliable, fair, keeps people calm.'), g9: A(undefined, '', 'yes') } },
        { ...blank(), id: 'r3', name: 'Priya Nair', title: 'Regional Director', company: 'Coastway Freight', relationship: 'Skip-level manager', years: 1, contact: 'p.nair@example.org', date: '2026-10-20', consent: true },
      ],
    },
    { id: 'c2', name: 'Morgan Ellis', role: 'Operations Manager', refs: [{ ...blank(), id: 'r4', name: 'Chris Byrne', title: 'COO', company: 'Fleetwise', relationship: 'Manager', years: 4, consent: true }] },
  ],
}

export default function ReferenceCheckForm() {
  const [s, set, reset] = useToolState('reference-check-form', DEF)
  const cand = s.candidates.find((c) => c.id === s.active) ?? s.candidates[0]
  const ref = cand?.refs.find((r) => r.id === s.activeRef) ?? cand?.refs[0]
  const sum = summarize(s.questions, cand?.refs ?? [])
  const editCand = (p: Partial<Candidate>) => set({ candidates: s.candidates.map((c) => (c.id === cand.id ? { ...c, ...p } : c)) })
  const editRef = (p: Partial<Reference>) => ref && editCand({ refs: cand.refs.map((r) => (r.id === ref.id ? { ...r, ...p } : r)) })
  const answer = (qid: string, p: Partial<Answer>) => ref && editRef({ answers: { ...ref.answers, [qid]: { ...(ref.answers[qid] ?? { note: '' }), ...p } } })
  const editQ = (id: string, p: Partial<Question>) => set({ questions: s.questions.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const moveQ = (i: number, d: number) => {
    const qs = [...s.questions]
    const j = i + d
    if (j < 0 || j >= qs.length) return
    ;[qs[i], qs[j]] = [qs[j], qs[i]]
    set({ questions: qs })
  }
  const risky = s.questions.map((x) => ({ x, issues: lint(x.text) })).filter((r) => r.issues.length)

  const exportPdf = async () => {
    if (!cand) return
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const PW = 595.28, PH = 841.89, M = 50
    let page = pdf.addPage([PW, PH])
    let y = PH - M
    const ink = rgb(0.1, 0.12, 0.16), mute = rgb(0.42, 0.45, 0.5), accent = rgb(0.31, 0.27, 0.9)
    const need = (h: number) => {
      if (y - h < M) {
        page = pdf.addPage([PW, PH])
        y = PH - M
      }
    }
    const para = (t: string, x: number, size: number, f = font, color = ink, width = PW - M - x) => {
      for (const line of wrapBy(latin(t), width, (z) => f.widthOfTextAtSize(z, size))) {
        need(size + 4)
        page.drawText(line, { x, y, size, font: f, color })
        y -= size + 4
      }
    }
    para(`Reference check summary`, M, 20, bold)
    para(`${cand.name} · ${cand.role} · ${s.company}`, M, 11, font, mute)
    para(`Prepared by ${s.checker || '—'} on ${today()} · Confidential`, M, 9, font, mute)
    y -= 8
    para(`Verdict: ${sum.verdict.label}`, M, 13, bold, sum.verdict.tone === 'bad' ? rgb(0.75, 0.15, 0.15) : sum.verdict.tone === 'good' ? rgb(0.05, 0.5, 0.3) : accent)
    para(`Average rating ${sum.ratingAvg?.toFixed(1) ?? '—'} / 5 · overall ${sum.overallAvg?.toFixed(1) ?? '—'} / 5 · would rehire: ${sum.rehire.yes} yes, ${sum.rehire.no} no, ${sum.rehire.unsure} unsure · ${sum.completed}/${cand.refs.length} calls complete`, M, 10)
    y -= 6
    para('Competencies', M, 12, bold)
    for (const c of sum.comps) {
      need(16)
      page.drawText(latin(c.comp), { x: M, y, size: 10, font, color: ink })
      page.drawRectangle({ x: M + 130, y: y - 1, width: 200, height: 9, color: rgb(0.92, 0.93, 0.96) })
      page.drawRectangle({ x: M + 130, y: y - 1, width: (200 * c.avg) / 5, height: 9, color: c.avg < 3 ? rgb(0.86, 0.3, 0.3) : accent })
      page.drawText(`${c.avg.toFixed(1)}  (n=${c.n}${c.spread >= 2 ? ', disagreement' : ''})`, { x: M + 340, y, size: 9, font, color: mute })
      y -= 15
    }
    if (sum.concerns.length) {
      y -= 4
      para('Points to follow up', M, 12, bold)
      for (const c of sum.concerns) para(`• ${c}`, M + 8, 10)
    }
    y -= 6
    para('Referees', M, 12, bold)
    for (const r of cand.refs) para(`${r.name || '(unnamed)'} — ${r.title}, ${r.company} · ${r.relationship}, ${r.years} yr · ${r.date || 'not called'} · consent ${r.consent ? 'yes' : 'NOT recorded'}${r.rehire ? ` · rehire: ${r.rehire}` : ''}${r.overall ? ` · overall ${r.overall}/5` : ''}`, M + 8, 9.5)
    for (const qq of s.questions) {
      y -= 6
      need(40)
      page.drawLine({ start: { x: M, y: y + 10 }, end: { x: PW - M, y: y + 10 }, thickness: 0.5, color: rgb(0.85, 0.86, 0.9) })
      para(`${qq.text}`, M, 10.5, bold)
      para(qq.comp, M, 8, font, mute)
      for (const r of cand.refs) {
        const a = r.answers[qq.id]
        if (!a || (!a.rating && !a.yes && !a.note.trim())) continue
        const head = `${r.name.split(' ')[0] || 'Referee'}${a.rating ? ` [${a.rating}/5]` : ''}${a.yes ? ` [${a.yes}]` : ''}: `
        para(head + (a.note || ''), M + 10, 9.5)
      }
    }
    const n = pdf.getPageCount()
    pdf.getPages().forEach((p, i) => p.drawText(`${latin(cand.name)} — reference check · page ${i + 1} of ${n}`, { x: M, y: 24, size: 8, font, color: mute }))
    const bytes = await pdf.save()
    download(`reference-check-${cand.name.toLowerCase().replace(/\W+/g, '-')}.pdf`, new Blob([bytes.slice().buffer], { type: 'application/pdf' }))
  }

  const kindBadge: Record<Kind, string> = { rating: '1–5', yesno: 'Y/N', text: 'Notes' }
  return (
    <Split wide="right">
      <div>
        <Panel title="Candidate" actions={<Btn onClick={() => { const c: Candidate = { id: uid(), name: 'New candidate', role: cand?.role ?? '', refs: [blank()] }; set({ candidates: [...s.candidates, c], active: c.id, activeRef: c.refs[0].id }) }}>+ Candidate</Btn>}>
          <Select label="Candidate" value={cand?.id ?? ''} onChange={(active) => set({ active, activeRef: s.candidates.find((c) => c.id === active)?.refs[0]?.id ?? '' })} options={s.candidates.map((c) => [c.id, `${c.name} — ${c.role}`] as [string, string])} />
          {cand && (
            <Row>
              <Txt label="Name" value={cand.name} onChange={(name) => editCand({ name })} />
              <Txt label="Role" value={cand.role} onChange={(role) => editCand({ role })} />
            </Row>
          )}
          <Row>
            <Txt label="Hiring company" value={s.company} onChange={(company) => set({ company })} />
            <Txt label="Checked by" value={s.checker} onChange={(checker) => set({ checker })} />
          </Row>
          {s.candidates.length > 1 && <Btn kind="danger" onClick={() => { const rest = s.candidates.filter((c) => c.id !== cand.id); set({ candidates: rest, active: rest[0].id, activeRef: rest[0].refs[0]?.id ?? '' }) }}>Delete candidate</Btn>}
        </Panel>
        <Panel title="Question set" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Select label="Template" value={s.template} onChange={(template) => set({ template })} options={Object.entries(TEMPLATES).map(([k, v]) => [k, v.label] as [string, string])} />
            <Btn onClick={() => set({ questions: TEMPLATES[s.template].questions })}>Load template</Btn>
          </Row>
          <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600, margin: '6px 0' }}>Edit the {s.questions.length} questions</summary>
          {s.questions.map((x, i) => (
            <div key={x.id} style={{ borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
              <textarea className="k-area" rows={2} value={x.text} onChange={(e) => editQ(x.id, { text: e.target.value })} aria-label="Question" style={{ width: '100%' }} />
              <Row wrap={false}>
                <input value={x.comp} onChange={(e) => editQ(x.id, { comp: e.target.value })} aria-label="Competency" style={{ flex: 1, minWidth: 0 }} />
                <select value={x.kind} onChange={(e) => editQ(x.id, { kind: e.target.value as Kind })} aria-label="Answer type">
                  <option value="rating">Rating 1–5</option>
                  <option value="yesno">Yes / No</option>
                  <option value="text">Notes only</option>
                </select>
                <Btn kind="ghost" onClick={() => moveQ(i, -1)} title="Up">↑</Btn>
                <Btn kind="ghost" onClick={() => moveQ(i, 1)} title="Down">↓</Btn>
                <Btn kind="ghost" onClick={() => set({ questions: s.questions.filter((z) => z.id !== x.id) })} title="Remove">✕</Btn>
              </Row>
            </div>
          ))}
          <Btn onClick={() => set({ questions: [...s.questions, { id: uid(), text: 'New question', comp: 'Other', kind: 'rating' }] })}>+ Question</Btn>
          </details>
          {risky.length > 0 && (
            <Note tone="err">
              {risky.map((r) => <div key={r.x.id}>“{r.x.text.slice(0, 50)}…” touches <b>{r.issues.join(', ')}</b> — avoid; it can be discriminatory or unlawful.</div>)}
            </Note>
          )}
          <p className="muted" style={{ fontSize: 12 }}>Ask every referee the same questions so answers are comparable. Stick to job-related behaviour you can verify.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Verdict" value={sum.verdict.label} tone={sum.verdict.tone} />
          <Stat label="Avg rating" value={sum.ratingAvg === null ? '—' : `${sum.ratingAvg.toFixed(1)} / 5`} sub={sum.overallAvg ? `overall ${sum.overallAvg.toFixed(1)}` : undefined} />
          <Stat label="Would rehire" value={`${sum.rehire.yes} / ${cand?.refs.length ?? 0}`} sub={sum.rehire.no ? `${sum.rehire.no} no` : undefined} tone={sum.rehire.no ? 'bad' : undefined} />
          <Stat label="Calls complete" value={`${sum.completed} / ${cand?.refs.length ?? 0}`} sub={`${Math.round(sum.coverage * 100)}% answered`} />
        </Stats>
        <Panel title="Reference calls" actions={<Btn onClick={() => { const r = blank(); editCand({ refs: [...cand.refs, r] }); set((st) => ({ ...st, activeRef: r.id })) }}>+ Reference</Btn>}>
          <Seg value={ref?.id ?? ''} onChange={(activeRef) => set({ activeRef })} options={(cand?.refs ?? []).map((r, i) => [r.id, `${r.name || `Reference ${i + 1}`}${r.rehire ? ' ✓' : ''}`] as [string, string])} />
          {ref && (
            <>
              <Row>
                <Txt label="Referee" value={ref.name} onChange={(name) => editRef({ name })} />
                <Txt label="Job title" value={ref.title} onChange={(title) => editRef({ title })} />
                <Txt label="Company" value={ref.company} onChange={(company) => editRef({ company })} />
              </Row>
              <Row>
                <Select label="Relationship" value={ref.relationship} onChange={(relationship) => editRef({ relationship })} options={RELS} />
                <Num label="Years together" value={ref.years} onChange={(years) => editRef({ years })} min={0} max={50} />
                <Txt label="Phone / email" value={ref.contact} onChange={(contact) => editRef({ contact })} />
                <Txt label="Call date" type="date" value={ref.date} onChange={(date) => editRef({ date })} />
              </Row>
              <Check label="Candidate gave consent to contact this referee" value={ref.consent} onChange={(consent) => editRef({ consent })} />
              {!ref.consent && <Note tone="warn">Record the candidate’s consent before calling.</Note>}
              {s.questions.map((x, i) => {
                const a = ref.answers[x.id] ?? { note: '' }
                return (
                  <div key={x.id} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
                    <div style={{ fontWeight: 600 }}>{i + 1}. {x.text} <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>· {x.comp} · {kindBadge[x.kind]}</span></div>
                    <Row>
                      {x.kind === 'rating' && [1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" className={`k-btn ${a.rating === n ? 'primary' : ''}`} style={{ minWidth: 38 }} onClick={() => answer(x.id, { rating: a.rating === n ? undefined : n })}>{n}</button>
                      ))}
                      {x.kind === 'yesno' && (['yes', 'unsure', 'no'] as const).map((v) => (
                        <button key={v} type="button" className={`k-btn ${a.yes === v ? 'primary' : ''}`} onClick={() => { const yes = a.yes === v ? undefined : v; if (x.comp === 'Rehire') editRef({ rehire: yes ?? '', answers: { ...ref.answers, [x.id]: { ...a, yes } } }); else answer(x.id, { yes }) }}>{v}</button>
                      ))}
                    </Row>
                    <textarea className="k-area" rows={2} placeholder="Notes — quote the referee where possible" value={a.note} onChange={(e) => answer(x.id, { note: e.target.value })} style={{ width: '100%', marginTop: 6 }} />
                  </div>
                )
              })}
              <Row>
                <Select label="Overall impression" value={ref.overall} onChange={(overall) => editRef({ overall })} options={[[0, '—'], [1, '1 · Serious concerns'], [2, '2 · Some concerns'], [3, '3 · Mixed'], [4, '4 · Positive'], [5, '5 · Outstanding']]} />
                <Select label="Would rehire?" value={ref.rehire} onChange={(rehire) => editRef({ rehire })} options={[['', '—'], ['yes', 'Yes'], ['unsure', 'Unsure'], ['no', 'No']]} />
              </Row>
              <Area label="Red flags / follow-ups" value={ref.flags} onChange={(flags) => editRef({ flags })} rows={2} placeholder="Anything to verify or discuss with the hiring manager" />
              {cand.refs.length > 1 && <Btn kind="danger" onClick={() => { const rest = cand.refs.filter((r) => r.id !== ref.id); editCand({ refs: rest }); set((st) => ({ ...st, activeRef: rest[0].id })) }}>Delete this reference</Btn>}
            </>
          )}
        </Panel>
        <Panel
          title={`Summary — ${cand?.name ?? ''}`}
          actions={
            <>
              <Btn kind="primary" onClick={() => void exportPdf()}>⬇ PDF summary</Btn>
              <CsvButton name="reference-answers.csv" rows={() => [['Candidate', 'Referee', 'Relationship', 'Question', 'Competency', 'Rating', 'Yes/No', 'Notes'], ...s.candidates.flatMap((c) => c.refs.flatMap((r) => s.questions.map((x) => [c.name, r.name, r.relationship, x.text, x.comp, r.answers[x.id]?.rating ?? '', r.answers[x.id]?.yes ?? '', r.answers[x.id]?.note ?? ''])))]} />
              <JsonButtons name="reference-checks.json" data={s} onLoad={(d) => set(d)} />
            </>
          }
        >
          {sum.comps.length === 0 && <p className="muted">Ratings appear here as you fill in calls.</p>}
          {sum.comps.map((c) => (
            <div key={c.comp} style={{ marginBottom: 8 }}>
              <Row wrap={false}>
                <b style={{ flex: 1 }}>{c.comp}</b>
                <span>{c.avg.toFixed(1)} <span className="muted">/ 5 · {c.n} rating{c.n === 1 ? '' : 's'}{c.spread >= 2 ? ' · referees disagree' : ''}</span></span>
              </Row>
              <Bar value={c.avg} max={5} color={c.avg < 3 ? 'var(--err)' : c.spread >= 2 ? 'var(--warn)' : 'var(--accent)'} />
            </div>
          ))}
          {sum.concerns.length > 0 && <Note tone="warn"><b>Follow up:</b> {sum.concerns.join(' · ')}</Note>}
        </Panel>
        <Note>Saved only in this browser. Reference notes are personal data: share the PDF only with the hiring team and delete it under your retention policy.</Note>
      </div>
    </Split>
  )
}
