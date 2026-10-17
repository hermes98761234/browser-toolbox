import { useEffect, useRef, useState } from 'react'
import { BarChart, Btn, Check, color, CsvButton, JsonButtons, Note, Num, Panel, Ring, Row, Seg, Split, Stat, Stats, Table, today, uid, useToolState } from '../kit'

interface Kid { id: string; name: string; age: number; weekday: number; weekend: number; bonus: number; bonusDay?: string }
interface Run { kid: string; at: number }
interface State { kids: Kid[]; log: Record<string, Record<string, number>>; run: Run | null; warnAt: number; sound: boolean; sel: string }

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const T0 = today()
const sample = (seed: number, base: number) => Object.fromEntries(Array.from({ length: 6 }, (_, i) => [addDays(T0, -6 + i), Math.round(base * (0.6 + ((seed * (i + 3) * 37) % 11) / 12))]))

const DEF: State = {
  kids: [
    { id: 'k1', name: 'Mia', age: 7, weekday: 60, weekend: 90, bonus: 0 },
    { id: 'k2', name: 'Leo', age: 11, weekday: 90, weekend: 120, bonus: 0 },
  ],
  log: { k1: { ...sample(1, 60), [T0]: 25 }, k2: { ...sample(2, 95), [T0]: 70 } },
  run: null,
  warnAt: 5,
  sound: true,
  sel: 'k1',
}

const isWeekend = (iso: string) => [0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay())
const budgetOf = (k: Kid, iso: string) => (isWeekend(iso) ? k.weekend : k.weekday)
const bonusOf = (k: Kid, iso: string) => (k.bonusDay === iso ? k.bonus : 0)
const mmss = (sec: number) => `${sec < 0 ? '−' : ''}${Math.floor(Math.abs(sec) / 60)}:${String(Math.floor(Math.abs(sec) % 60)).padStart(2, '0')}`
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })

function guidance(age: number) {
  if (age < 2) return 'Under 2: avoid screens except video chats; if introduced at 18–24 months, co-view high-quality content.'
  if (age < 6) return 'Ages 2–5: about 1 hour a day of high-quality programming, watched together where possible (AAP / WHO).'
  return 'Age 6+: consistent limits that protect sleep (9–12 h), activity (60 min/day), homework and family time. No screens in the hour before bed.'
}

function beep(pattern: number[], freq = 880) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    let t = ctx.currentTime
    for (const d of pattern) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = freq
      o.type = 'sine'
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + d)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + d)
      t += d + 0.12
    }
    setTimeout(() => void ctx.close(), (t - ctx.currentTime + 0.5) * 1000)
  } catch {
    /* audio unavailable */
  }
}

