import { useState } from 'react'
import { BarChart, Bar, Btn, CsvButton, JsonButtons, LineChart, Note, Num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, Txt, today, uid, useToolState } from '../kit'
import { ageWeeks, LEVELS, recommend, sessionMinutes, skillById, SKILLS, skillStat, type Level, type Session } from './lib/puppy-training-planner'

const T = today()
const ago = (d: number) => new Date(Date.parse(T) - d * 86400000).toISOString().slice(0, 10)
const S = (d: number, skill: string, reps: number, hits: number, distraction: Level = 'low', minutes = 5, note = ''): Session => ({ id: uid(), date: ago(d), skill, reps, hits, minutes, distraction, note })
const DEF = {
  name: 'Biscuit',
  birth: ago(77),
  sel: 'sit',
  sessions: [
    S(13, 'marker', 15, 12), S(12, 'marker', 15, 15), S(11, 'name', 10, 7), S(10, 'name', 10, 9), S(9, 'name', 10, 10, 'medium'),
    S(13, 'crate', 5, 3, 'low', 10), S(10, 'crate', 5, 4, 'low', 10), S(6, 'crate', 5, 5, 'low', 15, 'Napped inside with door closed'),
    S(12, 'potty', 6, 3), S(8, 'potty', 6, 5), S(3, 'potty', 6, 6),
    S(11, 'sit', 10, 5), S(9, 'sit', 10, 7), S(7, 'sit', 12, 10), S(5, 'sit', 10, 9), S(3, 'sit', 10, 9, 'medium'), S(1, 'sit', 10, 9, 'medium', 5, 'Sat for the neighbour!'),
    S(6, 'down', 10, 3), S(4, 'down', 10, 4), S(2, 'down', 8, 3, 'low', 5, 'Pops up early'),
    S(8, 'come', 10, 7), S(5, 'come', 10, 8), S(2, 'come', 10, 9),
    S(4, 'touch', 10, 6), S(1, 'touch', 10, 7), S(2, 'leave', 8, 3),
  ] as Session[],
}
const STATUS = { new: ['var(--muted)', 'Not started'], learning: ['var(--err)', 'Learning'], progressing: ['var(--warn)', 'Progressing'], reliable: ['var(--ok)', 'Reliable'] } as const
const KIND = { easier: '🔽', repeat: '🔁', harder: '🔼', start: '🆕', refresh: '♻️' }
const BLANK = { skill: 'sit', date: T, reps: 10, hits: 7, minutes: 5, distraction: 'low' as Level, note: '' }

