import { useMemo, useState } from 'react'
import { BarChart, Btn, CsvButton, JsonButtons, LineChart, Note, num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, today, Txt, uid, useToolState } from '../kit'
import { detectPRs, e1rm, entryVolume, exerciseTrend, sessionSets, sessionVolume, weeklyVolume, type WEntry, type WSession } from './lib/workout-logger'

interface Template { id: string; name: string; exercises: string[] }
interface State {
  unit: 'kg' | 'lb'
  sessions: WSession[]
  templates: Template[]
  draft: WSession
}

const LIB = ['Back squat', 'Bench press', 'Deadlift', 'Overhead press', 'Barbell row', 'Pull-up', 'Romanian deadlift', 'Incline dumbbell press', 'Leg press', 'Lat pulldown', 'Dumbbell curl', 'Triceps pushdown', 'Lunge', 'Hip thrust', 'Calf raise', 'Dip']

const TEMPLATES: Template[] = [
  { id: 'a', name: 'Full body A', exercises: ['Back squat', 'Bench press', 'Barbell row'] },
  { id: 'b', name: 'Full body B', exercises: ['Deadlift', 'Overhead press', 'Lat pulldown'] },
  { id: 'push', name: 'Push', exercises: ['Bench press', 'Overhead press', 'Incline dumbbell press', 'Triceps pushdown'] },
  { id: 'pull', name: 'Pull', exercises: ['Deadlift', 'Barbell row', 'Lat pulldown', 'Dumbbell curl'] },
  { id: 'legs', name: 'Legs', exercises: ['Back squat', 'Romanian deadlift', 'Leg press', 'Calf raise'] },
]

/** Eight weeks of an A/B program with slow linear progression. */
function sample(): WSession[] {
  const out: WSession[] = []
  const start = new Date()
  start.setDate(start.getDate() - 46)
  const base: Record<string, [number, number, number]> = {
    'Back squat': [80, 5, 2.5], 'Bench press': [60, 5, 1.25], 'Barbell row': [55, 8, 1.25],
    Deadlift: [110, 5, 2.5], 'Overhead press': [40, 5, 1], 'Lat pulldown': [45, 10, 1.25],
  }
  for (let i = 0; i < 20; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + Math.floor(i / 3) * 7 + [0, 2, 4][i % 3])
    const t = TEMPLATES[i % 2]
    out.push({
      id: `s${i}`,
      date: d.toISOString().slice(0, 10),
      name: t.name,
      entries: t.exercises.map((ex) => {
        const [w, r, inc] = base[ex]
        const load = w + inc * Math.floor(i / 2) - (i % 7 === 6 ? inc * 2 : 0)
        return { exercise: ex, sets: [0, 1, 2].map((k) => ({ reps: r - (k === 2 && i % 3 === 1 ? 1 : 0), weight: load })) }
      }),
    })
  }
  return out
}

/** New draft from a template, pre-filled with the sets you did last time for each exercise. */
const newDraft = (t?: Template, history: WSession[] = []): WSession => {
  const last = (ex: string) => {
    const k = ex.toLowerCase()
    const hit = [...history].sort((a, b) => b.date.localeCompare(a.date)).flatMap((x) => x.entries).find((e) => e.exercise.toLowerCase() === k)
    return hit ? hit.sets.map((x) => ({ ...x })) : [{ reps: 5, weight: 20 }, { reps: 5, weight: 20 }, { reps: 5, weight: 20 }]
  }
  return { id: uid(), date: today(), name: t?.name ?? 'Workout', entries: (t?.exercises ?? ['Back squat']).map((exercise) => ({ exercise, sets: last(exercise) })) }
}

const SAMPLE = sample()

const DEF: State = { unit: 'kg', sessions: SAMPLE, templates: TEMPLATES, draft: newDraft(TEMPLATES[0], SAMPLE) }

