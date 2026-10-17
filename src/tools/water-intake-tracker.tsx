import { useEffect, useRef, useState } from 'react'
import { BarChart, Btn, Check, CsvButton, JsonButtons, Note, Num, Panel, Ring, Row, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { dayTotal, isoDay, lastDays, minutesOf, ML_PER_OZ, reminderDue, streak, suggestGoal, type Drink, type Log } from './lib/water-intake-tracker'

type Unit = 'ml' | 'oz'

interface State {
  unit: Unit
  goal: number
  weight: number
  exercise: number
  hot: boolean
  sizes: number[]
  log: Log
  remind: boolean
  every: number
  from: string
  to: string
}

function sampleLog(): Log {
  const log: Log = {}
  const now = new Date()
  const amounts = [2100, 2600, 1800, 2450, 2900, 2500]
  amounts.forEach((total, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i))
    const drinks: Drink[] = []
    let left = total
    let h = 7
    while (left > 0) {
      const ml = Math.min(left, [250, 500, 330, 250][drinks.length % 4])
      drinks.push({ t: `${String(h).padStart(2, '0')}:${drinks.length % 2 ? '45' : '10'}`, ml })
      left -= ml
      h += 2
    }
    log[isoDay(d)] = drinks
  })
  log[isoDay(now)] = [
    { t: '07:30', ml: 250 },
    { t: '09:15', ml: 500 },
    { t: '11:40', ml: 330 },
  ]
  return log
}

const DEF: State = {
  unit: 'ml',
  goal: 2450,
  weight: 70,
  exercise: 0,
  hot: false,
  sizes: [150, 250, 330, 500, 750],
  log: sampleLog(),
  remind: false,
  every: 90,
  from: '08:00',
  to: '21:00',
}