export default function PuppyTrainingPlanner() {
  const [s, set, reset] = useToolState('puppy-training-planner', DEF)
  const [f, setF] = useState(BLANK)
  const weeks = ageWeeks(s.birth, T)
  const stats = Object.fromEntries(SKILLS.map((k) => [k.id, skillStat(s.sessions, k.id)]))
  const advice = recommend(s.sessions, T)
  const week = s.sessions.filter((x) => Date.parse(T) - Date.parse(x.date) < 7 * 86400000)
  const wReps = week.reduce((a, x) => a + x.reps, 0)
  const wHits = week.reduce((a, x) => a + Math.min(x.hits, x.reps), 0)
  const sel = skillById(s.sel) ?? SKILLS[0]
  const selSessions = s.sessions.filter((x) => x.skill === sel.id).sort((a, b) => a.date.localeCompare(b.date))
  const stages = [...new Set(SKILLS.map((k) => k.stage))]
  const valid = f.reps > 0 && f.hits >= 0 && f.hits <= f.reps && /^\d{4}-\d{2}-\d{2}$/.test(f.date)

  return (
    <Split>
      <div>
        <Panel title="Puppy">
          <Row>
            <Txt label="Name" value={s.name} onChange={(name) => set({ name })} />
            <Txt label="Birth date" type="date" value={s.birth} onChange={(birth) => set({ birth })} />
          </Row>
          <p style={{ margin: '4px 0' }}>{s.name || 'Your puppy'} is <b>{weeks} weeks</b> old. Keep sessions to about <b>{sessionMinutes(weeks)} minutes</b>, 2–4 times a day, and stop while it is still fun.</p>
          {weeks < 16 && <Note tone="warn">Socialisation window (until ~16 weeks): calmly introduce new people, surfaces, sounds and friendly vaccinated dogs every day.</Note>}
        </Panel>
        <Panel title="Log a session">
          <Select label="Skill" value={f.skill} onChange={(skill) => setF({ ...f, skill })} options={SKILLS.map((k) => [k.id, `${k.name} (${k.stage})`] as [string, string])} />
          <Row>
            <Txt label="Date" type="date" value={f.date} onChange={(date) => setF({ ...f, date })} />
            <Num label="Minutes" value={f.minutes} onChange={(minutes) => setF({ ...f, minutes: Math.max(0, minutes) })} min={0} />
          </Row>
          <Row>
            <Num label="Attempts" value={f.reps} onChange={(reps) => setF({ ...f, reps: Math.max(0, Math.round(reps)) })} min={1} step={1} />
            <Num label="Successes" value={f.hits} onChange={(hits) => setF({ ...f, hits: Math.max(0, Math.round(hits)) })} min={0} max={f.reps} step={1} hint={f.reps > 0 ? `${Math.round((Math.min(f.hits, f.reps) / f.reps) * 100)}% success` : ''} />
          </Row>
          <div className="k-label" style={{ marginTop: 6 }}>Distraction level</div>
          <Seg value={f.distraction} onChange={(distraction) => setF({ ...f, distraction })} options={LEVELS.map((l) => [l, l[0].toUpperCase() + l.slice(1)] as [Level, string])} />
          <Txt label="Notes" value={f.note} onChange={(note) => setF({ ...f, note })} placeholder="What helped? What was hard?" />
          <Btn kind="primary" disabled={!valid} onClick={() => { set({ sessions: [...s.sessions, { ...f, id: uid() }], sel: f.skill }); setF({ ...f, note: '' }) }}>+ Save session</Btn>
          {!valid && <p className="muted">Successes must be between 0 and the number of attempts.</p>}
        </Panel>
        <Panel title="Session log" actions={<><CsvButton name="puppy-training.csv" rows={() => [['Date', 'Skill', 'Attempts', 'Successes', 'Success %', 'Minutes', 'Distraction', 'Notes'], ...[...s.sessions].sort((a, b) => b.date.localeCompare(a.date)).map((x) => [x.date, skillById(x.skill)?.name ?? x.skill, x.reps, x.hits, Math.round((x.hits / (x.reps || 1)) * 100), x.minutes, x.distraction, x.note])]} /><JsonButtons name="puppy-training.json" data={s} onLoad={(d) => d && Array.isArray(d.sessions) && set({ ...DEF, ...d })} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Table head={['Date', 'Skill', 'Result', '']} max={12} rows={[...s.sessions].sort((a, b) => b.date.localeCompare(a.date)).map((x) => [
            x.date.slice(5),
            <div key="s"><b>{skillById(x.skill)?.name}</b>{x.note && <div className="muted" style={{ fontSize: 12 }}>{x.note}</div>}</div>,
            <span key="r" style={{ whiteSpace: 'nowrap' }}>{x.hits}/{x.reps} · {x.distraction}</span>,
            <Btn key="x" kind="ghost" onClick={() => set({ sessions: s.sessions.filter((y) => y.id !== x.id) })} title="Delete">✕</Btn>,
          ])} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Sessions (7 days)" value={week.length} sub={`${week.reduce((a, x) => a + x.minutes, 0)} minutes`} />
          <Stat label="Success (7 days)" value={wReps ? pct(wHits / wReps, 0) : '—'} sub={`${wHits} of ${wReps} attempts`} tone="accent" />
          <Stat label="Reliable skills" value={`${SKILLS.filter((k) => stats[k.id].status === 'reliable').length} / ${SKILLS.length}`} sub={`${SKILLS.filter((k) => stats[k.id].status !== 'new').length} started`} tone="good" />
        </Stats>
        <Panel title="Next steps">
          {advice.slice(0, 5).map((a) => (
            <div key={a.skill} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => set({ sel: a.skill })}>
              <span style={{ fontSize: 20 }}>{KIND[a.kind]}</span>
              <span style={{ fontSize: 14 }}>{a.text}</span>
            </div>
          ))}
          {advice.length === 0 && <Note tone="ok">Everything is reliable. Keep practising in new places!</Note>}
        </Panel>
        <Panel title={`${sel.name}: success per session`}>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{sel.how}</p>
          {selSessions.length ? (
            <LineChart series={[{ name: 'Success %', points: selSessions.map((x, i) => [i + 1, Math.round((Math.min(x.hits, x.reps) / x.reps) * 100)] as [number, number]), color: '#10b981', area: true }, { name: 'Goal 80%', points: [[1, 80], [Math.max(2, selSessions.length), 80]], color: '#94a3b8', dashed: true }]} height={200} yMin={0} yMax={100} xLabel="Session #" fx={(v) => String(Math.round(v))} fy={(v) => `${Math.round(v)}%`} />
          ) : <Note>No sessions yet for this skill.</Note>}
        </Panel>
        <Panel title="Skill checklist">
          {stages.map((st) => (
            <div key={st} style={{ marginBottom: 10 }}>
              <div className="k-label">{st}</div>
              {SKILLS.filter((k) => k.stage === st).map((k) => {
                const x = stats[k.id]
                const locked = x.status === 'new' && !k.needs.every((n) => stats[n].status === 'progressing' || stats[n].status === 'reliable')
                return (
                  <div key={k.id} onClick={() => set({ sel: k.id })} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 140px', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 8, cursor: 'pointer', background: s.sel === k.id ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined, opacity: locked ? 0.55 : 1 }}>
                    <span>{x.status === 'reliable' ? '✅' : locked ? '🔒' : '⬜'} {k.name}{locked && <span className="muted" style={{ fontSize: 12 }}> needs {k.needs.map((n) => skillById(n)?.name).join(', ')}</span>}</span>
                    <span><Bar value={x.recent} color={STATUS[x.status][0]} /></span>
                    <span style={{ fontSize: 12, color: STATUS[x.status][0], fontWeight: 700 }}>{STATUS[x.status][1]}{x.proofed ? ` · ${x.proofed}` : ''}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </Panel>
        <Panel title="Recent success rate by skill">
          <BarChart bars={SKILLS.filter((k) => stats[k.id].sessions).map((k) => ({ label: k.name, value: Math.round(stats[k.id].recent * 100), color: STATUS[stats[k.id].status][0] }))} fy={(v) => `${v}%`} height={220} />
        </Panel>
        <Note>Reliable = 80%+ success with at least medium distraction. Change only one “D” at a time (distraction, duration, distance), and if success drops below 50%, make it easier.</Note>
      </div>
    </Split>
  )
}
