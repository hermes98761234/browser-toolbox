import { useEffect, useRef, useState } from 'react'
import { BarChart, Btn, Check, color, CsvButton, Donut, JsonButtons, Note, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { byHour, DAY, dailyBySubject, dayKey, mmss, nextPhase, startOfDay, streak, type Phase, type Session } from './lib/pomodoro-focus-timer'

interface Task { id: string; name: string; subject: string; est: number; done: number; closed: boolean }
interface State {
  focus: number; short: number; long: number; every: number; goal: number
  autoBreak: boolean; autoFocus: boolean; sound: boolean; volume: number; notify: boolean
  phase: Phase; running: boolean; endAt: number; left: number; cycle: number; interruptions: number
  taskId: string; tasks: Task[]; log: Session[]; rateId: string
}

const MIN = 60_000
const SUBJECTS = ['Math', 'Biology', 'History', 'Spanish', 'Coding']
const PH: Record<Phase, [string, string]> = { focus: ['Focus', '#ef4444'], short: ['Short break', '#10b981'], long: ['Long break', '#0ea5e9'] }

function sampleLog(): Session[] {
  const out: Session[] = []
  const s0 = startOfDay(Date.now())
  for (let d = 13; d >= 1; d--) {
    const n = d <= 4 ? 6 + (d % 3) : d % 7 === 3 ? 0 : 3 + ((d * 7) % 6)
    for (let i = 0; i < n; i++) {
      const h = 8 + i + (d % 3)
      out.push({ id: uid(), start: s0 - d * DAY + h * 3_600_000, min: 25, subject: SUBJECTS[(d + i) % 5], interruptions: (d + i) % 3 === 0 ? 1 : 0, rating: h < 12 ? 4 + ((d + i) % 2) : 2 + ((d + i) % 3) })
    }
  }
  for (const h of [9, 10]) out.push({ id: uid(), start: s0 + h * 3_600_000, min: 25, subject: 'Math', task: 'Problem set 4', interruptions: 0, rating: 4 })
  return out
}

const TASKS: Task[] = [
  { id: 't1', name: 'Problem set 4', subject: 'Math', est: 4, done: 2, closed: false },
  { id: 't2', name: 'Cell biology chapter 6', subject: 'Biology', est: 3, done: 0, closed: false },
  { id: 't3', name: 'Essay outline: WWI causes', subject: 'History', est: 2, done: 0, closed: false },
  { id: 't4', name: 'Vocabulary deck (50 cards)', subject: 'Spanish', est: 1, done: 0, closed: false },
]

const DEF: State = {
  focus: 25, short: 5, long: 15, every: 4, goal: 6, autoBreak: true, autoFocus: false, sound: true, volume: 0.6, notify: false,
  phase: 'focus', running: false, endAt: 0, left: 25 * MIN, cycle: 2, interruptions: 0, taskId: 't1', tasks: TASKS, log: sampleLog(), rateId: '',
}

function chime(vol: number, kind: Phase) {
  try {
    const ctx = new AudioContext()
    const notes = kind === 'focus' ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25]
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.22
      for (const [mult, amp] of [[1, 1], [2.76, 0.3], [5.4, 0.12]]) {
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.frequency.value = f * mult
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(0.4 * vol * amp, t + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4)
        o.connect(g).connect(ctx.destination)
        o.start(t)
        o.stop(t + 1.5)
      }
    })
    setTimeout(() => void ctx.close(), 2500)
  } catch {
    /* no audio */
  }
}

