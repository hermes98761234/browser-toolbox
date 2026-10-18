import { Area, Bar, Btn, CopyButton, download, JsonButtons, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { makeDocx, toMarkdown } from './lib/meeting-minutes-template'
import { buildDoc, gaps, goalScore, label, overall, STATUS, weighted, type Competency, type Goal, type GoalStatus, type Review } from './lib/performance-review-builder'

type Mode = 'self' | 'mgr' | 'both'
interface State extends Review { mode: Mode }

const SCALES: Record<number, string[]> = {
  5: ['Unsatisfactory', 'Needs improvement', 'Meets expectations', 'Exceeds expectations', 'Outstanding'],
  4: ['Below expectations', 'Partially meets', 'Fully meets', 'Exceeds'],
  3: ['Developing', 'Solid', 'Strong'],
}
const comp = (name: string, desc: string, weight = 1): Competency => ({ id: uid(), name, desc, weight, self: 0, mgr: 0, selfNote: '', mgrNote: '' })
const TEMPLATES: Record<string, () => Competency[]> = {
  'Individual contributor': () => [
    comp('Quality of work', 'Accurate, thorough output that rarely needs rework.', 2), comp('Delivery & ownership', 'Commits realistically, follows through, raises risks early.', 2),
    comp('Collaboration', 'Works well across teams; shares context and credit.'), comp('Communication', 'Clear writing and speaking adapted to the audience.'),
    comp('Problem solving', 'Breaks down ambiguous problems and weighs trade-offs.'), comp('Learning & growth', 'Seeks feedback and builds new skills.'),
  ],
  'People manager': () => [
    comp('Team results', 'Team meets its commitments and quality bar.', 2), comp('Coaching & feedback', 'Regular, specific feedback; grows people.', 2),
    comp('Planning & priorities', 'Clear goals, sensible sequencing, protects focus.'), comp('Hiring & team health', 'Builds a balanced team; healthy morale and retention.'),
    comp('Stakeholder management', 'Sets expectations and keeps partners informed.'), comp('Decision making', 'Timely decisions with stated reasoning.'),
  ],
  Engineering: () => [
    comp('Technical depth', 'Strong command of the stack and its failure modes.', 2), comp('Code quality & reviews', 'Readable, tested code; thoughtful reviews.', 2),
    comp('System design', 'Designs that scale and stay simple.'), comp('Reliability & operations', 'Monitors, fixes root causes, writes runbooks.'),
    comp('Collaboration', 'Pairs, documents and unblocks others.'), comp('Mentoring', 'Helps teammates level up.'),
  ],
  'Customer facing': () => [
    comp('Customer focus', 'Understands needs; follows up reliably.', 2), comp('Results vs target', 'Hits revenue, retention or satisfaction targets.', 2),
    comp('Product knowledge', 'Explains the product accurately and credibly.'), comp('Negotiation', 'Finds win–win terms; protects margin.'),
    comp('Teamwork', 'Hands over cleanly; shares insights with product.'), comp('Organisation', 'Accurate records and forecasting.'),
  ],
}
const goal = (title: string, measure: string, weight: number, progress: number, status: GoalStatus, note = ''): Goal => ({ id: uid(), title, measure, weight, progress, status, note })

function sample(): State {
  const comps = TEMPLATES['Individual contributor']()
  const r: [number, number, string, string][] = [[4, 4, 'Release checklists cut regressions noticeably.', 'Consistently careful; QA rarely finds issues in her work.'], [4, 3, 'Shipped the billing export two weeks early.', 'Strong delivery overall, but the Q2 migration slipped without an early warning.'], [5, 4, '', 'Go-to partner for the design team.'], [3, 3, 'Want to get better at shorter updates.', 'Written updates are thorough; could lead with the conclusion.'], [4, 4, '', 'Good at framing options with trade-offs.'], [3, 4, '', 'Completed the data course and applied it right away.']]
  comps.forEach((c, i) => Object.assign(c, { self: r[i][0], mgr: r[i][1], selfNote: r[i][2], mgrNote: r[i][3] }))
  return {
    mode: 'both', employee: 'Lena Ashford', role: 'Product Analyst', manager: 'Dario Northam', department: 'Growth', from: '2026-01-01', to: '2026-06-30', kind: 'Mid-year',
    scale: 5, labels: SCALES[5], comps, goalShare: 30,
    goals: [
      goal('Launch self-serve billing export', 'Live for all plans by May', 2, 100, 'achieved', 'Shipped 2 weeks early.'),
      goal('Reduce weekly reporting time', 'From 6 h to 2 h per week', 1, 70, 'on-track', 'Automated 3 of 4 reports.'),
      goal('Migrate dashboards to the new warehouse', '100% of 40 dashboards', 2, 45, 'at-risk', 'Blocked on access for 2 weeks.'),
    ],
    strengths: '- Reliable, high-quality analysis\n- Trusted partner for design and product', development: '- Flag schedule risks within a day of spotting them\n- Lead written updates with the recommendation\n- Present one analysis at the monthly all-hands',
    selfSummary: 'Proud of the billing export. I want more ownership of the warehouse migration next half.', mgrSummary: 'A strong half overall. Focus on early risk signalling and concise updates.',
  }
}
const DEF = sample()
const DOT = { position: 'absolute', top: 4, width: 12, height: 12, marginLeft: -6, borderRadius: 6 } as const

function Rate({ value, n, onChange, tone }: { value: number; n: number; onChange: (v: number) => void; tone: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {Array.from({ length: n }, (_, i) => i + 1).map((v) => (
        <button key={v} type="button" onClick={() => onChange(value === v ? 0 : v)} aria-pressed={value === v} title={String(v)}
          style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--line)', fontWeight: 700, background: value === v ? tone : 'var(--panel)', color: value === v ? '#fff' : 'inherit' }}>{v}</button>
      ))}
    </span>
  )
}

