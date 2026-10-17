import { useMemo, useState } from 'react'
import { Btn, color, JsonButtons, Panel, pct, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { addDay, completionRate, currentStreak, localKey, longestStreak, weekday } from './lib/habit-tracker'

interface Habit { id: string; name: string; icon: string; color: string; schedule: number[]; done: string[] }
interface State { habits: Habit[] }

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WDL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** ~5 months of believable history: streaks with occasional misses. */
function sample(): State {
  const today = localKey()
  const mk = (name: string, icon: string, c: number, schedule: number[], p: number, seed: number): Habit => {
    const done: string[] = []
    let r = seed
    for (let i = 1; i < 150; i++) {
      const k = addDay(today, -i)
      r = (r * 9301 + 49297) % 233280
      if ((!schedule.length || schedule.includes(weekday(k))) && r / 233280 < p + (i < 30 ? 0.08 : 0)) done.push(k)
    }
    return { id: uid(), name, icon, color: color(c), schedule, done }
  }
  return {
    habits: [
      mk('Drink 2 L of water', '💧', 1, [], 0.82, 7),
      mk('Read 20 pages', '📚', 0, [], 0.7, 3),
      mk('Workout', '🏋️', 2, [1, 3, 5], 0.85, 11),
      mk('No phone after 10 pm', '📵', 5, [], 0.55, 5),
      mk('Meditate', '🧘', 3, [], 0.6, 13),
    ],
  }
}
const DEF = sample()
const ICONS = ['✅', '💧', '📚', '🏋️', '🧘', '🏃', '🥗', '😴', '✍️', '🎸', '🧹', '💊', '📵', '🌱', '💰', '🗣️']

export default function HabitTracker() {
  const [s, set, reset] = useToolState('habit-tracker', DEF)
  const [today] = useState(() => localKey())
  const [view, setView] = useState('all')
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('✅')
  const [sched, setSched] = useState<number[]>([])
  const sets = useMemo(() => new Map(s.habits.map((h) => [h.id, new Set(h.done)])), [s.habits])
  const week = Array.from({ length: 7 }, (_, i) => addDay(today, i - 6))
  const isDue = (h: Habit, k: string) => !h.schedule.length || h.schedule.includes(weekday(k))
  const toggle = (id: string, k: string) =>
    set({ habits: s.habits.map((h) => (h.id === id ? { ...h, done: h.done.includes(k) ? h.done.filter((x) => x !== k) : [...h.done, k] } : h)) })
  const edit = (id: string, p: Partial<Habit>) => set({ habits: s.habits.map((h) => (h.id === id ? { ...h, ...p } : h)) })

  const stats = s.habits.map((h) => {
    const d = sets.get(h.id)!
    return { h, cur: currentStreak(d, h.schedule, today), best: longestStreak(d, h.schedule, today), r30: completionRate(d, h.schedule, today, 30), total: d.size }
  })
  const dueToday = s.habits.filter((h) => isDue(h, today))
  const doneToday = dueToday.filter((h) => sets.get(h.id)!.has(today)).length
  const avg30 = stats.length ? stats.reduce((a, x) => a + x.r30, 0) / stats.length : 0
  const top = stats.reduce<(typeof stats)[number] | null>((a, x) => (!a || x.cur > a.cur ? x : a), null)

  return (
    <Split wide="left">
      <div>
        <Panel title="Last 7 days" actions={<span className="muted" style={{ fontSize: 12.5 }}>Tap a circle to mark done</span>}>
          <Table
            head={['Habit', ...week.map((k) => <span key={k} style={{ display: 'block', textAlign: 'center', fontWeight: k === today ? 800 : undefined, color: k === today ? 'var(--accent)' : undefined }}>{WDL[weekday(k)]}<br />{k.slice(8)}</span>), '🔥']}
            rows={stats.map(({ h, cur }) => [
              <span key="n" style={{ fontWeight: 650 }}>{h.icon} {h.name}</span>,
              ...week.map((k) => {
                const on = sets.get(h.id)!.has(k), due = isDue(h, k)
                return (
                  <button
                    key={k}
                    type="button"
                    aria-label={`${h.name} ${k}`}
                    aria-pressed={on}
                    onClick={() => toggle(h.id, k)}
                    style={{ display: 'block', margin: '0 auto', width: 30, height: 30, borderRadius: 99, border: `2px solid ${due ? h.color : 'var(--line)'}`, background: on ? h.color : 'transparent', color: '#fff', fontWeight: 800, opacity: due || on ? 1 : 0.45 }}
                  >
                    {on ? '✓' : ''}
                  </button>
                )
              }),
              <b key="s" style={{ color: cur ? 'var(--warn)' : 'var(--muted)' }}>{cur}</b>,
            ])}
          />
        </Panel>

        <Panel title="Calendar heatmap" actions={<Select label="" value={view} onChange={setView} options={[['all', 'All habits'], ...s.habits.map((h) => [h.id, `${h.icon} ${h.name}`] as [string, string])]} />}>
          <Heatmap today={today} habits={view === 'all' ? s.habits : s.habits.filter((h) => h.id === view)} sets={sets} onToggle={view === 'all' ? undefined : (k) => toggle(view, k)} />
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Today" value={`${doneToday} / ${dueToday.length}`} sub={dueToday.length && doneToday === dueToday.length ? 'all done 🎉' : 'habits due'} tone="accent" />
          <Stat label="Top streak" value={top ? `${top.cur} 🔥` : '—'} sub={top?.h.name} />
          <Stat label="30-day rate" value={pct(avg30, 0)} tone={avg30 >= 0.8 ? 'good' : undefined} />
        </Stats>

        <Panel title="Habits" actions={<><JsonButtons name="habits.json" data={s} onLoad={(d) => d && Array.isArray(d.habits) && set(d)} /><Btn kind="ghost" onClick={reset}>Sample</Btn></>}>
          {stats.map(({ h, cur, best, r30, total }) => (
            <div key={h.id} style={{ borderLeft: `4px solid ${h.color}`, padding: '6px 10px', marginBottom: 8, background: 'var(--panel)', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <select value={h.icon} aria-label="Icon" onChange={(e) => edit(h.id, { icon: e.target.value })} style={{ border: 0, background: 'none', fontSize: 18 }}>{ICONS.map((i) => <option key={i}>{i}</option>)}</select>
                <input value={h.name} aria-label="Habit name" onChange={(e) => edit(h.id, { name: e.target.value })} style={{ flex: 1, border: 0, background: 'none', fontWeight: 700, minWidth: 0 }} />
                <input type="color" value={h.color} aria-label="Colour" onChange={(e) => edit(h.id, { color: e.target.value })} style={{ width: 28, height: 24, border: 0, background: 'none', padding: 0 }} />
                <Btn kind="ghost" title="Delete habit" onClick={() => confirm(`Delete “${h.name}” and its history?`) && set({ habits: s.habits.filter((x) => x.id !== h.id) })}>✕</Btn>
              </div>
              <div style={{ display: 'flex', gap: 3, margin: '4px 0' }}>
                {WD.map((w, i) => {
                  const on = !h.schedule.length || h.schedule.includes(i)
                  return <button key={i} type="button" title={WDL[i]} onClick={() => {
                    const cur = h.schedule.length ? h.schedule : [0, 1, 2, 3, 4, 5, 6]
                    const next = on ? cur.filter((x) => x !== i) : [...cur, i].sort()
                    if (next.length) edit(h.id, { schedule: next.length === 7 ? [] : next })
                  }} style={{ width: 24, height: 22, borderRadius: 6, border: '1px solid var(--line)', fontSize: 11, fontWeight: 700, background: on ? h.color : 'transparent', color: on ? '#fff' : 'var(--muted)' }}>{w}</button>
                })}
              </div>
              <span className="muted" style={{ fontSize: 12.5 }}>🔥 {cur} now · best {best} · {pct(r30, 0)} last 30 days · {total} check-ins</span>
            </div>
          ))}
        </Panel>

        <Panel title="New habit">
          <Row>
            <Select label="Icon" value={icon} onChange={setIcon} options={ICONS} />
            <Txt label="Name" value={name} placeholder="e.g. Stretch 10 min" onChange={setName} />
          </Row>
          <span className="k-label">Due on</span>
          <div style={{ display: 'flex', gap: 3, margin: '4px 0 10px' }}>
            {WD.map((w, i) => {
              const on = !sched.length || sched.includes(i)
              return <button key={i} type="button" className={`k-btn ${on ? 'primary' : ''}`} style={{ padding: '4px 8px' }} onClick={() => { const cur = sched.length ? sched : [0, 1, 2, 3, 4, 5, 6]; const next = on ? cur.filter((x) => x !== i) : [...cur, i].sort(); if (next.length) setSched(next.length === 7 ? [] : next) }}>{w}</button>
            })}
          </div>
          <Btn kind="primary" disabled={!name.trim()} onClick={() => { set({ habits: [...s.habits, { id: uid(), name: name.trim(), icon, color: color(s.habits.length), schedule: sched, done: [] }] }); setName(''); setSched([]) }}>+ Add habit</Btn>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Streaks only count the days a habit is due, so a Mon/Wed/Fri workout keeps its streak over the weekend. An unfinished today never breaks a streak.</p>
        </Panel>
      </div>
    </Split>
  )
}

function Heatmap({ today, habits, sets, onToggle }: { today: string; habits: Habit[]; sets: Map<string, Set<string>>; onToggle?: (k: string) => void }) {
  const weeks = 26
  const end = addDay(today, 6 - weekday(today))
  const start = addDay(end, -(weeks * 7 - 1))
  const cell = 15, gap = 3, L = 26, T = 18
  const W = L + weeks * (cell + gap), H = T + 7 * (cell + gap)
  const single = habits.length === 1 ? habits[0] : null
  const base = single?.color ?? '#10b981'
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDay(start, i))
  const value = (k: string) => {
    const due = habits.filter((h) => !h.schedule.length || h.schedule.includes(weekday(k)))
    const n = habits.filter((h) => sets.get(h.id)?.has(k)).length
    return { n, due: due.length, f: due.length ? Math.min(1, n / due.length) : n ? 1 : 0 }
  }
  let lastMonth = ''
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 420, height: 'auto' }} role="img" aria-label="Habit heatmap">
        {[1, 3, 5].map((d) => <text key={d} x={0} y={T + d * (cell + gap) + 11} fontSize={10} fill="var(--muted)">{WDL[d]}</text>)}
        {days.map((k, i) => {
          const col = Math.floor(i / 7), row = i % 7
          const x = L + col * (cell + gap), y = T + row * (cell + gap)
          const future = k > today
          const v = value(k)
          const m = k.slice(0, 7)
          const label = row === 0 && m !== lastMonth && k.slice(8) <= '07' ? ((lastMonth = m), new Date(k + 'T00:00:00Z').toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })) : null
          return (
            <g key={k}>
              {label && <text x={x} y={11} fontSize={10} fill="var(--muted)">{label}</text>}
              <rect
                x={x} y={y} width={cell} height={cell} rx={3}
                fill={future ? 'transparent' : v.f > 0 ? base : 'var(--line)'}
                fillOpacity={v.f > 0 ? 0.25 + 0.75 * v.f : 1}
                stroke={k === today ? 'var(--fg)' : 'none'}
                style={{ cursor: onToggle && !future ? 'pointer' : undefined }}
                onClick={() => onToggle && !future && onToggle(k)}
              >
                <title>{`${k}: ${single ? (v.n ? 'done' : 'not done') : `${v.n}/${v.due} done`}`}</title>
              </rect>
            </g>
          )
        })}
      </svg>
      <div className="k-legend">
        <span className="muted">Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}><i style={{ background: f ? base : 'var(--line)', opacity: f ? 0.25 + 0.75 * f : 1 }} /></span>)}
        <span className="muted">More{onToggle ? ' · click a day to toggle' : ''}</span>
      </div>
    </div>
  )
}