const ICONS = ['🥃', '🥛', '🥤', '🍶', '🧴']
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export default function WaterIntakeTracker() {
  const [s, set, reset] = useToolState('water-intake-tracker', DEF)
  const [custom, setCustom] = useState(200)
  const [perm, setPerm] = useState<string>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  const lastRemind = useRef<number | null>(null)
  const [day] = useState(() => isoDay(new Date()))
  const todays = s.log[day] ?? []
  const total = dayTotal(s.log, day)
  const toU = (ml: number) => (s.unit === 'oz' ? ml / ML_PER_OZ : ml)
  const fmtV = (ml: number) => (s.unit === 'oz' ? `${toU(ml).toFixed(1)} oz` : `${Math.round(ml).toLocaleString('en-US')} ml`)
  const week = lastDays(s.log, day, 7)
  const avg = week.reduce((a, x) => a + x.ml, 0) / 7
  const hit = week.filter((x) => x.ml >= s.goal).length
  const suggested = suggestGoal(s.weight, s.exercise, s.hot)

  const add = (ml: number) => {
    if (!(ml > 0)) return
    set((st) => ({ ...st, log: { ...st.log, [day]: [...(st.log[day] ?? []), { t: hhmm(new Date()), ml: Math.round(ml) }] } }))
    lastRemind.current = null
  }
  const removeAt = (i: number) => set((st) => ({ ...st, log: { ...st.log, [day]: (st.log[day] ?? []).filter((_, j) => j !== i) } }))

  // Reminder loop (runs only while the page is open).
  useEffect(() => {
    if (!s.remind) return
    const tick = () => {
      const now = new Date()
      const nowMin = now.getHours() * 60 + now.getMinutes()
      const drinks = s.log[isoDay(now)] ?? []
      const lastDrink = drinks.length ? Math.max(...drinks.map((d) => minutesOf(d.t))) : null
      const last = Math.max(lastDrink ?? -1, lastRemind.current ?? -1)
      if (reminderDue(nowMin, last < 0 ? null : last, s.every, s.from, s.to)) {
        lastRemind.current = nowMin
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('💧 Time for some water', { body: `You're at ${fmtV(dayTotal(s.log, isoDay(now)))} of ${fmtV(s.goal)} today.` })
          const ctx = new AudioContext()
          const o = ctx.createOscillator()
          const g = ctx.createGain()
          o.frequency.value = 880
          g.gain.setValueAtTime(0.15, ctx.currentTime)
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
          o.connect(g).connect(ctx.destination)
          o.start()
          o.stop(ctx.currentTime + 0.6)
        } catch {
          /* notifications or audio unavailable */
        }
      }
    }
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  })

  const askPerm = async () => {
    if (typeof Notification === 'undefined') return
    setPerm(await Notification.requestPermission())
  }

  const days = Object.keys(s.log).sort()
  return (
    <Split>
      <div>
        <Panel title="Add a drink" actions={<Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['ml', 'ml'], ['oz', 'oz']]} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 }}>
            {s.sizes.map((ml, i) => (
              <button key={i} type="button" className="k-btn" onClick={() => add(ml)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 6px', gap: 4 }}>
                <span style={{ fontSize: 28 }}>{ICONS[i % ICONS.length]}</span>
                <b>+{fmtV(ml)}</b>
              </button>
            ))}
          </div>
          <Row>
            <Num label="Custom amount" value={Math.round(toU(custom) * 10) / 10} onChange={(v) => setCustom(s.unit === 'oz' ? v * ML_PER_OZ : v)} unit={s.unit} min={1} />
            <div style={{ alignSelf: 'end' }}>
              <Btn kind="primary" onClick={() => add(custom)}>
                + Add
              </Btn>
            </div>
          </Row>
        </Panel>
        <Panel title="Daily goal">
          <Row>
            <Num label="Goal" value={Math.round(toU(s.goal))} onChange={(v) => set({ goal: Math.max(1, s.unit === 'oz' ? v * ML_PER_OZ : v) })} unit={s.unit} min={1} />
            <Num label="Body weight" value={s.weight} onChange={(weight) => set({ weight })} unit="kg" min={20} max={300} />
            <Num label="Exercise today" value={s.exercise} onChange={(exercise) => set({ exercise })} unit="min" min={0} />
          </Row>
          <Check label="Hot or humid weather" value={s.hot} onChange={(hot) => set({ hot })} />
          <Row>
            <span className="muted">
              Suggested: <b>{fmtV(suggested)}</b> (35 ml/kg, +350 ml per 30 min exercise{s.hot ? ', +500 ml heat' : ''})
            </span>
            <Btn kind="ghost" disabled={suggested === s.goal} onClick={() => set({ goal: suggested })}>
              Use suggestion
            </Btn>
          </Row>
          <Note>Food provides roughly 20% of daily water, and tea, coffee and milk count too. Needs vary with health conditions, so follow medical advice if you have one.</Note>
        </Panel>
        <Panel title="Reminders">
          <Check label="Remind me while this page is open" value={s.remind} onChange={(remind) => set({ remind })} />
          <Row>
            <Num label="Every" value={s.every} onChange={(every) => set({ every: Math.max(10, every) })} unit="min" min={10} />
            <Txt label="From" type="time" value={s.from} onChange={(from) => set({ from })} />
            <Txt label="Until" type="time" value={s.to} onChange={(to) => set({ to })} />
          </Row>
          {perm === 'unsupported' ? (
            <Note tone="warn">This browser has no Notifications API, so reminders only play a chime.</Note>
          ) : perm !== 'granted' ? (
            <Row>
              <span className="muted">Notifications: {perm}. Without permission you get a chime only.</span>
              <Btn onClick={askPerm}>Allow notifications</Btn>
            </Row>
          ) : (
            <Note tone="ok">Notifications allowed. A reminder fires {s.every} min after your last drink, between {s.from} and {s.to}.</Note>
          )}
          <p className="muted" style={{ fontSize: 13 }}>Browsers stop timers in closed tabs, so keep this tab open (it can be in the background).</p>
        </Panel>
      </div>
      <div>
        <Panel title="Today">
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <Ring value={Math.min(1, total / s.goal)} size={150} color={total >= s.goal ? 'var(--ok)' : 'var(--accent)'} label={<span style={{ textAlign: 'center' }}><b style={{ fontSize: 20 }}>{fmtV(total)}</b><br /><span className="muted" style={{ fontSize: 12 }}>of {fmtV(s.goal)}</span></span>} />
            <div style={{ flex: 1, minWidth: 180 }}>
              {total >= s.goal ? <Note tone="ok">Goal reached. Nice work! 🎉</Note> : <p style={{ margin: '0 0 8px' }}>{fmtV(s.goal - total)} to go, about {Math.ceil((s.goal - total) / 250)} glasses of 250 ml.</p>}
              <Table
                head={['Time', 'Amount', '']}
                rows={todays.map((d, i) => [d.t, fmtV(d.ml), <Btn key="x" kind="ghost" title="Remove" onClick={() => removeAt(i)}>✕</Btn>]).reverse()}
                max={6}
              />
              {!todays.length && <p className="muted">Nothing logged yet today.</p>}
            </div>
          </div>
        </Panel>
        <Stats>
          <Stat label="7-day average" value={fmtV(avg)} sub={`${Math.round((avg / s.goal) * 100)}% of goal`} />
          <Stat label="Goal days this week" value={`${hit} / 7`} tone={hit >= 5 ? 'good' : undefined} />
          <Stat label="Streak" value={`${streak(s.log, day, s.goal)} d`} tone="accent" />
        </Stats>
        <Panel
          title="Last 7 days"
          actions={
            <>
              <CsvButton name="water-log.csv" rows={() => [['Date', 'Time', s.unit], ...days.flatMap((d) => s.log[d].map((x) => [d, x.t, Math.round(toU(x.ml) * 10) / 10]))]} />
              <JsonButtons name="water-log.json" data={s} onLoad={(d) => set(d)} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <BarChart bars={week.map((w) => ({ label: new Date(w.day + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' }), value: Math.round(toU(w.ml)), color: w.ml >= s.goal ? '#10b981' : '#0ea5e9' }))} fy={(v) => `${Math.round(v)}`} />
          <p className="muted" style={{ fontSize: 13 }}>Green bars met the goal of {fmtV(s.goal)}.</p>
        </Panel>
      </div>
    </Split>
  )
}