export default function PerformanceReviewBuilder() {
  const [s, set, reset] = useToolState('performance-review-builder', DEF)
  const editC = (id: string, p: Partial<Competency>) => set({ comps: s.comps.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const editG = (id: string, p: Partial<Goal>) => set({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...p } : g)) })
  const selfAvg = weighted(s.comps, 'self'), mgrAvg = weighted(s.comps, 'mgr'), gs = goalScore(s.goals), ov = overall(s)
  const gp = gaps(s.comps)
  const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
  const setScale = (n: number) => set({ scale: n, labels: SCALES[n], comps: s.comps.map((c) => ({ ...c, self: Math.min(c.self, n), mgr: Math.min(c.mgr, n) })) })
  const pos = (v: number) => ((v - 1) / Math.max(1, s.scale - 1)) * 100
  const showSelf = s.mode !== 'mgr', showMgr = s.mode !== 'self'
  const docx = () => download(`${(s.employee || 'review').replace(/\s+/g, '-').toLowerCase()}-${s.kind.toLowerCase()}-review.docx`, new Blob([makeDocx(buildDoc(s)) as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))

  return (
    <Split>
      <div>
        <Panel title="Review">
          <Row>
            <Txt label="Employee" value={s.employee} onChange={(employee) => set({ employee })} />
            <Txt label="Role" value={s.role} onChange={(role) => set({ role })} />
          </Row>
          <Row>
            <Txt label="Manager" value={s.manager} onChange={(manager) => set({ manager })} />
            <Txt label="Department" value={s.department} onChange={(department) => set({ department })} />
          </Row>
          <Row>
            <Select label="Type" value={s.kind} onChange={(kind) => set({ kind })} options={['Annual', 'Mid-year', 'Quarterly', 'Probation', 'Project']} />
            <Txt label="From" type="date" value={s.from} onChange={(from) => set({ from })} />
            <Txt label="To" type="date" value={s.to} onChange={(to) => set({ to })} />
          </Row>
          <Row>
            <Select label="Rating scale" value={s.scale} onChange={setScale} options={[[5, '5-point'], [4, '4-point'], [3, '3-point']]} />
            <Num label="Goals share of overall" value={s.goalShare} onChange={(goalShare) => set({ goalShare })} unit="%" min={0} max={100} />
          </Row>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>{s.labels.map((l, i) => `${i + 1} = ${l}`).join(' · ')}</p>
        </Panel>
        <Panel title="Competency template">
          <Row>{Object.keys(TEMPLATES).map((k) => <Btn key={k} kind="ghost" onClick={() => { if (confirm(`Replace competencies with the “${k}” template? Ratings will be cleared.`)) set({ comps: TEMPLATES[k]() }) }}>{k}</Btn>)}</Row>
          <Btn onClick={() => set({ comps: [...s.comps, comp('New competency', 'What good looks like…')] })}>+ Competency</Btn>
        </Panel>
        <Panel title="Goals" actions={<Btn onClick={() => set({ goals: [...s.goals, goal('New goal', 'How success is measured', 1, 0, 'on-track')] })}>+ Goal</Btn>}>
          {s.goals.map((g) => (
            <div key={g.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, marginBottom: 8, display: 'grid', gap: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 6 }}>
                <input value={g.title} onChange={(e) => editG(g.id, { title: e.target.value })} aria-label="Goal" style={{ fontWeight: 700, minWidth: 0 }} />
                <Btn kind="ghost" onClick={() => set({ goals: s.goals.filter((x) => x.id !== g.id) })} title="Remove">✕</Btn>
              </div>
              <input value={g.measure} onChange={(e) => editG(g.id, { measure: e.target.value })} aria-label="Measure" placeholder="Measure of success" />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
                <select value={g.status} onChange={(e) => editG(g.id, { status: e.target.value as GoalStatus, progress: e.target.value === 'achieved' ? 100 : g.progress })} aria-label="Status">
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <label>Progress <input type="range" min={0} max={100} step={5} value={g.progress} onChange={(e) => editG(g.id, { progress: Number(e.target.value) })} style={{ verticalAlign: 'middle', width: 110 }} /> <b>{g.progress}%</b></label>
                <label>Weight <input type="number" min={0} value={g.weight} onChange={(e) => editG(g.id, { weight: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 52 }} /></label>
              </div>
              <Bar value={g.progress} max={100} color={g.status === 'at-risk' ? 'var(--warn)' : g.status === 'missed' ? 'var(--err)' : g.status === 'dropped' ? 'var(--muted)' : 'var(--ok)'} />
              <input value={g.note} onChange={(e) => editG(g.id, { note: e.target.value })} aria-label="Goal note" placeholder="Notes / evidence" />
            </div>
          ))}
        </Panel>
        <Panel title="Summary & development">
          <Area label="Key strengths (- for bullets)" value={s.strengths} onChange={(strengths) => set({ strengths })} rows={3} />
          <Area label="Development plan" value={s.development} onChange={(development) => set({ development })} rows={4} />
          <Area label="Employee comments" value={s.selfSummary} onChange={(selfSummary) => set({ selfSummary })} rows={3} />
          <Area label="Manager comments" value={s.mgrSummary} onChange={(mgrSummary) => set({ mgrSummary })} rows={3} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Self average" value={f2(selfAvg)} />
          <Stat label="Manager average" value={f2(mgrAvg)} />
          <Stat label="Goal attainment" value={Number.isFinite(gs) ? `${Math.round(gs * 100)}%` : '—'} />
          <Stat label="Overall" value={f2(ov)} sub={label(ov, s.labels)} tone="accent" />
        </Stats>
        <Panel title="Export" actions={<Btn kind="ghost" onClick={() => { if (confirm('Reset to the sample review?')) reset() }}>Reset</Btn>}>
          <Row>
            <Btn kind="primary" onClick={docx}>⬇ DOCX</Btn>
            <CopyButton text={() => toMarkdown(buildDoc(s))} label="Copy Markdown" />
            <JsonButtons name="performance-review.json" data={s} onLoad={(d) => set(d)} />
          </Row>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Share the JSON with the employee for the self-review, then load it back to add manager ratings.</p>
        </Panel>
        <Panel title="Self vs manager">
          {s.comps.map((c) => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 160px) 1fr', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              <div style={{ position: 'relative', height: 20, margin: '0 8px' }}>
                {Array.from({ length: s.scale }, (_, i) => <span key={i} style={{ position: 'absolute', left: `${pos(i + 1)}%`, top: 2, bottom: 2, borderLeft: '1px solid var(--line)' }} />)}
                {c.self > 0 && c.mgr > 0 && <span style={{ position: 'absolute', left: `${pos(Math.min(c.self, c.mgr))}%`, width: `${pos(Math.max(c.self, c.mgr)) - pos(Math.min(c.self, c.mgr))}%`, top: 9, height: 3, background: 'var(--muted)' }} />}
                {c.self > 0 && <span style={{ ...DOT, left: `${pos(c.self)}%`, background: '#0ea5e9' }} title={`Self ${c.self}`} />}
                {c.mgr > 0 && <span style={{ ...DOT, left: `${pos(c.mgr)}%`, background: '#6366f1', opacity: 0.85 }} title={`Manager ${c.mgr}`} />}
              </div>
            </div>
          ))}
          <div className="k-legend"><span><i style={{ background: '#0ea5e9' }} />Self</span><span><i style={{ background: '#6366f1' }} />Manager</span><span className="muted">1 … {s.scale}</span></div>
          {gp.length > 0 ? <Note tone="warn">Discuss: {gp.map((g) => `${g.name} (${g.diff > 0 ? 'self higher' : 'manager higher'} by ${Math.abs(g.diff)})`).join('; ')}.</Note> : <Note tone="ok">Self and manager ratings are aligned (no gaps of a full point or more).</Note>}
        </Panel>
        <Panel title="Competencies" actions={<Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['self', 'Self'], ['mgr', 'Manager'], ['both', 'Both']]} />}>
          {s.comps.map((c) => (
            <div key={c.id} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0', display: 'grid', gap: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px auto', gap: 6, alignItems: 'center' }}>
                <input value={c.name} onChange={(e) => editC(c.id, { name: e.target.value })} aria-label="Competency" style={{ fontWeight: 700, minWidth: 0 }} />
                <label className="muted" style={{ fontSize: 12 }} title="Weight">×<input type="number" min={0} value={c.weight} onChange={(e) => editC(c.id, { weight: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 42 }} /></label>
                <Btn kind="ghost" onClick={() => set({ comps: s.comps.filter((x) => x.id !== c.id) })} title="Remove">✕</Btn>
              </div>
              <input value={c.desc} onChange={(e) => editC(c.id, { desc: e.target.value })} aria-label="Description" className="muted" style={{ fontSize: 12.5 }} />
              {showSelf && (
                <div style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b style={{ width: 62 }}>Self</b><Rate value={c.self} n={s.scale} onChange={(v) => editC(c.id, { self: v })} tone="#0ea5e9" /><span className="muted">{c.self ? s.labels[c.self - 1] : 'not rated'}</span></span>
                  <textarea className="k-area" rows={2} value={c.selfNote} onChange={(e) => editC(c.id, { selfNote: e.target.value })} placeholder="Self-assessment: examples, evidence…" />
                </div>
              )}
              {showMgr && (
                <div style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b style={{ width: 62 }}>Manager</b><Rate value={c.mgr} n={s.scale} onChange={(v) => editC(c.id, { mgr: v })} tone="#6366f1" /><span className="muted">{c.mgr ? s.labels[c.mgr - 1] : 'not rated'}</span></span>
                  <textarea className="k-area" rows={2} value={c.mgrNote} onChange={(e) => editC(c.id, { mgrNote: e.target.value })} placeholder="Manager feedback: what to keep doing, what to change…" />
                </div>
              )}
            </div>
          ))}
        </Panel>
      </div>
    </Split>
  )
}