export default function WorkoutLogger() {
  const [s, set, reset] = useToolState('workout-logger', DEF)
  const u = s.unit
  const [pick, setPick] = useState('')
  const [tplName, setTplName] = useState('')
  const d = s.draft
  const setDraft = (draft: WSession) => set({ draft })
  const editEntry = (i: number, e: WEntry) => setDraft({ ...d, entries: d.entries.map((x, j) => (j === i ? e : x)) })

  const prs = useMemo(() => detectPRs(s.sessions), [s.sessions])
  const weeks = useMemo(() => weeklyVolume(s.sessions), [s.sessions])
  const exercises = useMemo(() => [...new Set(s.sessions.flatMap((x) => x.entries.map((e) => e.exercise)))].sort(), [s.sessions])
  const exSel = exercises.includes(pick) ? pick : (exercises[0] ?? '')
  const trend = useMemo(() => exerciseTrend(s.sessions, exSel), [s.sessions, exSel])
  const sorted = [...s.sessions].sort((a, b) => b.date.localeCompare(a.date))
  const lastWeek = weeks[weeks.length - 1]
  const prevWeek = weeks[weeks.length - 2]

  // Previous best for each exercise, to hint while logging.
  const bestOf = (ex: string) => {
    const t = exerciseTrend(s.sessions, ex)
    return t.length ? { top: Math.max(...t.map((x) => x.top)), e1: Math.max(...t.map((x) => x.e1rm)), last: t[t.length - 1] } : null
  }

  const save = () => {
    const clean = { ...d, entries: d.entries.map((e) => ({ ...e, sets: e.sets.filter((x) => x.reps > 0) })).filter((e) => e.exercise.trim() && e.sets.length) }
    if (!clean.entries.length) return
    set({ sessions: [...s.sessions.filter((x) => x.id !== d.id), clean], draft: newDraft(s.templates.find((t) => t.name === d.name), [...s.sessions, clean]) })
  }

  const best = exercises.map((ex) => {
    const t = exerciseTrend(s.sessions, ex)
    const top = t.reduce((a, x) => (x.e1rm > a.e1rm ? x : a), t[0])
    return { ex, top: Math.max(...t.map((x) => x.top)), e1: top.e1rm, date: top.date, n: t.length }
  })

  return (
    <Split>
      <div>
        <Panel title="Log a session" actions={<Seg value={u} onChange={(unit) => set({ unit })} options={[['kg', 'kg'], ['lb', 'lb']]} />}>
          <Row>
            <Txt label="Date" type="date" value={d.date} onChange={(date) => setDraft({ ...d, date })} />
            <Txt label="Name" value={d.name} onChange={(name) => setDraft({ ...d, name })} />
          </Row>
          <Select label="Start from template" value="" onChange={(id) => { const t = s.templates.find((x) => x.id === id); if (t) setDraft({ ...newDraft(t, s.sessions), date: d.date }) }} options={[['', '— choose —'] as const, ...s.templates.map((t) => [t.id, `${t.name} (${t.exercises.length})`] as const)]} />
          {d.entries.map((e, i) => {
            const b = bestOf(e.exercise)
            return (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, marginBottom: 10, background: 'var(--panel)' }}>
                <Row wrap={false}>
                  <input className="k-text" list="wl-ex" value={e.exercise} onChange={(ev) => editEntry(i, { ...e, exercise: ev.target.value })} aria-label="Exercise" style={{ fontWeight: 700 }} />
                  <Btn kind="ghost" title="Remove exercise" onClick={() => setDraft({ ...d, entries: d.entries.filter((_, j) => j !== i) })}>✕</Btn>
                </Row>
                {b && <div className="muted" style={{ fontSize: 12, margin: '4px 0' }}>Last: {b.last.top} {u} · best {b.top} {u} · e1RM {num(b.e1, 1)} {u}</div>}
                {e.sets.map((x, k) => {
                  const isPr = b && x.reps > 0 && (x.weight > b.top || e1rm(x.weight, x.reps) > b.e1 + 1e-9)
                  return (
                    <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                      <span className="muted" style={{ width: 22, fontSize: 12 }}>#{k + 1}</span>
                      <input className="k-text" type="number" min={0} value={x.reps} aria-label="Reps" style={{ width: 70 }} onChange={(ev) => editEntry(i, { ...e, sets: e.sets.map((y, j) => (j === k ? { ...y, reps: Math.max(0, Math.round(Number(ev.target.value) || 0)) } : y)) })} />
                      <span className="muted">×</span>
                      <input className="k-text" type="number" min={0} step="any" value={x.weight} aria-label="Weight" style={{ width: 90 }} onChange={(ev) => editEntry(i, { ...e, sets: e.sets.map((y, j) => (j === k ? { ...y, weight: Math.max(0, Number(ev.target.value) || 0) } : y)) })} />
                      <span className="muted" style={{ fontSize: 12 }}>{u}</span>
                      {isPr && <b style={{ color: 'var(--ok)', fontSize: 12 }}>🏆 PR</b>}
                      <span style={{ flex: 1 }} />
                      <Btn kind="ghost" title="Remove set" onClick={() => editEntry(i, { ...e, sets: e.sets.filter((_, j) => j !== k) })}>−</Btn>
                    </div>
                  )
                })}
                <Row>
                  <Btn onClick={() => editEntry(i, { ...e, sets: [...e.sets, e.sets[e.sets.length - 1] ?? { reps: 5, weight: 20 }] })}>+ Set</Btn>
                  <span className="muted" style={{ fontSize: 12 }}>Volume {num(entryVolume(e), 0)} {u}</span>
                </Row>
              </div>
            )
          })}
          <datalist id="wl-ex">{[...new Set([...LIB, ...exercises])].map((x) => <option key={x} value={x} />)}</datalist>
          <Row>
            <Btn onClick={() => setDraft({ ...d, entries: [...d.entries, { exercise: '', sets: [{ reps: 8, weight: 20 }] }] })}>+ Exercise</Btn>
            <Btn kind="primary" onClick={save} disabled={!d.entries.some((e) => e.exercise.trim() && e.sets.some((x) => x.reps > 0))}>Save session</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 12.5 }}>Session volume: <b>{num(sessionVolume(d), 0)} {u}</b> over {sessionSets(d)} sets.</p>
        </Panel>

        <Panel title="Templates">
          {s.templates.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ flex: 1, fontSize: 13.5 }}><b>{t.name}</b> <span className="muted">{t.exercises.join(', ')}</span></span>
              <Btn kind="ghost" title="Delete template" onClick={() => set({ templates: s.templates.filter((x) => x.id !== t.id) })}>✕</Btn>
            </div>
          ))}
          <div style={{ height: 10 }} />
          <Row>
            <Txt label="Save current exercises as template" value={tplName} placeholder="e.g. Upper day" onChange={setTplName} />
            <Btn disabled={!tplName.trim()} onClick={() => { set({ templates: [...s.templates, { id: uid(), name: tplName.trim(), exercises: d.entries.map((e) => e.exercise).filter(Boolean) }] }); setTplName('') }}>Save</Btn>
          </Row>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Sessions logged" value={s.sessions.length} sub={`${exercises.length} exercises`} />
          <Stat label="Latest week volume" value={`${num(lastWeek?.volume ?? 0, 0)} ${u}`} sub={prevWeek ? `${lastWeek.volume >= prevWeek.volume ? '▲' : '▼'} ${num(Math.abs(lastWeek.volume - prevWeek.volume), 0)} vs prior week` : undefined} tone="accent" />
          <Stat label="PRs set" value={prs.length} sub={prs.length ? `latest ${prs[prs.length - 1].date}` : 'log more sessions'} tone="good" />
        </Stats>

        <Panel title="Weekly volume (sets × reps × weight)">
          <BarChart bars={weeks.map((w) => ({ label: w.week.slice(5), value: w.volume }))} fy={(v) => num(v, 0)} />
        </Panel>

        <Panel title="Exercise progress" actions={<select className="k-select" value={exSel} onChange={(e) => setPick(e.target.value)} aria-label="Exercise">{exercises.map((x) => <option key={x}>{x}</option>)}</select>}>
          {trend.length < 2 ? <Note>Log this exercise at least twice to see a trend.</Note> : (
            <LineChart
              series={[
                { name: 'Estimated 1RM (Epley)', points: trend.map((t) => [Date.parse(t.date), t.e1rm]) },
                { name: 'Top set weight', points: trend.map((t) => [Date.parse(t.date), t.top]), dashed: true },
              ]}
              fx={(v) => new Date(v).toISOString().slice(5, 10)}
              fy={(v) => `${num(v, 1)}`}
              yMin={Math.floor(Math.min(...trend.map((t) => t.top)) * 0.9)}
              yLabel={u}
            />
          )}
        </Panel>

        <Panel title="Personal bests">
          <Table head={['Exercise', 'Heaviest', 'Best e1RM', 'On', 'Sessions']} rows={best.map((b) => [<b key="e">{b.ex}</b>, `${num(b.top, 2)} ${u}`, `${num(b.e1, 1)} ${u}`, b.date, b.n])} />
          {prs.length > 0 && (
            <p className="muted" style={{ fontSize: 12.5 }}>
              Recent PRs: {prs.slice(-5).reverse().map((p) => `${p.exercise} ${p.kind === 'volume' ? 'volume' : p.kind === 'e1rm' ? 'e1RM' : 'weight'} ${num(p.value, 1)} (${p.date})`).join(' · ')}
            </p>
          )}
        </Panel>

        <Panel
          title="History"
          actions={
            <>
              <CsvButton name="workouts.csv" rows={() => [['Date', 'Session', 'Exercise', 'Set', 'Reps', `Weight (${u})`, 'Volume'], ...[...s.sessions].sort((a, b) => a.date.localeCompare(b.date)).flatMap((x) => x.entries.flatMap((e) => e.sets.map((st, k) => [x.date, x.name, e.exercise, k + 1, st.reps, st.weight, st.reps * st.weight])))]} />
              <JsonButtons name="workouts.json" data={s} onLoad={(v) => v && Array.isArray(v.sessions) && set(v)} />
              <Btn kind="ghost" onClick={() => set({ sessions: [] })}>Clear</Btn>
              <Btn kind="ghost" onClick={reset}>Sample</Btn>
            </>
          }
        >
          <Table
            max={30}
            head={['Date', 'Session', 'Exercises', 'Sets', 'Volume', 'PRs', '']}
            rows={sorted.map((x) => {
              const n = prs.filter((p) => p.sessionId === x.id).length
              return [
                x.date, x.name, x.entries.map((e) => e.exercise).join(', '), sessionSets(x), `${num(sessionVolume(x), 0)} ${u}`,
                n ? <b key="p" style={{ color: 'var(--ok)' }}>🏆 {n}</b> : '',
                <span key="a" style={{ whiteSpace: 'nowrap' }}>
                  <Btn kind="ghost" title="Edit" onClick={() => set({ draft: x })}>✎</Btn>
                  <Btn kind="ghost" title="Delete" onClick={() => set({ sessions: s.sessions.filter((y) => y.id !== x.id) })}>✕</Btn>
                </span>,
              ]
            })}
          />
          <Note>Editing a session loads it into the log form; saving replaces it. PRs count when a lift beats its previous best weight, Epley e1RM = w × (1 + reps / 30), or single-session volume.</Note>
        </Panel>
      </div>
    </Split>
  )
}