export default function ScreenTimePlanner() {
  const [s, set, reset] = useToolState('screen-time-planner', DEF)
  const [now, setNow] = useState(() => Date.now())
  const fired = useRef<{ warn: boolean; end: boolean }>({ warn: false, end: false })
  const t = today()
  const kid = s.kids.find((k) => k.id === s.sel) ?? s.kids[0]
  const runSec = s.run ? Math.max(0, (now - s.run.at) / 1000) : 0
  const usedMin = (k: Kid, iso: string) => (s.log[k.id]?.[iso] ?? 0) + (s.run?.kid === k.id && iso === t ? runSec / 60 : 0)

  useEffect(() => {
    if (!s.run) return
    const h = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(h)
  }, [s.run])

  const runKid = s.run ? s.kids.find((k) => k.id === s.run!.kid) : undefined
  const leftSec = runKid ? (budgetOf(runKid, t) + bonusOf(runKid, t)) * 60 - usedMin(runKid, t) * 60 : 0
  useEffect(() => {
    if (!s.run || !s.sound) return
    if (leftSec <= s.warnAt * 60 && leftSec > 0 && !fired.current.warn) {
      fired.current.warn = true
      beep([0.25, 0.25], 660)
    }
    if (leftSec <= 0 && !fired.current.end) {
      fired.current.end = true
      beep([0.5, 0.5, 0.9], 880)
    }
  }, [leftSec, s.run, s.sound, s.warnAt])

  const start = (k: Kid) => {
    fired.current = { warn: false, end: false }
    const n = Date.now()
    setNow(n)
    set({ run: { kid: k.id, at: n }, sel: k.id })
  }
  const stop = () => {
    if (!s.run) return
    const add = (Date.now() - s.run.at) / 60000
    const id = s.run.kid
    set((st) => ({ ...st, run: null, log: { ...st.log, [id]: { ...st.log[id], [t]: Math.round(((st.log[id]?.[t] ?? 0) + add) * 10) / 10 } } }))
  }
  const addManual = (k: Kid, m: number) => set((st) => ({ ...st, log: { ...st.log, [k.id]: { ...st.log[k.id], [t]: Math.max(0, (st.log[k.id]?.[t] ?? 0) + m) } } }))
  const editKid = (id: string, p: Partial<Kid>) => set({ kids: s.kids.map((k) => (k.id === id ? { ...k, ...p } : k)) })

  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6))
  const weekUsed = kid ? week.reduce((a, d) => a + usedMin(kid, d), 0) : 0
  const weekBudget = kid ? week.reduce((a, d) => a + budgetOf(kid, d), 0) : 0
  const overDays = kid ? week.filter((d) => usedMin(kid, d) > budgetOf(kid, d) + bonusOf(kid, d)).length : 0

  if (!kid) return <Panel title="Kids"><Btn onClick={() => set({ kids: [{ id: uid(), name: 'Child', age: 8, weekday: 60, weekend: 90, bonus: 0 }] })}>+ Add child</Btn></Panel>
  const bonus = bonusOf(kid, t)
  const todayBudget = budgetOf(kid, t) + bonus
  const todayUsed = usedMin(kid, t)
  const left = todayBudget - todayUsed

  return (
    <Split>
      <div>
        <Panel title="Timer">
          <Seg value={kid.id} onChange={(sel) => set({ sel })} options={s.kids.map((k) => [k.id, k.name] as [string, string])} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, margin: '16px 0', flexWrap: 'wrap' }}>
            <Ring value={todayBudget ? todayUsed / todayBudget : 1} size={140} color={left < 0 ? 'var(--err)' : left <= s.warnAt ? 'var(--warn)' : 'var(--accent)'} label={<span style={{ fontSize: 24, fontWeight: 800 }}>{mmss(left * 60)}</span>} />
            <div>
              <div style={{ fontSize: 15 }}><b>{kid.name}</b> has <b>{left >= 0 ? `${Math.floor(left)} min left` : `gone ${Math.ceil(-left)} min over`}</b></div>
              <div className="muted" style={{ fontSize: 13 }}>{Math.round(todayUsed)} of {todayBudget} min used today ({isWeekend(t) ? 'weekend' : 'weekday'} budget{bonus ? ` + ${bonus} bonus` : ''})</div>
              <Row>
                {s.run?.kid === kid.id ? <Btn kind="danger" onClick={stop}>⏸ Stop</Btn> : <Btn kind="primary" onClick={() => { stop(); start(kid) }}>▶ Start screen time</Btn>}
                <Btn kind="ghost" onClick={() => beep([0.2], 660)} title="Test sound">🔔</Btn>
              </Row>
              {s.run && s.run.kid !== kid.id && <p className="muted" style={{ fontSize: 13 }}>Timer running for {runKid?.name}.</p>}
            </div>
          </div>
          {left <= 0 && <Note tone="err">Time's up for today. Agree on a wind-down activity: reading, outdoor play, a board game.</Note>}
          {left > 0 && left <= s.warnAt && <Note tone="warn">Less than {s.warnAt} minutes left — a good moment for a heads-up.</Note>}
          <Row>
            <Btn onClick={() => addManual(kid, 15)}>+15 min used</Btn>
            <Btn onClick={() => addManual(kid, 30)}>+30 min used</Btn>
            <Btn onClick={() => addManual(kid, -15)}>−15 min</Btn>
            <Btn onClick={() => editKid(kid.id, { bonus: bonus + 15, bonusDay: t })}>⭐ +15 bonus</Btn>
            {bonus > 0 && <Btn kind="ghost" onClick={() => editKid(kid.id, { bonus: 0 })}>Clear bonus</Btn>}
          </Row>
        </Panel>
        <Panel title="Settings">
          <Row>
            <Num label="Warn before end" value={s.warnAt} onChange={(warnAt) => set({ warnAt })} unit="min" min={0} max={60} />
            <div style={{ alignSelf: 'end' }}><Check label="Sound warnings (Web Audio)" value={s.sound} onChange={(sound) => set({ sound })} /></div>
          </Row>
          <Table
            head={['Child', 'Age', 'Weekday', 'Weekend', '']}
            rows={s.kids.map((k) => [
              <input key="n" value={k.name} onChange={(e) => editKid(k.id, { name: e.target.value })} aria-label="Name" style={{ width: 90 }} />,
              <input key="a" type="number" min={0} max={18} value={k.age} onChange={(e) => editKid(k.id, { age: Math.max(0, Number(e.target.value) || 0) })} aria-label="Age" style={{ width: 52 }} />,
              <input key="w" type="number" min={0} step={15} value={k.weekday} onChange={(e) => editKid(k.id, { weekday: Math.max(0, Number(e.target.value) || 0) })} aria-label="Weekday minutes" style={{ width: 64 }} />,
              <input key="e" type="number" min={0} step={15} value={k.weekend} onChange={(e) => editKid(k.id, { weekend: Math.max(0, Number(e.target.value) || 0) })} aria-label="Weekend minutes" style={{ width: 64 }} />,
              <Btn key="x" kind="ghost" title="Remove" disabled={s.kids.length < 2} onClick={() => set({ kids: s.kids.filter((x) => x.id !== k.id), sel: s.kids.find((x) => x.id !== k.id)!.id, run: s.run?.kid === k.id ? null : s.run })}>✕</Btn>,
            ])}
          />
          <Row>
            <Btn onClick={() => { const id = uid(); set({ kids: [...s.kids, { id, name: `Child ${s.kids.length + 1}`, age: 8, weekday: 60, weekend: 90, bonus: 0 }], sel: id }) }}>+ Child</Btn>
            <JsonButtons name="screen-time.json" data={s} onLoad={(d) => set({ ...d, run: null })} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
          <Note>{guidance(kid.age)}</Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Today" value={`${Math.round(todayUsed)} / ${todayBudget} min`} tone={left < 0 ? 'bad' : 'good'} />
          <Stat label="Last 7 days" value={`${(weekUsed / 60).toFixed(1)} h`} sub={`budget ${(weekBudget / 60).toFixed(1)} h`} />
          <Stat label="Daily average" value={`${Math.round(weekUsed / 7)} min`} />
          <Stat label="Days over budget" value={overDays} tone={overDays ? 'bad' : 'good'} />
        </Stats>
        <Panel title={`${kid.name}'s week`}>
          <BarChart
            bars={week.map((d) => {
              const u = usedMin(kid, d)
              const b = budgetOf(kid, d)
              return { label: d === t ? 'Today' : day(d), value: [Math.min(u, b), Math.max(0, u - b)] }
            })}
            stacks={[{ name: 'Within budget', color: color(2) }, { name: 'Over budget', color: '#ef4444' }]}
            fy={(v) => `${Math.round(v)}′`}
            height={230}
          />
        </Panel>
        <Panel title="All children, last 7 days" actions={<CsvButton name="screen-time.csv" rows={() => [['Date', ...s.kids.map((k) => k.name)], ...week.map((d) => [d, ...s.kids.map((k) => Math.round(usedMin(k, d)))])]} />}>
          <Table
            head={['Day', ...s.kids.map((k) => k.name)]}
            rows={week.map((d) => [
              <b key="d">{d === t ? 'Today' : `${day(d)} ${d.slice(5)}`}</b>,
              ...s.kids.map((k) => {
                const u = usedMin(k, d), b = budgetOf(k, d)
                return <span key={k.id} style={{ color: u > b ? 'var(--err)' : undefined }}>{Math.round(u)} / {b} min</span>
              }),
            ])}
          />
          <p className="muted" style={{ fontSize: 13 }}>Weekends use the weekend budget. Bonus minutes count only for today. Everything stays in this browser.</p>
        </Panel>
      </div>
    </Split>
  )
}
