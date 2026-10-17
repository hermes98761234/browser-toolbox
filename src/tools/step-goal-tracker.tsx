import { useState } from 'react'
import { BarChart, Btn, CsvButton, JsonButtons, Note, num, Num, Panel, pct, Row, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { monthGrid } from './lib/content-calendar'
import { addDay, localKey, weekday } from './lib/habit-tracker'
import { bestStreak, currentStreak, type Log, monthSummary, rollingAvg, stepsToKcal, stepsToKm, strideCm } from './lib/step-goal-tracker'

interface State { goal: number; heightCm: number; weightKg: number; log: Log }

/** ~100 days of believable history: weekday commute walks, longer weekends, a few lazy days. */
function sample(): State {
  const today = localKey()
  const log: Log = {}
  let r = 17
  for (let i = 1; i <= 100; i++) {
    r = (r * 9301 + 49297) % 233280
    const k = addDay(today, -i)
    const weekend = weekday(k) % 6 === 0
    const base = weekend ? 11500 : 8800
    if (r % 23 === 0 && i > 6) continue // forgot to log
    const v = Math.round((base + (r / 233280 - 0.42) * 7000 + (i < 25 ? 900 : 0)) / 10) * 10
    log[k] = i <= 4 ? Math.max(v, 10000 + ((r % 9) + 1) * 260) : v // a live streak going into today
  }
  log[today] = 6240
  return { goal: 10000, heightCm: 172, weightKg: 70, log }
}
const DEF = sample()

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** SVG progress ring with overflow lap for >100 %. */
function GoalRing({ value, goal, size = 120, label, sub }: { value: number; goal: number; size?: number; label?: string; sub?: string }) {
  const f = goal > 0 ? value / goal : 0
  const sw = Math.max(4, size / 11)
  const r = size / 2 - sw / 2 - 1
  const L = 2 * Math.PI * r
  const c = f >= 1 ? 'var(--ok)' : f >= 0.6 ? 'var(--accent)' : 'var(--warn)'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(f * 100)}% of goal`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={sw} />
      {f > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${Math.min(f, 1) * L} ${L}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
      {f > 1 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#059669" strokeWidth={sw * 0.45} strokeLinecap="round" strokeDasharray={`${Math.min(f - 1, 1) * L} ${L}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
      {label && <text x="50%" y={sub ? '47%' : '54%'} textAnchor="middle" fontSize={size / 6.2} fontWeight={800} fill="var(--fg)">{label}</text>}
      {sub && <text x="50%" y="64%" textAnchor="middle" fontSize={size / 11} fill="var(--muted)">{sub}</text>}
    </svg>
  )
}

