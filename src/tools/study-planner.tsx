import { useMemo } from 'react'
import { Bar, Btn, color, CsvButton, download, JsonButtons, Note, Num, Panel, Row, Split, Stat, Stats, Table, today, uid, useToolState } from '../kit'
import { addDays, daysBetween, schedule, toIcs, weekday, type Exam } from './lib/study-planner'

const T0 = today()
const DEF = {
  start: T0,
  week: [2, 2, 2, 2, 1.5, 4, 3],
  blocked: [addDays(T0, 5)] as string[],
  block: 0.5,
  review: 1,
  startTime: '17:00',
  exams: [
    { id: 'm', name: 'Calculus', date: addDays(T0, 11), topics: [{ id: 'm1', name: 'Limits', hours: 3 }, { id: 'm2', name: 'Derivatives', hours: 5 }, { id: 'm3', name: 'Integrals', hours: 6 }] },
    { id: 'b', name: 'Biology', date: addDays(T0, 16), topics: [{ id: 'b1', name: 'Cell structure', hours: 3 }, { id: 'b2', name: 'Genetics', hours: 4 }, { id: 'b3', name: 'Ecology', hours: 2 }] },
    { id: 'h', name: 'History essay exam', date: addDays(T0, 22), topics: [{ id: 'h1', name: 'Industrial Revolution', hours: 3 }, { id: 'h2', name: 'World War I', hours: 4 }, { id: 'h3', name: 'Essay practice', hours: 3 }] },
  ] as Exam[],
}
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const fmtH = (h: number) => `${Math.round(h * 100) / 100}h`
const nice = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export default function StudyPlanner() {
  const [s, set, reset] = useToolState('study-planner', DEF)
  const plan = useMemo(() => schedule({ start: s.start, exams: s.exams, week: s.week, blocked: s.blocked, block: s.block, review: s.review }), [s])
  const col = (id: string) => color(Math.max(0, s.exams.findIndex((e) => e.id === id)))
  const name = (id: string) => s.exams.find((e) => e.id === id)?.name ?? '?'
  const need = (e: Exam) => e.topics.reduce((a, t) => a + Math.max(0, t.hours), 0) + (s.review > 0 ? s.review : 0)
  const totalNeed = s.exams.reduce((a, e) => a + need(e), 0)
  const totalPlanned = Object.values(plan.planned).reduce((a, b) => a + b, 0)
  const short = Object.values(plan.unscheduled).reduce((a, b) => a + b, 0)
  const studyDays = plan.days.filter((d) => d.slots.length).length
  const editExam = (id: string, p: Partial<Exam>) => set({ exams: s.exams.map((e) => (e.id === id ? { ...e, ...p } : e)) })
  const [hh, mm] = s.startTime.split(':').map(Number)

  // Calendar: full weeks from the Monday on/before start to the last exam.
  const lastExam = s.exams.reduce((a, e) => (e.date > a ? e.date : a), s.start)
  const calStart = addDays(s.start, -weekday(s.start))
  const nDays = Math.min(7 * 26, Math.ceil((daysBetween(calStart, lastExam) + 1) / 7) * 7)
  const byDate = new Map(plan.days.map((d) => [d.date, d]))
  const examOn = new Map(s.exams.map((e) => [e.date, e]))
  const todayPlan = byDate.get(T0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Exams & topics" actions={<Btn onClick={() => set({ exams: [...s.exams, { id: uid(), name: 'New exam', date: addDays(s.start, 14), topics: [{ id: uid(), name: 'Topic 1', hours: 3 }] }] })}>+ Exam</Btn>}>
          {s.exams.map((e, i) => (
            <div key={e.id} style={{ borderLeft: `4px solid ${color(i)}`, paddingLeft: 10, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input value={e.name} onChange={(ev) => editExam(e.id, { name: ev.target.value })} aria-label="Exam name" style={{ flex: 1, minWidth: 0, fontWeight: 700 }} />
                <input type="date" value={e.date} onChange={(ev) => ev.target.value && editExam(e.id, { date: ev.target.value })} aria-label="Exam date" style={{ width: 140 }} />
                <Btn kind="ghost" title="Remove exam" onClick={() => set({ exams: s.exams.filter((x) => x.id !== e.id) })}>✕</Btn>
              </div>
              {e.date <= s.start && <Note tone="warn">This exam is not after the start date, so nothing is scheduled for it.</Note>}
              {e.topics.map((t) => (
                <div key={t.id} style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <input value={t.name} onChange={(ev) => editExam(e.id, { topics: e.topics.map((x) => (x.id === t.id ? { ...x, name: ev.target.value } : x)) })} aria-label="Topic" style={{ flex: 1, minWidth: 0 }} />
                  <input type="number" min={0} step={0.5} value={t.hours} onChange={(ev) => editExam(e.id, { topics: e.topics.map((x) => (x.id === t.id ? { ...x, hours: Math.max(0, Number(ev.target.value) || 0) } : x)) })} aria-label="Hours" style={{ width: 64 }} />
                  <span className="muted">h</span>
                  <Btn kind="ghost" title="Remove topic" onClick={() => editExam(e.id, { topics: e.topics.filter((x) => x.id !== t.id) })}>✕</Btn>
                </div>
              ))}
              <Btn kind="ghost" onClick={() => editExam(e.id, { topics: [...e.topics, { id: uid(), name: `Topic ${e.topics.length + 1}`, hours: 2 }] })}>+ Topic</Btn>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 13 }}>Hours = your estimate of study time per topic (weight harder topics with more hours). Topics are studied in the listed order.</p>
        </Panel>
        <Panel title="Availability" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <label className="k-field"><span className="k-label">Start studying</span><input type="date" className="k-text" value={s.start} onChange={(e) => e.target.value && set({ start: e.target.value })} /></label>
            <label className="k-field"><span className="k-label">Daily start time</span><input type="time" className="k-text" value={s.startTime} onChange={(e) => e.target.value && set({ startTime: e.target.value })} /></label>
          </Row>
          <div className="k-label" style={{ marginTop: 8 }}>Hours available per weekday</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
            {WD.map((d, i) => (
              <label key={d} style={{ textAlign: 'center', fontSize: 12 }}>
                {d}
                <input type="number" min={0} max={16} step={0.5} value={s.week[i]} onChange={(e) => set({ week: s.week.map((x, j) => (j === i ? Math.max(0, Math.min(16, Number(e.target.value) || 0)) : x)) })} style={{ width: '100%', textAlign: 'center' }} aria-label={`${d} hours`} />
              </label>
            ))}
          </div>
          <Row>
            <Num label="Session block" value={s.block} onChange={(block) => set({ block })} unit="h" min={0.25} max={4} step={0.25} />
            <Num label="Review day before exam" value={s.review} onChange={(review) => set({ review })} unit="h" min={0} max={8} step={0.5} />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Click a day in the calendar to block it (trip, shift, birthday…). Blocked: {s.blocked.length ? s.blocked.map(nice).join(', ') : 'none'}.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Study needed" value={fmtH(totalNeed)} sub={`${s.exams.length} exams`} />
          <Stat label="Scheduled" value={fmtH(totalPlanned)} sub={`${studyDays} study days`} tone={short > 0 ? 'bad' : 'good'} />
          <Stat label="Shortfall" value={fmtH(short)} tone={short > 0 ? 'bad' : 'good'} sub={short > 0 ? 'add hours or start earlier' : 'everything fits'} />
          <Stat label="Next exam" value={(() => { const n = s.exams.filter((e) => e.date >= T0).sort((a, b) => a.date.localeCompare(b.date))[0]; return n ? `${daysBetween(T0, n.date)} days` : '—' })()} sub={s.exams.filter((e) => e.date >= T0).sort((a, b) => a.date.localeCompare(b.date))[0]?.name} />
        </Stats>
        {short > 0 && <Note tone="err">Not enough time: {s.exams.filter((e) => plan.unscheduled[e.id] > 0).map((e) => `${e.name} is ${fmtH(plan.unscheduled[e.id])} short`).join(', ')}. Add hours on some weekdays, unblock days or trim topics.</Note>}
        <Panel
          title="Calendar"
          actions={
            <>
              <Btn kind="primary" onClick={() => download('study-plan.ics', toIcs(plan, s.exams, (hh || 0) * 60 + (mm || 0)), 'text/calendar')}>⬇ ICS</Btn>
              <CsvButton name="study-plan.csv" rows={() => [['Date', 'Exam', 'Topic', 'Hours'], ...plan.days.flatMap((d) => d.slots.map((x) => [d.date, name(x.examId), x.topic, x.hours]))]} />
              <JsonButtons name="study-planner.json" data={s} onLoad={(d) => set(d)} />
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3, fontSize: 11 }}>
            {WD.map((d) => <b key={d} style={{ textAlign: 'center', color: 'var(--muted)' }}>{d}</b>)}
            {Array.from({ length: nDays }, (_, i) => {
              const d = addDays(calStart, i)
              const day = byDate.get(d)
              const ex = examOn.get(d)
              const blocked = s.blocked.includes(d)
              const out = d < s.start || d > lastExam
              return (
                <button
                  type="button"
                  key={d}
                  disabled={out}
                  title={blocked ? 'Blocked — click to unblock' : 'Click to block this day'}
                  onClick={() => set({ blocked: blocked ? s.blocked.filter((x) => x !== d) : [...s.blocked, d] })}
                  style={{
                    minHeight: 64, textAlign: 'left', padding: 3, borderRadius: 6, cursor: out ? 'default' : 'pointer', font: 'inherit', color: 'inherit',
                    border: d === T0 ? '2px solid var(--accent)' : '1px solid var(--line)', opacity: out ? 0.35 : 1,
                    background: ex ? `color-mix(in srgb, ${col(ex.id)} 25%, var(--panel))` : blocked ? 'repeating-linear-gradient(45deg, var(--panel2), var(--panel2) 4px, transparent 4px, transparent 8px)' : 'var(--panel)',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{+d.slice(8)}{d.slice(8) === '01' || i === 0 ? ` ${new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}` : ''}</div>
                  {ex && <div style={{ fontWeight: 800, color: col(ex.id) }}>📝 {ex.name}</div>}
                  {blocked && <div className="muted">blocked</div>}
                  {day?.slots.map((x, j) => (
                    <div key={j} style={{ background: col(x.examId), color: '#fff', borderRadius: 4, padding: '0 3px', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${name(x.examId)}: ${x.topic} (${fmtH(x.hours)})`}>
                      {fmtH(x.hours)} {x.review ? '★ review' : x.topic}
                    </div>
                  ))}
                </button>
              )
            })}
          </div>
        </Panel>
        <Panel title="Progress by exam">
          {s.exams.map((e) => {
            const p = plan.planned[e.id] ?? 0
            return (
              <div key={e.id} style={{ marginBottom: 10 }}>
                <Row wrap={false}>
                  <b style={{ flex: 1, color: col(e.id) }}>{e.name}</b>
                  <span>{fmtH(p)} / {fmtH(need(e))} <span className="muted">· {nice(e.date)}</span></span>
                </Row>
                <Bar value={p} max={need(e) || 1} color={col(e.id)} />
              </div>
            )
          })}
        </Panel>
        <Panel title={todayPlan ? `Today · ${nice(T0)}` : 'Upcoming sessions'}>
          <Table
            head={['Day', 'Exam', 'Topic', 'Hours']}
            rows={(todayPlan ? [todayPlan] : plan.days.filter((d) => d.date >= T0 && d.slots.length).slice(0, 3)).flatMap((d) => d.slots.map((x) => [nice(d.date), <b key="e" style={{ color: col(x.examId) }}>{name(x.examId)}</b>, x.topic, fmtH(x.hours)]))}
          />
        </Panel>
      </div>
    </Split>
  )
}
