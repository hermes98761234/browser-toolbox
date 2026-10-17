import { Bar, BarChart, Btn, CsvButton, download, JsonButtons, Note, Panel, pct, Row, Select, Split, Stat, Stats, Table, Txt, today, uid, useToolState } from '../kit'
import { recommendation, shares, summarize, type Criterion, type Ratings } from './lib/interview-scorecard'

interface Crit extends Criterion { desc: string }
interface Person { id: string; name: string }
interface Candidate { id: string; name: string; notes: string; ratings: Ratings }
interface State {
  role: string
  scale: number
  criteria: Crit[]
  interviewers: Person[]
  candidates: Candidate[]
  active: string
}

const r = (a: number[], b: number[], c: number[]) => ({ i1: { c1: a[0], c2: a[1], c3: a[2], c4: a[3], c5: a[4] }, i2: { c1: b[0], c2: b[1], c3: b[2], c4: b[3], c5: b[4] }, i3: { c1: c[0], c2: c[1], c3: c[2], c4: c[3], c5: c[4] } })

const DEF: State = {
  role: 'Senior Frontend Engineer',
  scale: 5,
  criteria: [
    { id: 'c1', name: 'Technical depth', weight: 3, desc: 'React, TypeScript, browser fundamentals, performance' },
    { id: 'c2', name: 'Problem solving', weight: 3, desc: 'Breaks problems down, weighs trade-offs, tests ideas' },
    { id: 'c3', name: 'Communication', weight: 2, desc: 'Explains clearly, listens, asks good questions' },
    { id: 'c4', name: 'Collaboration', weight: 2, desc: 'Code review, mentoring, cross-team work' },
    { id: 'c5', name: 'Ownership', weight: 1, desc: 'Follows through, owns outcomes and mistakes' },
  ],
  interviewers: [
    { id: 'i1', name: 'Priya (coding)' },
    { id: 'i2', name: 'Marco (system design)' },
    { id: 'i3', name: 'Jen (hiring manager)' },
  ],
  candidates: [
    { id: 'k1', name: 'Alex Morgan', notes: 'Strong on performance profiling; great questions about our design system.', ratings: r([5, 4, 4, 4, 4], [4, 5, 4, 3, 4], [4, 4, 5, 4, 5]) },
    { id: 'k2', name: 'Sam Rivera', notes: 'Solid fundamentals; system design felt rushed.', ratings: r([4, 3, 3, 4, 3], [2, 2, 3, 3, 3], [3, 4, 4, 4, 4]) },
    { id: 'k3', name: 'Jordan Lee', notes: 'Hiring manager round still to come.', ratings: { i1: { c1: 4, c2: 4, c3: 3, c4: 3, c5: 4 }, i2: { c1: 4, c2: 3, c3: 4, c4: 4, c5: 3 } } },
  ],
  active: 'k1',
}

const latin = (s: string) => s.replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7e\xa0-\xff]/g, '?')