export default function StepGoalTracker() {
  const [s, set, reset] = useToolState('step-goal-tracker', DEF)
  const [today] = useState(() => localKey())
  const [date, setDate] = useState(today)
  const [steps, setSteps] = useState(s.log[today] ?? 0)
  const [ym, setYm] = useState(today.slice(0, 7))
  const stride = strideCm(s.heightCm)
  const goal = Math.max(1, s.goal)

  const save = (k: string, v: number) => {
    const log = { ...s.log }
    if (v > 0) log[k] = Math.round(v)
    else delete log[k]
    set({ log })
  }
  const pick = (k: string) => { setDate(k); setSteps(s.log[k] ?? 0) }

  const cur = currentStreak(s.log, goal, today)
  const best = bestStreak(s.log, goal)
  const ms = monthSummary(s.log, goal, ym)
  const avg7 = rollingAvg(s.log, today, 7)
  const todaySteps = s.log[today] ?? 0
  const week = Array.from({ length: 7 }, (_, i) => addDay(today, i - 6))
  const last30 = Array.from({ length: 30 }, (_, i) => addDay(today, i - 29))
  const [y, m] = ym.split('-').map(Number)
  const grid = monthGrid(y, m - 1, true)
  const shift = (d: number) => { const t = new Date(y, m - 1 + d, 1); setYm(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`) }
  const total = Object.values(s.log).reduce((a, v) => a + v, 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Today">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <GoalRing value={todaySteps} goal={goal} size={140} label={num(todaySteps, 0)} sub={`of ${num(goal, 0)}`} />
            <div style={{ flex: 1, minWidth: 140 }}>
              <b style={{ fontSize: 20 }}>{pct(todaySteps / goal, 0)}</b> <span className="muted">of goal</span>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {todaySteps >= goal ? '🎉 Goal reached!' : `${num(goal - todaySteps, 0)} steps to go (≈ ${num(((goal - todaySteps) * stride) / 100000, 1)} km, ${Math.round((goal - todaySteps) / 100)} min brisk walk)`}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>{num(stepsToKm(todaySteps, stride), 2)} km · {num(stepsToKcal(todaySteps, s.weightKg, stride), 0)} kcal</div>
            </div>
          </div>
        </Panel>
        <Panel title="Log steps">
          <Row>
            <Txt label="Date" type="date" value={date} onChange={(d) => d && pick(d)} />
            <Num label="Steps" value={steps} min={0} max={200000} step={100} onChange={setSteps} />
          </Row>
          <Row>
            <Btn kind="primary" onClick={() => save(date, steps)} disabled={steps < 0 || steps > 200000}>Save</Btn>
            {[1000, 2500, 5000].map((d) => <Btn key={d} onClick={() => { const v = (s.log[date] ?? 0) + d; setSteps(v); save(date, v) }}>+{num(d, 0)}</Btn>)}
            {s.log[date] !== undefined && <Btn kind="ghost" onClick={() => { save(date, 0); setSteps(0) }}>Delete</Btn>}
          </Row>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Copy the number from your phone or watch once a day. Tap any calendar day to edit it.</p>
        </Panel>
        <Panel title="Goal & profile">
          <Row>
            <Num label="Daily goal" value={s.goal} min={500} max={100000} step={500} unit="steps" onChange={(goal) => set({ goal })} />
          </Row>
          <Row>
            {[6000, 8000, 10000, 12000].map((g) => <Btn key={g} kind={s.goal === g ? 'primary' : 'normal'} onClick={() => set({ goal: g })}>{num(g, 0)}</Btn>)}
          </Row>
          <Row>
            <Num label="Height" value={s.heightCm} min={80} max={250} unit="cm" onChange={(heightCm) => set({ heightCm })} />
            <Num label="Weight" value={s.weightKg} min={20} max={300} unit="kg" onChange={(weightKg) => set({ weightKg })} />
          </Row>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Estimated stride {num(stride, 0)} cm (0.415 × height) — {num(100000 / stride, 0)} steps ≈ 1 km. Calories ≈ 0.57 kcal per lb per mile; treat as a rough guide.</p>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Current streak" value={`${cur} 🔥`} sub={cur ? 'days at goal' : 'hit the goal to start one'} tone="accent" />
          <Stat label="Best streak" value={best} sub="days" />
          <Stat label="7-day average" value={num(avg7, 0)} sub={avg7 >= goal ? 'above goal' : `${pct(avg7 / goal, 0)} of goal`} tone={avg7 >= goal ? 'good' : undefined} />
          <Stat label="All time" value={`${num(total / 1e6, 2)} M`} sub={`${num(stepsToKm(total, stride), 0)} km walked`} />
        </Stats>

        <Panel title="This week">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
            {week.map((k) => (
              <button key={k} type="button" onClick={() => pick(k)} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer' }}>
                <GoalRing value={s.log[k] ?? 0} goal={goal} size={54} label={s.log[k] ? `${Math.round((s.log[k] / goal) * 100)}` : '–'} />
                <div style={{ fontSize: 12, fontWeight: k === today ? 800 : 500, color: k === today ? 'var(--accent)' : 'var(--muted)' }}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday(k)]}</div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title={`${MONTHS[m - 1]} ${y}`} actions={<><Btn kind="ghost" onClick={() => shift(-1)}>‹</Btn><Btn kind="ghost" onClick={() => setYm(today.slice(0, 7))}>Today</Btn><Btn kind="ghost" onClick={() => shift(1)}>›</Btn></>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="muted" style={{ fontSize: 11.5, textAlign: 'center', fontWeight: 700 }}>{d}</div>)}
            {grid.map((k) => {
              const v = s.log[k]
              const inMonth = k.startsWith(ym)
              const met = v !== undefined && v >= goal
              return (
                <button key={k} type="button" onClick={() => pick(k)} title={v !== undefined ? `${k}: ${num(v, 0)} steps` : k} style={{ opacity: inMonth ? 1 : 0.35, border: `1px solid ${k === date ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, background: met ? 'color-mix(in srgb, var(--ok) 14%, transparent)' : 'var(--panel2)', padding: '3px 0 2px', color: 'inherit', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: k === today ? 800 : 600, color: k === today ? 'var(--accent)' : undefined }}>{+k.slice(8)}</span>
                  {k <= today ? <GoalRing value={v ?? 0} goal={goal} size={30} /> : <span style={{ height: 30 }} />}
                  <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{v !== undefined ? (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v) : ' '}</span>
                </button>
              )
            })}
          </div>
          <Row>
            <span className="muted" style={{ fontSize: 13 }}>
              {ms.logged}/{ms.days} days logged · goal met {ms.goalDays}× · avg {num(ms.avg, 0)} · total {num(ms.total, 0)}
              {ms.best && ` · best ${num(ms.best.steps, 0)} on ${+ms.best.date.slice(8)}`}
            </span>
          </Row>
        </Panel>

        <Panel title="Last 30 days" actions={<>
          <CsvButton name="steps.csv" rows={() => [['Date', 'Steps', 'Km', 'Goal met'], ...Object.keys(s.log).sort().map((k) => [k, s.log[k], +stepsToKm(s.log[k], stride).toFixed(2), s.log[k] >= goal ? 'yes' : 'no'])]} />
          <JsonButtons name="steps.json" data={s} onLoad={(d) => d && typeof d.log === 'object' && set(d)} />
          <Btn kind="ghost" onClick={() => confirm('Replace your log with the sample data?') && reset()}>Sample</Btn>
          <Btn kind="ghost" onClick={() => confirm('Delete every entry?') && set({ log: {} })}>Clear</Btn>
        </>}>
          <BarChart height={200} fy={(v) => (v >= 1000 ? `${num(v / 1000, 1)}k` : num(v, 0))} bars={last30.map((k) => ({ label: `${+k.slice(8)}/${+k.slice(5, 7)}`, value: s.log[k] ?? 0, color: (s.log[k] ?? 0) >= goal ? '#10b981' : '#6366f1' }))} />
          {Object.keys(s.log).length === 0 && <Note>No entries yet — log today’s steps on the left.</Note>}
        </Panel>
      </div>
    </Split>
  )
}
