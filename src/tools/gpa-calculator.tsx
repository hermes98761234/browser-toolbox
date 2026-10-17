import { Btn, Check, CsvButton, fmt, JsonButtons, LineChart, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { cumulative, gpa, gradePoints, percentToLetter, requiredGpa, SCALES, type Course, type Level } from './lib/gpa-calculator'

interface Semester { id: string; name: string; courses: Course[] }
interface State {
  scale: string
  weighted: boolean
  priorGpa: number
  priorCredits: number
  semesters: Semester[]
  target: number
  remaining: number
}

const co = (name: string, credits: number, grade: string, level: Level = 'regular'): Course => ({ id: uid(), name, credits, grade, level, include: true })
const DEF: State = {
  scale: 'us4',
  weighted: false,
  priorGpa: 0,
  priorCredits: 0,
  semesters: [
    { id: 'f1', name: 'Fall 2025', courses: [co('Calculus I', 4, 'B+'), co('English Composition', 3, 'A−'), co('Intro to Psychology', 3, 'A'), co('Chemistry I + lab', 4, 'B'), co('Study Skills', 1, 'A')] },
    { id: 's1', name: 'Spring 2026', courses: [co('Calculus II', 4, 'B'), co('Microeconomics', 3, 'A−'), co('Statistics', 3, 'B+', 'honors'), co('Chemistry II + lab', 4, 'B−'), co('Spanish I', 3, 'A')] },
  ],
  target: 3.5,
  remaining: 60,
}
const LEVELS: [Level, string][] = [['regular', 'Regular'], ['honors', 'Honors +0.5'], ['ap', 'AP / IB +1.0']]

export default function GpaCalculator() {
  const [s, set, reset] = useToolState<State>('gpa-calculator', DEF)
  const scale = SCALES.find((x) => x.id === s.scale) ?? SCALES[0]
  const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')

  const sem: (Semester & { r: ReturnType<typeof gpa>; cum: number })[] = []
  for (let i = 0, pts = s.priorGpa * s.priorCredits, cr = s.priorCredits; i < s.semesters.length; i++) {
    const r = gpa(s.semesters[i].courses, scale, s.weighted)
    pts += r.points
    cr += r.credits
    sem.push({ ...s.semesters[i], r, cum: cr ? pts / cr : NaN })
  }
  const last = sem[sem.length - 1]
  const newPts = sem.reduce((a, m) => a + m.r.points, 0)
  const newCr = sem.reduce((a, m) => a + m.r.credits, 0)
  const cum = cumulative(s.priorGpa, s.priorCredits, newPts, newCr)
  const totalCr = s.priorCredits + newCr
  const need = requiredGpa(cum, totalCr, s.target, s.remaining)
  const maxG = scale.max + (s.weighted ? 1 : 0)

  const editSem = (id: string, patch: Partial<Semester>) => set({ semesters: s.semesters.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
  const editCourse = (sid: string, cid: string, patch: Partial<Course>) => {
    const m = s.semesters.find((x) => x.id === sid)!
    editSem(sid, { courses: m.courses.map((c) => (c.id === cid ? { ...c, ...patch } : c)) })
  }
  const setScale = (id: string) => {
    const ns = SCALES.find((x) => x.id === id) ?? SCALES[0]
    const map = (g: string) => (gradePoints(ns, g) !== undefined ? g : ns.grades.reduce((best, cand) => (Math.abs(cand[1] / ns.max - (gradePoints(scale, g) ?? 0) / scale.max) < Math.abs(best[1] / ns.max - (gradePoints(scale, g) ?? 0) / scale.max) ? cand : best))[0])
    set({ scale: id, semesters: s.semesters.map((m) => ({ ...m, courses: m.courses.map((c) => ({ ...c, grade: map(c.grade) })) })) })
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Grading scale">
          <Select label="Scale" value={s.scale} onChange={setScale} options={SCALES.map((x) => [x.id, x.name] as const)} />
          <Check label="Weighted GPA (Honors +0.5, AP/IB +1.0)" value={s.weighted} onChange={(weighted) => set({ weighted })} />
          <details>
            <summary className="muted">Grade points on this scale</summary>
            <Table head={['Grade', 'Points']} rows={scale.grades.map(([g, p]) => [g, p.toFixed(2)])} />
          </details>
        </Panel>
        <Panel title="Earlier record (optional)">
          <Row>
            <Num label="Previous cumulative GPA" value={s.priorGpa} onChange={(priorGpa) => set({ priorGpa: Math.max(0, Math.min(maxG, priorGpa)) })} min={0} max={maxG} step={0.01} />
            <Num label="Credits behind it" value={s.priorCredits} onChange={(priorCredits) => set({ priorCredits: Math.max(0, priorCredits) })} min={0} />
          </Row>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Use this if you only know your transcript totals instead of entering every past course.</p>
        </Panel>
        <Panel title="What-if target">
          <Row>
            <Num label="Target cumulative GPA" value={s.target} onChange={(target) => set({ target })} min={0} max={maxG} step={0.05} />
            <Num label="Credits still to take" value={s.remaining} onChange={(remaining) => set({ remaining: Math.max(0, remaining) })} min={0} />
          </Row>
          {!Number.isFinite(need) ? (
            <Note>Enter the credits you still have to take.</Note>
          ) : need > maxG ? (
            <Note tone="err">You would need {f2(need)} over the next {s.remaining} credits, above the {fmt(maxG, 3)} maximum. The best reachable is {f2(cumulative(cum, totalCr, maxG * s.remaining, s.remaining))}.</Note>
          ) : need <= 0 ? (
            <Note tone="ok">You'll stay at or above {f2(s.target)} even with all F grades. 🎉</Note>
          ) : (
            <Note tone={need > scale.max * 0.9 ? 'warn' : 'ok'}>
              Average <b>{f2(need)}</b> ({scale.id.startsWith('us') ? `≈ ${[...scale.grades].reverse().find((g) => g[1] >= need - 1e-9)?.[0] ?? scale.grades[0][0]} or better` : 'on this scale'}) on your remaining {s.remaining} credits to reach {f2(s.target)}.
            </Note>
          )}
          <Table
            head={['Target', 'Needed average']}
            rows={[2.5, 3, 3.3, 3.5, 3.7, 3.9].filter((t) => t <= maxG).concat(scale.max > 4.5 ? [7, 8, 9] : []).map((t) => {
              const n = requiredGpa(cum, totalCr, t, s.remaining)
              return [f2(t), <span key="n" style={{ color: n > maxG ? 'var(--err)' : n <= 0 ? 'var(--ok)' : undefined }}>{n > maxG ? 'not reachable' : n <= 0 ? 'already secured' : f2(n)}</span>]
            })}
          />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label={`${last?.name ?? 'Semester'} GPA`} value={f2(last?.r.gpa ?? NaN)} sub={`${last?.r.credits ?? 0} credits`} tone="accent" />
          <Stat label="Cumulative GPA" value={f2(cum)} sub={`out of ${fmt(maxG, 3)}`} tone={cum >= s.target ? 'good' : undefined} />
          <Stat label="Credits counted" value={totalCr} />
          <Stat label="Quality points" value={fmt(newPts + s.priorGpa * s.priorCredits, 5)} />
        </Stats>
        {sem.map((m) => (
          <Panel
            key={m.id}
            title={<input value={m.name} onChange={(e) => editSem(m.id, { name: e.target.value })} aria-label="Semester name" style={{ font: 'inherit', fontWeight: 700, border: 'none', background: 'transparent', color: 'inherit', width: '100%' }} />}
            actions={
              <>
                <span className="muted">GPA <b>{f2(m.r.gpa)}</b> · cum {f2(m.cum)}</span>
                <Btn onClick={() => editSem(m.id, { courses: [...m.courses, co('New course', 3, scale.grades[1][0])] })}>+ Course</Btn>
                <Btn kind="ghost" onClick={() => set({ semesters: s.semesters.filter((x) => x.id !== m.id) })} title="Remove semester">✕</Btn>
              </>
            }
          >
            <Table
              head={['Course', 'Credits', 'Grade', ...(s.weighted ? ['Level'] : []), 'Counts', '']}
              rows={m.courses.map((c) => [
                <input key="n" value={c.name} onChange={(e) => editCourse(m.id, c.id, { name: e.target.value })} aria-label="Course" style={{ minWidth: 140 }} />,
                <input key="c" type="number" min={0} step={0.5} value={c.credits} onChange={(e) => editCourse(m.id, c.id, { credits: Math.max(0, +e.target.value || 0) })} aria-label="Credits" style={{ width: 64 }} />,
                <select key="g" value={c.grade} onChange={(e) => editCourse(m.id, c.id, { grade: e.target.value })} aria-label="Grade">
                  {scale.grades.map(([g, p]) => <option key={g} value={g}>{g} ({p})</option>)}
                </select>,
                ...(s.weighted ? [<select key="l" value={c.level} onChange={(e) => editCourse(m.id, c.id, { level: e.target.value as Level })} aria-label="Level">{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>] : []),
                <input key="i" type="checkbox" checked={c.include} onChange={(e) => editCourse(m.id, c.id, { include: e.target.checked })} aria-label="Counts toward GPA" title="Untick for pass/fail or withdrawn courses" />,
                <Btn key="x" kind="ghost" onClick={() => editSem(m.id, { courses: m.courses.filter((x) => x.id !== c.id) })} title="Remove">✕</Btn>,
              ])}
            />
          </Panel>
        ))}
        <Row>
          <Btn kind="primary" onClick={() => set({ semesters: [...s.semesters, { id: uid(), name: `Semester ${s.semesters.length + 1}`, courses: [co('Course 1', 3, scale.grades[1][0]), co('Course 2', 3, scale.grades[1][0])] }] })}>+ Semester</Btn>
          <CsvButton name="gpa.csv" rows={() => [['Semester', 'Course', 'Credits', 'Grade', 'Level', 'Counts'], ...s.semesters.flatMap((m) => m.courses.map((c) => [m.name, c.name, c.credits, c.grade, c.level, c.include ? 'yes' : 'no']))]} />
          <JsonButtons name="gpa.json" data={s} onLoad={(d) => set(d)} />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Row>
        {sem.length > 0 && (
          <Panel title="GPA trend">
            <LineChart
              height={220}
              yMin={Math.max(0, Math.floor(Math.min(s.target, ...sem.map((m) => (Number.isFinite(m.r.gpa) ? m.r.gpa : maxG))) * 2) / 2 - 0.5)}
              yMax={maxG}
              fx={(v) => sem[Math.round(v)]?.name ?? ''}
              fy={(v) => v.toFixed(2)}
              series={[
                { name: 'Semester GPA', points: sem.map((m, i) => [i, m.r.gpa] as [number, number]).filter((p) => Number.isFinite(p[1])) },
                { name: 'Cumulative GPA', points: sem.map((m, i) => [i, m.cum] as [number, number]).filter((p) => Number.isFinite(p[1])), dashed: true },
                { name: 'Target', points: [[0, s.target], [Math.max(1, sem.length - 1), s.target]], color: '#94a3b8', dashed: true },
              ]}
            />
          </Panel>
        )}
        <Panel title="Percent → letter">
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Common US cut-offs (your school may differ):</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[98, 94, 91, 88, 85, 81, 78, 75, 71, 68, 65, 61, 50].map((p) => <span key={p} className="k-btn ghost" style={{ cursor: 'default' }}>{p}% → {percentToLetter(p)}</span>)}
          </div>
        </Panel>
      </div>
    </Split>
  )
}