export default function InterviewScorecard() {
  const [s, set, reset] = useToolState('interview-scorecard', DEF)
  const ids = s.interviewers.map((i) => i.id)
  const sums = s.candidates.map((c) => ({ c, sum: summarize(c.ratings, s.criteria, ids, s.scale) }))
  const ranked = [...sums].sort((a, b) => (b.sum.score ?? -1) - (a.sum.score ?? -1))
  const cur = sums.find((x) => x.c.id === s.active) ?? sums[0]
  const w = shares(s.criteria)
  const editC = (id: string, p: Partial<Crit>) => set({ criteria: s.criteria.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const editK = (id: string, p: Partial<Candidate>) => set({ candidates: s.candidates.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const rate = (iv: string, cr: string, v: number | undefined) => cur && editK(cur.c.id, { ratings: { ...cur.c.ratings, [iv]: { ...cur.c.ratings[iv], [cr]: v } } })
  const fmt = (x: number | null) => (x === null ? '—' : pct(x, 0))

  const exportPdf = async () => {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    let page = pdf.addPage([595.28, 841.89])
    let y = 790
    const text = (t: string, x: number, size = 10, b = false, color = rgb(0.1, 0.1, 0.15)) => page.drawText(latin(t), { x, y, size, font: b ? bold : font, color })
    const need = (h: number) => { if (y - h < 50) { page = pdf.addPage([595.28, 841.89]); y = 790 } }
    text(`Interview scorecard - ${s.role}`, 48, 18, true)
    y -= 18
    text(`Generated ${today()} · ${s.interviewers.length} interviewers · scale 1-${s.scale}`, 48, 9, false, rgb(0.4, 0.4, 0.45))
    y -= 26
    text('Criteria', 48, 12, true)
    y -= 16
    s.criteria.forEach((c, i) => { text(`${c.name} (${pct(w[i], 0)})`, 56, 10, true); text(c.desc, 220, 9); y -= 14 })
    y -= 14
    text('Ranking', 48, 12, true)
    y -= 16
    ranked.forEach(({ c, sum }, i) => {
      need(16)
      text(`${i + 1}. ${c.name}`, 56, 10, true)
      text(fmt(sum.score), 250, 10, true)
      text(recommendation(sum.score).label, 300, 10)
      text(`spread ${pct(sum.spread, 0)} · ${pct(sum.coverage, 0)} rated`, 400, 9)
      y -= 15
    })
    for (const { c, sum } of ranked) {
      need(60 + s.criteria.length * 14)
      y -= 16
      page.drawLine({ start: { x: 48, y: y + 10 }, end: { x: 547, y: y + 10 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.85) })
      text(`${c.name} - ${fmt(sum.score)} (${recommendation(sum.score).label})`, 48, 12, true)
      y -= 16
      text('Criterion', 56, 9, true)
      s.interviewers.forEach((iv, j) => text(iv.name.slice(0, 16), 220 + j * 85, 9, true))
      text('Avg', 220 + s.interviewers.length * 85, 9, true)
      y -= 13
      for (const cr of s.criteria) {
        text(cr.name, 56, 9)
        s.interviewers.forEach((iv, j) => text(String(c.ratings[iv.id]?.[cr.id] ?? '-'), 220 + j * 85, 9))
        const a = sum.perCriterion[cr.id]
        text(a === null ? '-' : a.toFixed(1), 220 + s.interviewers.length * 85, 9, sum.disagreement.includes(cr.id))
        y -= 13
      }
      if (c.notes) {
        for (const line of latin(c.notes).match(/.{1,95}(\s|$)/g) ?? []) { need(13); text(line.trim(), 56, 9, false, rgb(0.35, 0.35, 0.4)); y -= 12 }
      }
    }
    const bytes = await pdf.save()
    download(`scorecard-${s.role.replace(/\W+/g, '-').toLowerCase()}.pdf`, new Blob([bytes.slice().buffer], { type: 'application/pdf' }))
  }

  return (
    <Split>
      <div>
        <Panel title="Role & criteria" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Txt label="Role" value={s.role} onChange={(role) => set({ role })} />
            <Select label="Rating scale" value={s.scale} onChange={(scale) => set({ scale })} options={[[4, '1–4 (no middle)'], [5, '1–5'], [7, '1–7'], [10, '1–10']]} />
          </Row>
          {s.criteria.map((c, i) => (
            <div key={c.id} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
              <Row wrap={false}>
                <input value={c.name} onChange={(e) => editC(c.id, { name: e.target.value })} aria-label="Criterion" style={{ flex: 1, fontWeight: 700 }} />
                <input type="number" min={0} max={10} value={c.weight} onChange={(e) => editC(c.id, { weight: Math.max(0, Number(e.target.value) || 0) })} aria-label="Weight" style={{ width: 56 }} title="Weight" />
                <span className="muted" style={{ width: 40, textAlign: 'right' }}>{pct(w[i], 0)}</span>
                <Btn kind="ghost" title="Remove" onClick={() => set({ criteria: s.criteria.filter((x) => x.id !== c.id) })}>✕</Btn>
              </Row>
              <input value={c.desc} placeholder="What does a strong answer look like?" onChange={(e) => editC(c.id, { desc: e.target.value })} aria-label="Description" style={{ width: '100%', fontSize: 13, marginTop: 4 }} />
            </div>
          ))}
          <Row>
            <Btn onClick={() => set({ criteria: [...s.criteria, { id: uid(), name: 'New criterion', weight: 1, desc: '' }] })}>+ Criterion</Btn>
          </Row>
        </Panel>
        <Panel title="Interview panel">
          {s.interviewers.map((iv) => (
            <Row key={iv.id} wrap={false}>
              <input value={iv.name} onChange={(e) => set({ interviewers: s.interviewers.map((x) => (x.id === iv.id ? { ...x, name: e.target.value } : x)) })} aria-label="Interviewer" style={{ flex: 1 }} />
              <Btn kind="ghost" title="Remove" onClick={() => set({ interviewers: s.interviewers.filter((x) => x.id !== iv.id) })}>✕</Btn>
            </Row>
          ))}
          <Row>
            <Btn onClick={() => set({ interviewers: [...s.interviewers, { id: uid(), name: `Interviewer ${s.interviewers.length + 1}` }] })}>+ Interviewer</Btn>
          </Row>
          <Note>Each interviewer scores independently. Scores map {`1…${s.scale}`} to 0–100% and use the weights above; unrated criteria are left out rather than counted as zero.</Note>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Candidates" value={s.candidates.length} />
          <Stat label="Top candidate" value={ranked[0]?.c.name ?? '—'} sub={ranked[0] ? fmt(ranked[0].sum.score) : undefined} tone="accent" />
          <Stat label="Hire-level" value={sums.filter((x) => (x.sum.score ?? 0) >= 0.65).length} tone="good" />
        </Stats>
        <Panel
          title="Ranking"
          actions={
            <>
              <Btn kind="primary" onClick={() => void exportPdf()}>⬇ PDF report</Btn>
              <CsvButton name="scorecard.csv" rows={() => [['Candidate', 'Score %', 'Recommendation', 'Spread %', ...s.criteria.map((c) => c.name)], ...ranked.map(({ c, sum }) => [c.name, sum.score === null ? '' : Math.round(sum.score * 100), recommendation(sum.score).label, Math.round(sum.spread * 100), ...s.criteria.map((cr) => sum.perCriterion[cr.id]?.toFixed(2) ?? '')])]} />
              <JsonButtons name="scorecard.json" data={s} onLoad={(d) => set(d)} />
            </>
          }
        >
          <Table
            head={['#', 'Candidate', 'Score', 'Recommendation', 'Agreement', '']}
            rows={ranked.map(({ c, sum }, i) => {
              const rec = recommendation(sum.score)
              return [
                i + 1,
                <button key="n" type="button" className="k-btn ghost" style={{ padding: '2px 4px', fontWeight: c.id === cur?.c.id ? 800 : 500 }} onClick={() => set({ active: c.id })}>{c.name}</button>,
                <div key="s" style={{ minWidth: 110 }}><b>{fmt(sum.score)}</b><Bar value={sum.score ?? 0} color={rec.tone === 'good' ? 'var(--ok)' : rec.tone === 'bad' ? 'var(--err)' : 'var(--warn)'} /></div>,
                <span key="r" style={{ color: rec.tone === 'good' ? 'var(--ok)' : rec.tone === 'bad' ? 'var(--err)' : undefined, fontWeight: 700 }}>{rec.label}</span>,
                <span key="a" className="muted">{sum.spread > 0.15 ? '⚠ split panel' : sum.coverage < 1 ? `${pct(sum.coverage, 0)} rated` : '✓ aligned'}</span>,
                <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ candidates: s.candidates.filter((x) => x.id !== c.id) })}>✕</Btn>,
              ]
            })}
          />
          <Row>
            <Btn onClick={() => { const id = uid(); set({ candidates: [...s.candidates, { id, name: `Candidate ${s.candidates.length + 1}`, notes: '', ratings: {} }], active: id }) }}>+ Candidate</Btn>
          </Row>
          {sums.length > 1 && <BarChart bars={ranked.map(({ c, sum }) => ({ label: c.name, value: Math.round((sum.score ?? 0) * 100) }))} fy={(v) => `${v}%`} height={200} />}
        </Panel>
        {cur && (
          <Panel title={`Scoring: ${cur.c.name}`}>
            <Row>
              <Txt label="Candidate name" value={cur.c.name} onChange={(name) => editK(cur.c.id, { name })} />
            </Row>
            <Table
              head={['Criterion', ...s.interviewers.map((iv) => iv.name), 'Average']}
              rows={s.criteria.map((cr) => [
                <span key="c" title={cr.desc}><b>{cr.name}</b><br /><span className="muted" style={{ fontSize: 12 }}>{pct(w[s.criteria.indexOf(cr)], 0)} weight</span></span>,
                ...s.interviewers.map((iv) => (
                  <select key={iv.id} value={cur.c.ratings[iv.id]?.[cr.id] ?? ''} onChange={(e) => rate(iv.id, cr.id, e.target.value ? Number(e.target.value) : undefined)} aria-label={`${iv.name} – ${cr.name}`}>
                    <option value="">–</option>
                    {Array.from({ length: s.scale }, (_, k) => <option key={k} value={k + 1}>{k + 1}</option>)}
                  </select>
                )),
                <b key="a" style={{ color: cur.sum.disagreement.includes(cr.id) ? 'var(--warn)' : undefined }} title={cur.sum.disagreement.includes(cr.id) ? 'Ratings differ by 2+ points — discuss in the debrief' : undefined}>
                  {cur.sum.perCriterion[cr.id]?.toFixed(1) ?? '—'}{cur.sum.disagreement.includes(cr.id) ? ' ⚠' : ''}
                </b>,
              ])}
              foot={['Weighted score', ...s.interviewers.map((iv) => fmt(cur.sum.perInterviewer[iv.id])), fmt(cur.sum.score)]}
            />
            {cur.sum.disagreement.length > 0 && <Note tone="warn">Panel disagrees (2+ points) on: {cur.sum.disagreement.map((id) => s.criteria.find((c) => c.id === id)?.name).join(', ')}. Discuss evidence before deciding.</Note>}
            <label className="k-field">
              <span className="k-label">Notes & evidence</span>
              <textarea className="k-area" rows={3} value={cur.c.notes} onChange={(e) => editK(cur.c.id, { notes: e.target.value })} />
            </label>
          </Panel>
        )}
      </div>
    </Split>
  )
}