export default function PomodoroFocusTimer() {
  const [s, set, reset] = useToolState<State>('pomodoro-focus-timer', DEF)
  const [now, setNow] = useState(() => Date.now())
  const sRef = useRef(s)
  useEffect(() => {
    sRef.current = s
  }, [s])

  const len = (p: Phase, st: State = s) => (p === 'focus' ? st.focus : p === 'short' ? st.short : st.long) * MIN
  const left = s.running ? Math.max(0, s.endAt - now) : s.left
  const subjects = [...new Set([...SUBJECTS, ...s.tasks.map((t) => t.subject), ...s.log.map((x) => x.subject)])]
  const subjColor = (sub: string) => color(subjects.indexOf(sub))
  const task = s.tasks.find((t) => t.id === s.taskId)

  useEffect(() => {
    if (!s.running) return
    const tick = () => {
      const t = Date.now()
      setNow(t)
      const cur = sRef.current
      if (!cur.running || t < cur.endAt) return
      // phase finished
      const wasFocus = cur.phase === 'focus'
      const cycle = wasFocus ? cur.cycle + 1 : cur.phase === 'long' ? 0 : cur.cycle
      const next = nextPhase(cur.phase, wasFocus ? cur.cycle + 1 : cur.cycle, cur.every)
      const auto = next === 'focus' ? cur.autoFocus : cur.autoBreak
      const tk = cur.tasks.find((x) => x.id === cur.taskId)
      const sess: Session | null = wasFocus ? { id: uid(), start: cur.endAt - len('focus', cur), min: cur.focus, subject: tk?.subject ?? 'General', task: tk?.name, interruptions: cur.interruptions, rating: 3 } : null
      const nl = len(next, cur)
      sRef.current = { ...cur, running: false }
      set((st) => ({
        ...st,
        phase: next, cycle, running: auto, endAt: t + nl, left: nl, interruptions: 0,
        log: sess ? [...st.log, sess] : st.log,
        rateId: sess ? sess.id : st.rateId,
        tasks: wasFocus ? st.tasks.map((x) => (x.id === st.taskId ? { ...x, done: x.done + 1 } : x)) : st.tasks,
      }))
      if (cur.sound) chime(cur.volume, next)
      if (cur.notify && typeof Notification !== 'undefined' && Notification.permission === 'granted')
        new Notification(wasFocus ? '🍅 Focus session done' : '⏰ Break is over', { body: wasFocus ? `Time for a ${next === 'long' ? 'long' : 'short'} break.` : `Back to ${tk?.name ?? 'work'}.` })
    }
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.running])

  useEffect(() => {
    const base = 'Pomodoro Focus Timer'
    document.title = s.running ? `${mmss(left)} · ${PH[s.phase][0]}` : base
    return () => {
      document.title = base
    }
  }, [left, s.running, s.phase])

  const start = () => set({ running: true, endAt: Date.now() + s.left })
  const pause = () => set({ running: false, left: Math.max(0, s.endAt - Date.now()) })
  const switchTo = (phase: Phase) => set({ phase, running: false, left: len(phase), interruptions: 0 })
  const skip = () => {
    const next = nextPhase(s.phase, s.phase === 'focus' ? s.cycle + 1 : s.cycle, s.every)
    set({ phase: next, running: false, left: len(next), interruptions: 0, cycle: s.phase === 'focus' ? s.cycle + 1 : s.phase === 'long' ? 0 : s.cycle })
  }
  const askNotify = async () => {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    set({ notify: p === 'granted' })
  }

  const today = s.log.filter((x) => dayKey(x.start) === dayKey(now))
  const days = dailyBySubject(s.log, 14, now, subjects)
  const week = days.slice(-7)
  const weekMin = week.reduce((a, d) => a + d.values.reduce((x, y) => x + y, 0), 0)
  const avgRating = s.log.length ? s.log.reduce((a, x) => a + x.rating, 0) / s.log.length : 0
  const hours = byHour(s.log).filter((h) => h.h >= 6 && h.h <= 23)
  const bestHour = [...hours].filter((h) => h.n >= 2).sort((a, b) => b.rating - a.rating)[0]
  const total = len(s.phase)
  const R = 92, C = 2 * Math.PI * R
  const frac = total ? left / total : 0
  const rateSess = s.log.find((x) => x.id === s.rateId)
  const editTask = (id: string, p: Partial<Task>) => set({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) })

  return (
    <Split>
      <div>
        <Panel title="Timer">
          <Seg value={s.phase} onChange={switchTo} options={[['focus', 'Focus'], ['short', 'Short break'], ['long', 'Long break']]} />
          <div style={{ position: 'relative', width: 220, height: 220, margin: '16px auto' }}>
            <svg width={220} height={220}>
              <circle cx={110} cy={110} r={R} fill="none" stroke="var(--line)" strokeWidth={12} />
              <circle cx={110} cy={110} r={R} fill="none" stroke={PH[s.phase][1]} strokeWidth={12} strokeLinecap="round" strokeDasharray={`${frac * C} ${C}`} transform="rotate(-90 110 110)" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 48, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{mmss(left)}</div>
                <div style={{ color: PH[s.phase][1], fontWeight: 700 }}>{PH[s.phase][0]}</div>
                <div className="muted" style={{ fontSize: 12 }}>{s.phase === 'focus' ? `Session ${(s.cycle % s.every) + 1} of ${s.every}` : `${s.cycle === 0 ? s.every : s.cycle} of ${s.every} done`}</div>
              </div>
            </div>
          </div>
          <Row>
            {s.running ? <Btn kind="primary" onClick={pause}>⏸ Pause</Btn> : <Btn kind="primary" onClick={start}>▶ Start</Btn>}
            <Btn onClick={skip}>⏭ Skip</Btn>
            <Btn kind="ghost" onClick={() => switchTo(s.phase)}>↺ Restart</Btn>
            {s.phase === 'focus' && <Btn onClick={() => set({ interruptions: s.interruptions + 1 })} title="Log a distraction without stopping">⚡ Interrupted ({s.interruptions})</Btn>}
          </Row>
          <label className="k-field" style={{ marginTop: 10 }}>
            <span className="k-label">Working on</span>
            <select className="k-select" value={s.taskId} onChange={(e) => set({ taskId: e.target.value })}>
              {s.tasks.filter((t) => !t.closed).map((t) => (
                <option key={t.id} value={t.id}>{t.subject} · {t.name} ({t.done}/{t.est})</option>
              ))}
            </select>
          </label>
        </Panel>
        {rateSess && (
          <Panel title="How focused were you?">
            <p className="muted" style={{ margin: '0 0 8px' }}>{rateSess.subject}{rateSess.task ? ` · ${rateSess.task}` : ''} — rate the session you just finished.</p>
            <Row>
              {[1, 2, 3, 4, 5].map((r) => (
                <Btn key={r} kind={rateSess.rating === r ? 'primary' : 'normal'} onClick={() => set({ log: s.log.map((x) => (x.id === rateSess.id ? { ...x, rating: r } : x)), rateId: '' })}>{'★'.repeat(r)}</Btn>
              ))}
            </Row>
          </Panel>
        )}
        <Panel title="Today's goal">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 26 }}>
            {Array.from({ length: Math.max(s.goal, today.length) }, (_, i) => (
              <span key={i} style={{ opacity: i < today.length ? 1 : 0.2 }} title={today[i]?.subject}>🍅</span>
            ))}
          </div>
          <p className="muted">{today.length} of {s.goal} pomodoros · {today.reduce((a, x) => a + x.min, 0)} min focused</p>
        </Panel>
        <Panel title="Settings">
          <Row>
            <Num label="Focus" value={s.focus} onChange={(focus) => set({ focus, ...(s.phase === 'focus' && !s.running ? { left: focus * MIN } : {}) })} unit="min" min={1} max={180} />
            <Num label="Short break" value={s.short} onChange={(short) => set({ short, ...(s.phase === 'short' && !s.running ? { left: short * MIN } : {}) })} unit="min" min={1} />
            <Num label="Long break" value={s.long} onChange={(long) => set({ long, ...(s.phase === 'long' && !s.running ? { left: long * MIN } : {}) })} unit="min" min={1} />
          </Row>
          <Row>
            <Num label="Long break every" value={s.every} onChange={(every) => set({ every: Math.max(1, Math.round(every)) })} unit="sessions" min={1} />
            <Num label="Daily goal" value={s.goal} onChange={(goal) => set({ goal: Math.max(1, Math.round(goal)) })} unit="🍅" min={1} />
          </Row>
          <Check label="Start breaks automatically" value={s.autoBreak} onChange={(autoBreak) => set({ autoBreak })} />
          <Check label="Start next focus automatically" value={s.autoFocus} onChange={(autoFocus) => set({ autoFocus })} />
          <Check label="Chime" value={s.sound} onChange={(sound) => set({ sound })} />
          {s.sound && <Slider label="Volume" value={s.volume} onChange={(volume) => set({ volume })} min={0.1} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />}
          <Row>
            <Btn onClick={() => chime(s.volume, 'focus')}>🔔 Test chime</Btn>
            {typeof Notification === 'undefined' ? (
              <span className="muted">Notifications not supported</span>
            ) : s.notify && Notification.permission === 'granted' ? (
              <Btn kind="ghost" onClick={() => set({ notify: false })}>🔕 Turn off notifications</Btn>
            ) : (
              <Btn onClick={() => void askNotify()}>🔔 Enable notifications</Btn>
            )}
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Today" value={`${today.length} 🍅`} sub={`${Math.round((today.length / s.goal) * 100)}% of goal`} tone={today.length >= s.goal ? 'good' : 'accent'} />
          <Stat label="Goal streak" value={`${streak(s.log, s.goal, now)} days`} sub={`≥ ${s.goal} per day`} />
          <Stat label="Last 7 days" value={`${(weekMin / 60).toFixed(1)} h`} sub={`${week.reduce((a, d) => a + d.count, 0)} sessions`} />
          <Stat label="Avg focus" value={`${avgRating.toFixed(1)} ★`} sub={bestHour ? `best at ${bestHour.h}:00` : undefined} />
        </Stats>
        <Panel title="Study plan" actions={<Btn onClick={() => set({ tasks: [...s.tasks, { id: uid(), name: 'New task', subject: subjects[0], est: 2, done: 0, closed: false }] })}>+ Task</Btn>}>
          <Table
            head={['Task', 'Subject', 'Est.', 'Done', '', '']}
            rows={s.tasks.map((t) => [
              <input key="n" value={t.name} onChange={(e) => editTask(t.id, { name: e.target.value })} aria-label="Task" style={{ textDecoration: t.closed ? 'line-through' : undefined, minWidth: 140 }} />,
              <input key="s" value={t.subject} list="pft-subjects" onChange={(e) => editTask(t.id, { subject: e.target.value })} aria-label="Subject" style={{ width: 90 }} />,
              <input key="e" type="number" min={1} value={t.est} onChange={(e) => editTask(t.id, { est: Math.max(1, Number(e.target.value) || 1) })} aria-label="Estimate" style={{ width: 52 }} />,
              <b key="d" style={{ color: t.done > t.est ? 'var(--err)' : undefined }}>{t.done}</b>,
              <input key="c" type="checkbox" checked={t.closed} onChange={(e) => editTask(t.id, { closed: e.target.checked })} aria-label="Finished" />,
              <Btn key="x" kind="ghost" onClick={() => set({ tasks: s.tasks.filter((x) => x.id !== t.id) })} title="Remove">✕</Btn>,
            ])}
          />
          <datalist id="pft-subjects">{subjects.map((x) => <option key={x} value={x} />)}</datalist>
          {task && task.done >= task.est && !task.closed && <Note tone="warn">“{task.name}” has used its estimate. Finish it, or raise the estimate honestly — tracking that gap is how estimates improve.</Note>}
        </Panel>
        <Panel title="Focus minutes — last 14 days">
          <BarChart bars={days.map((d) => ({ label: d.date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }), value: d.values }))} stacks={subjects.map((n) => ({ name: n, color: subjColor(n) }))} fy={(v) => `${v}`} />
        </Panel>
        <Split>
          <Panel title="By subject (7 days)">
            <Donut slices={subjects.map((n, i) => ({ label: n, value: week.reduce((a, d) => a + d.values[i], 0), color: subjColor(n) })).filter((x) => x.value > 0)} fv={(v) => `${v} min`} size={170} />
          </Panel>
          <Panel title="Focus quality by hour">
            <BarChart bars={hours.map((h) => ({ label: `${h.h}`, value: +h.rating.toFixed(2), color: h.rating >= 4 ? '#10b981' : h.rating >= 3 ? '#f59e0b' : '#ef4444' }))} height={180} fy={(v) => v.toFixed(1)} />
          </Panel>
        </Split>
        <Panel
          title={`Session log (${s.log.length})`}
          actions={
            <>
              <CsvButton name="pomodoro-log.csv" rows={() => [['Date', 'Start', 'Minutes', 'Subject', 'Task', 'Interruptions', 'Rating'], ...s.log.map((x) => [dayKey(x.start), new Date(x.start).toTimeString().slice(0, 5), x.min, x.subject, x.task ?? '', x.interruptions, x.rating])]} />
              <JsonButtons name="pomodoro-backup.json" data={s} onLoad={(d) => set({ ...d, running: false })} />
              <Btn kind="danger" onClick={() => set({ log: [] })}>Clear log</Btn>
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <Table
            head={['When', 'Subject', 'Task', '⚡', '★']}
            rows={[...s.log].reverse().map((x) => [new Date(x.start).toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' }), <span key="s" style={{ color: subjColor(x.subject), fontWeight: 700 }}>{x.subject}</span>, x.task ?? '—', x.interruptions, '★'.repeat(x.rating)])}
            max={12}
          />
        </Panel>
      </div>
    </Split>
  )
}
