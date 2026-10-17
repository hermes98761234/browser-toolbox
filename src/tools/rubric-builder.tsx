import { useState } from 'react'
import { BarChart, Btn, CsvButton, download, JsonButtons, Note, Panel, pct, Row, Seg, Select, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { criterionAverages, letter, maxLevel, maxTotal, median, pdfSafe, studentResult, wrap, type Criterion, type Level, type Student } from './lib/rubric-builder'

interface State {
  title: string
  levels: Level[]
  criteria: Criterion[]
  students: Student[]
}

const L = (id: string, name: string, points: number): Level => ({ id, name, points })
const C = (id: string, name: string, weight: number, d: [string, string, string, string]): Criterion => ({ id, name, weight, cells: { l4: d[0], l3: d[1], l2: d[2], l1: d[3] } })
const P = (name: string, picks: string, comment = ''): Student => ({
  id: uid(),
  name,
  picks: Object.fromEntries([...picks].map((ch, i) => [['th', 'ev', 'org', 'cnt', 'mech'][i], `l${ch}`]).filter(([, v]) => v !== 'l-')),
  comment,
})

const DEF: State = {
  title: 'Persuasive essay — Grade 9',
  levels: [L('l4', 'Exemplary', 4), L('l3', 'Proficient', 3), L('l2', 'Developing', 2), L('l1', 'Beginning', 1)],
  criteria: [
    C('th', 'Thesis & position', 2, ['Precise, arguable claim that frames the whole essay', 'Clear claim stated early', 'Claim present but vague or buried', 'No identifiable claim']),
    C('ev', 'Evidence & reasoning', 2, ['Relevant, well-cited evidence; reasoning explains every link', 'Mostly relevant evidence with some explanation', 'Thin evidence or reasoning gaps', 'Little or no evidence']),
    C('org', 'Organization', 1, ['Logical flow, purposeful transitions, strong conclusion', 'Clear paragraphs and transitions', 'Some ordering issues', 'Hard to follow']),
    C('cnt', 'Counterargument', 1, ['Anticipates and rebuts the strongest objection', 'Addresses an objection', 'Mentions an objection without rebuttal', 'Ignores other views']),
    C('mech', 'Conventions', 1, ['Virtually error-free', 'Minor errors that do not distract', 'Errors sometimes distract', 'Frequent errors impede meaning']),
  ],
  students: [
    P('Ava Thompson', '44434', 'Excellent sourcing. Push the rebuttal further.'),
    P('Liam Chen', '33323', 'Clear structure; cite the statistics you mention.'),
    P('Sofia Rossi', '43344'),
    P('Noah Patel', '22212', 'Narrow the thesis before revising.'),
    P('Mia Okafor', '34433'),
    P('Ethan Novak', '32---'),
  ],
}

export default function RubricBuilder() {
  const [s, set, reset] = useToolState('rubric-builder', DEF)
  const [view, setView] = useState<'build' | 'score' | 'class'>('build')
  const [cur, setCur] = useState(s.students[0]?.id ?? '')
  const levels = [...s.levels].sort((a, b) => b.points - a.points)
  const max = maxTotal(s.criteria, s.levels)
  const st = s.students.find((x) => x.id === cur) ?? s.students[0]
  const results = s.students.map((x) => ({ x, r: studentResult(s.criteria, s.levels, x) }))
  const done = results.filter((r) => r.r.complete)
  const pcts = done.map((r) => r.r.pct)
  const avgs = criterionAverages(s.criteria, s.levels, s.students)

  const editC = (id: string, p: Partial<Criterion>) => set({ criteria: s.criteria.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const editL = (id: string, p: Partial<Level>) => set({ levels: s.levels.map((l) => (l.id === id ? { ...l, ...p } : l)) })
  const editS = (id: string, p: Partial<Student>) => set({ students: s.students.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const addStudent = () => {
    const n: Student = { id: uid(), name: `Student ${s.students.length + 1}`, picks: {}, comment: '' }
    set({ students: [...s.students, n] })
    setCur(n.id)
    setView('score')
  }
  const idx = s.students.findIndex((x) => x.id === st?.id)

  const exportPdf = async () => {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const W = 842, H = 595, M = 32
    const grid = (student: Student | null) => {
      let page = doc.addPage([W, H])
      let y = H - M
      const head = (t: string, sub: string) => {
        page.drawText(pdfSafe(t), { x: M, y: y - 16, size: 16, font: bold })
        page.drawText(pdfSafe(sub), { x: M, y: y - 32, size: 10, font, color: rgb(0.35, 0.35, 0.35) })
        y -= 46
      }
      head(student ? `${s.title} — ${student.name}` : s.title, student ? (() => { const r = studentResult(s.criteria, s.levels, student); return `Score ${r.earned} / ${r.max} (${pct(r.pct, 0)}) · Grade ${letter(r.pct)}` })() : `Maximum ${max} points · ${s.criteria.length} criteria`)
      const cw0 = 150, cw = (W - 2 * M - cw0) / Math.max(1, levels.length)
      const fs = 8.5, lh = 10.5
      const row = (cells: string[], hdr: boolean, hi = -1) => {
        const lines = cells.map((t, i) => wrap(pdfSafe(t), (i ? cw : cw0) - 8, (x) => (hdr || i === 0 ? bold : font).widthOfTextAtSize(x, fs)))
        const h = Math.max(...lines.map((l) => l.length)) * lh + 8
        if (y - h < M) {
          page = doc.addPage([W, H])
          y = H - M
        }
        cells.forEach((_, i) => {
          const x = i ? M + cw0 + (i - 1) * cw : M
          const w = i ? cw : cw0
          page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.6, color: hdr ? rgb(0.92, 0.93, 0.97) : i - 1 === hi ? rgb(0.82, 0.9, 1) : undefined })
          lines[i].forEach((ln, k) => page.drawText(ln, { x: x + 4, y: y - 11 - k * lh, size: fs, font: hdr || i === 0 ? bold : font }))
        })
        y -= h
      }
      row(['Criterion', ...levels.map((l) => `${l.name} (${l.points})`)], true)
      for (const c of s.criteria) {
        const pick = student ? levels.findIndex((l) => l.id === student.picks[c.id]) : -1
        row([`${c.name}${c.weight !== 1 ? ` (×${c.weight})` : ''}`, ...levels.map((l) => c.cells[l.id] ?? '')], false, pick)
      }
      if (student?.comment) {
        y -= 14
        wrap(pdfSafe('Comments: ' + student.comment), W - 2 * M, (x) => font.widthOfTextAtSize(x, 10)).forEach((ln) => {
          page.drawText(ln, { x: M, y, size: 10, font })
          y -= 13
        })
      }
    }
    grid(null)
    for (const x of s.students) if (studentResult(s.criteria, s.levels, x).scored) grid(x)
    download('rubric.pdf', new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' }))
  }

  const tabs = (
    <Seg value={view} onChange={setView} options={[['build', '1 · Build rubric'], ['score', '2 · Score students'], ['class', '3 · Class summary']]} />
  )

  return (
    <div>
      <Stats>
        <Stat label="Criteria × levels" value={`${s.criteria.length} × ${s.levels.length}`} />
        <Stat label="Max points" value={max} sub={`level top = ${maxLevel(s.levels)} pts`} />
        <Stat label="Scored" value={`${done.length} / ${s.students.length}`} sub="students complete" />
        <Stat label="Class average" value={pcts.length ? pct(pcts.reduce((a, b) => a + b, 0) / pcts.length, 0) : '—'} sub={pcts.length ? `median ${pct(median(pcts), 0)}` : ''} tone="accent" />
      </Stats>
      <Panel
        title={tabs}
        actions={
          <>
            <Btn kind="primary" onClick={() => void exportPdf()}>⬇ PDF</Btn>
            <JsonButtons name="rubric.json" data={s} onLoad={(d) => set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </>
        }
      >
        {view === 'build' && (
          <>
            <Txt label="Rubric title" value={s.title} onChange={(title) => set({ title })} />
            <div className="k-table-wrap">
              <table className="k-table" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={{ width: 170 }}>Criterion · weight</th>
                    {levels.map((l) => (
                      <th key={l.id}>
                        <Row wrap={false}>
                          <input value={l.name} onChange={(e) => editL(l.id, { name: e.target.value })} aria-label="Level name" style={{ width: '100%', fontWeight: 700 }} />
                          <input type="number" value={l.points} onChange={(e) => editL(l.id, { points: Number(e.target.value) || 0 })} aria-label="Level points" style={{ width: 52 }} />
                          {s.levels.length > 2 && (
                            <Btn kind="ghost" title="Remove level" onClick={() => set({ levels: s.levels.filter((x) => x.id !== l.id) })}>✕</Btn>
                          )}
                        </Row>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.criteria.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <textarea className="k-area" rows={2} value={c.name} onChange={(e) => editC(c.id, { name: e.target.value })} aria-label="Criterion" style={{ fontWeight: 700 }} />
                        <Row wrap={false}>
                          <span className="muted" style={{ fontSize: 12 }}>weight</span>
                          <input type="number" min={0} step={0.5} value={c.weight} onChange={(e) => editC(c.id, { weight: Math.max(0, Number(e.target.value) || 0) })} aria-label="Weight" style={{ width: 56 }} />
                          <Btn kind="ghost" title="Remove criterion" onClick={() => set({ criteria: s.criteria.filter((x) => x.id !== c.id) })}>✕</Btn>
                        </Row>
                      </td>
                      {levels.map((l) => (
                        <td key={l.id}>
                          <textarea className="k-area" rows={3} value={c.cells[l.id] ?? ''} placeholder="Describe this level…" onChange={(e) => editC(c.id, { cells: { ...c.cells, [l.id]: e.target.value } })} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Row>
              <Btn onClick={() => set({ criteria: [...s.criteria, { id: uid(), name: 'New criterion', weight: 1, cells: {} }] })}>+ Criterion</Btn>
              <Btn onClick={() => set({ levels: [...s.levels, { id: uid(), name: 'New level', points: Math.min(0, ...s.levels.map((l) => l.points)) }] })} disabled={s.levels.length >= 6}>+ Level</Btn>
            </Row>
            <Note>Each criterion earns <b>level points × weight</b>. Columns are ordered by points, highest first.</Note>
          </>
        )}

        {view === 'score' && st && (
          <>
            <Row>
              <Select label="Student" value={st.id} onChange={setCur} options={s.students.map((x) => [x.id, `${x.name}${studentResult(s.criteria, s.levels, x).complete ? ' ✓' : ''}`] as const)} />
              <Txt label="Name" value={st.name} onChange={(name) => editS(st.id, { name })} />
            </Row>
            <Row>
              <Btn onClick={() => setCur(s.students[Math.max(0, idx - 1)].id)} disabled={idx <= 0}>◀ Previous</Btn>
              <Btn onClick={() => setCur(s.students[Math.min(s.students.length - 1, idx + 1)].id)} disabled={idx >= s.students.length - 1}>Next ▶</Btn>
              <Btn onClick={addStudent}>+ Student</Btn>
              <Btn kind="danger" onClick={() => { set({ students: s.students.filter((x) => x.id !== st.id) }); setCur(s.students.find((x) => x.id !== st.id)?.id ?? '') }}>Delete</Btn>
            </Row>
            <p className="muted" style={{ fontSize: 13 }}>Click a cell to award that level. Click it again to clear.</p>
            <div className="k-table-wrap">
              <table className="k-table" style={{ minWidth: 680 }}>
                <thead>
                  <tr>
                    <th>Criterion</th>
                    {levels.map((l) => <th key={l.id}>{l.name} · {l.points}</th>)}
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {s.criteria.map((c) => {
                    const pick = st.picks[c.id]
                    const lv = levels.find((l) => l.id === pick)
                    return (
                      <tr key={c.id}>
                        <td><b>{c.name}</b>{c.weight !== 1 && <span className="muted"> ×{c.weight}</span>}</td>
                        {levels.map((l) => (
                          <td
                            key={l.id}
                            onClick={() => editS(st.id, { picks: pick === l.id ? Object.fromEntries(Object.entries(st.picks).filter(([k]) => k !== c.id)) : { ...st.picks, [c.id]: l.id } })}
                            style={{ cursor: 'pointer', fontSize: 13, background: pick === l.id ? 'var(--accent)' : undefined, color: pick === l.id ? 'var(--on-accent)' : undefined, borderRadius: 6 }}
                          >
                            {c.cells[l.id] || <span className="muted">—</span>}
                          </td>
                        ))}
                        <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{lv ? lv.points * c.weight : '–'} / {maxLevel(s.levels) * c.weight}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {(() => {
              const r = studentResult(s.criteria, s.levels, st)
              return (
                <Note tone={r.complete ? 'ok' : 'warn'}>
                  <b>{st.name}</b>: {r.earned} / {r.max} points · {pct(r.pct, 1)} · grade <b>{letter(r.pct)}</b>
                  {!r.complete && ` (${s.criteria.length - r.scored} criteria not scored yet)`}
                </Note>
              )
            })()}
            <label className="k-field">
              <span className="k-label">Feedback comment</span>
              <textarea className="k-area" rows={3} value={st.comment} onChange={(e) => editS(st.id, { comment: e.target.value })} placeholder="Strengths, next steps…" />
            </label>
          </>
        )}
        {view === 'score' && !st && (
          <Note>
            No students yet. <Btn onClick={addStudent}>+ Add a student</Btn>
          </Note>
        )}

        {view === 'class' && (
          <>
            <Row>
              <Btn onClick={addStudent}>+ Student</Btn>
              <CsvButton
                name="rubric-scores.csv"
                rows={() => [
                  ['Student', ...s.criteria.map((c) => c.name), 'Points', 'Max', 'Percent', 'Grade', 'Comment'],
                  ...results.map(({ x, r }) => [x.name, ...s.criteria.map((c) => s.levels.find((l) => l.id === x.picks[c.id]) ? s.levels.find((l) => l.id === x.picks[c.id])!.points * c.weight : ''), r.earned, r.max, (r.pct * 100).toFixed(1), r.complete ? letter(r.pct) : 'incomplete', x.comment]),
                ]}
              />
            </Row>
            <Table
              head={['Student', ...s.criteria.map((c) => c.name), 'Total', '%', 'Grade']}
              rows={results.map(({ x, r }) => [
                <a key="n" href="#" onClick={(e) => { e.preventDefault(); setCur(x.id); setView('score') }}>{x.name}</a>,
                ...s.criteria.map((c) => levels.find((l) => l.id === x.picks[c.id])?.points ?? '–'),
                `${r.earned}/${r.max}`,
                r.complete ? pct(r.pct, 0) : <span key="p" className="muted">{pct(r.pct, 0)}*</span>,
                r.complete ? <b key="g">{letter(r.pct)}</b> : <span key="g" className="muted">…</span>,
              ])}
              foot={['Average level', ...avgs.map((a) => (Number.isFinite(a.avg) ? a.avg.toFixed(2) : '–')), '', pcts.length ? pct(pcts.reduce((a, b) => a + b, 0) / pcts.length, 0) : '', '']}
            />
            <p className="muted" style={{ fontSize: 13 }}>* incomplete scoring (excluded from class average). Cells show level points before weighting.</p>
            <h4 style={{ margin: '16px 0 4px' }}>Average level by criterion (out of {maxLevel(s.levels)})</h4>
            <BarChart bars={avgs.map((a) => ({ label: a.name, value: Number.isFinite(a.avg) ? a.avg : 0 }))} fy={(v) => v.toFixed(1)} height={220} />
            {avgs.some((a) => Number.isFinite(a.avg)) && (
              <Note>
                Weakest area: <b>{[...avgs].filter((a) => Number.isFinite(a.avg)).sort((a, b) => a.avg - b.avg)[0].name}</b>. Consider a mini-lesson on it before the next draft.
              </Note>
            )}
            <h4 style={{ margin: '16px 0 4px' }}>Grade distribution</h4>
            <BarChart bars={['A', 'B', 'C', 'D', 'F'].map((g) => ({ label: g, value: done.filter((d) => letter(d.r.pct) === g).length }))} fy={(v) => (Number.isInteger(v) ? String(v) : '')} height={180} />
          </>
        )}
      </Panel>
    </div>
  )
}
