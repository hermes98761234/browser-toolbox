import { useEffect, useRef, useState } from 'react'
import { BarChart, Btn, Check, CsvButton, Donut, JsonButtons, Note, Num, Panel, Ring, Row, Seg, Slider, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'

type Phase = 'focus' | 'short' | 'long'
interface Session { id: string; start: number; end: number; min: number; task: string }
interface State {
  focus: number; short: number; long: number; every: number
  autoBreak: boolean; autoFocus: boolean; sound: boolean; volume: number
  phase: Phase; running: boolean; endAt: number; left: number; done: number
  task: string; history: Session[]
}

const MIN = 60_000
const DAY = 86_400_000
const nowMs = () => Date.now()
const PH: Record<Phase, { label: string; color: string }> = {
  focus: { label: 'Focus', color: '#ef4444' },
  short: { label: 'Short break', color: '#10b981' },
  long: { label: 'Long break', color: '#0ea5e9' },
}

function sample(): Session[] {
  const out: Session[] = []
  const tasks = ['Writing report', 'Code review', 'Study: Spanish', 'Email']
  const d0 = new Date()
  d0.setHours(0, 0, 0, 0)
  for (let d = 6; d >= 1; d--) {
    const n = 3 + ((d * 5) % 6)
    let t = d0.getTime() - d * DAY + 9 * 3_600_000
    for (let i = 0; i < n; i++) {
      out.push({ id: uid(), start: t, end: t + 25 * MIN, min: 25, task: tasks[(d + i) % tasks.length] })
      t += (i % 4 === 3 ? 45 : 30) * MIN
    }
  }
  const now = Date.now()
  for (const ago of [150, 115, 80]) out.push({ id: uid(), start: now - ago * MIN, end: now - (ago - 25) * MIN, min: 25, task: tasks[ago % 4] })
  return out
}

const DEF: State = {
  focus: 25, short: 5, long: 15, every: 4, autoBreak: true, autoFocus: false, sound: true, volume: 0.5,
  phase: 'focus', running: false, endAt: 0, left: 25 * MIN, done: 0, task: 'Writing report', history: sample(),
}

let audio: AudioContext | null = null
function chime(volume: number, notes: number[]) {
  try {
    audio ??= new AudioContext()
    const ctx = audio
    notes.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      const t = ctx.currentTime + i * 0.22
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.4 * volume, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 1.3)
    })
  } catch {
    /* audio unavailable */
  }
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
const dayKey = (t: number) => new Date(t).toDateString()

export default function PomodoroTimer() {
  const [s, set, reset] = useToolState('pomodoro-timer', DEF)
  const [now, setNow] = useState(nowMs)
  const [perm, setPerm] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission))
  const sRef = useRef(s)
  useEffect(() => {
    sRef.current = s
  })
  const len = (p: Phase, st: State = s) => (p === 'focus' ? st.focus : p === 'short' ? st.short : st.long) * MIN
  const left = s.running ? Math.max(0, s.endAt - now) : s.left

  useEffect(() => {
    if (!s.running) return
    const id = setInterval(() => {
      const t = nowMs()
      setNow(t)
      const cur = sRef.current
      if (!cur.running || t < cur.endAt) return
      // phase finished
      const wasFocus = cur.phase === 'focus'
      const done = wasFocus ? cur.done + 1 : cur.done
      const next: Phase = wasFocus ? (done % Math.max(1, cur.every) === 0 ? 'long' : 'short') : 'focus'
      const auto = next === 'focus' ? cur.autoFocus : cur.autoBreak
      const nextLen = (next === 'focus' ? cur.focus : next === 'short' ? cur.short : cur.long) * MIN
      if (cur.sound) chime(cur.volume, wasFocus ? [784, 659, 523] : [523, 659, 784])
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(wasFocus ? 'Focus session complete 🍅' : 'Break is over', { body: wasFocus ? `Time for a ${PH[next].label.toLowerCase()}.` : `Back to: ${cur.task || 'focus'}` })
        } catch {
          /* some browsers require a service worker */
        }
      }
      set((x) => ({
        ...x,
        phase: next,
        done,
        running: auto,
        endAt: auto ? t + nextLen : 0,
        left: nextLen,
        history: wasFocus ? [...x.history, { id: uid(), start: x.endAt - x.focus * MIN, end: x.endAt, min: x.focus, task: x.task.trim() || 'Untitled' }] : x.history,
      }))
    }, 250)
    return () => clearInterval(id)
  }, [s.running, set])

  useEffect(() => {
    const old = document.title
    return () => {
      document.title = old
    }
  }, [])
  useEffect(() => {
    if (s.running) document.title = `${mmss(left)} · ${PH[s.phase].label}`
  }, [left, s.running, s.phase])

  const start = () => {
    const t = nowMs()
    setNow(t)
    set({ running: true, endAt: t + s.left })
  }
  const pause = () => {
    const t = nowMs()
    setNow(t)
    set({ running: false, left: Math.max(0, s.endAt - t) })
  }
  const switchTo = (phase: Phase) => set({ phase, running: false, left: len(phase) })
  const skip = () => {
    const next: Phase = s.phase === 'focus' ? ((s.done + 1) % s.every === 0 ? 'long' : 'short') : 'focus'
    set({ phase: next, running: false, left: len(next), done: s.phase === 'focus' ? s.done + 1 : s.done })
  }
  const setLen = (p: Phase, v: number) => {
    const m = Math.min(180, Math.max(1, v))
    const patch: Partial<State> = p === 'focus' ? { focus: m } : p === 'short' ? { short: m } : { long: m }
    set({ ...patch, ...(s.phase === p && !s.running ? { left: m * MIN } : {}) })
  }

  const today = s.history.filter((h) => dayKey(h.start) === dayKey(now))
  const todayMin = today.reduce((a, h) => a + h.min, 0)
  const days = Array.from({ length: 7 }, (_, i) => now - (6 - i) * DAY)
  let streak = 0
  for (let d = 0; d < 365; d++) {
    const k = dayKey(now - d * DAY)
    if (s.history.some((h) => dayKey(h.start) === k)) streak++
    else if (d > 0) break
  }
  const byTask = new Map<string, number>()
  for (const h of s.history.filter((h) => h.start > now - 7 * DAY)) byTask.set(h.task, (byTask.get(h.task) ?? 0) + h.min)
  const total = len(s.phase)
  const recent = [...s.history].sort((a, b) => b.start - a.start)

  return (
    <Split wide="left">
      <div>
        <Panel title="Timer" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <div style={{ textAlign: 'center' }}>
            <Seg value={s.phase} onChange={switchTo} options={[['focus', '🍅 Focus'], ['short', 'Short break'], ['long', 'Long break']]} />
            <div style={{ display: 'grid', placeItems: 'center', margin: '8px 0 12px' }}>
              <Ring value={1 - left / (total || 1)} size={240} color={PH[s.phase].color} label={<span style={{ fontSize: 48, fontVariantNumeric: 'tabular-nums' }}>{mmss(left)}<div style={{ fontSize: 14, color: 'var(--muted)' }}>{PH[s.phase].label}</div></span>} />
            </div>
            <Row>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', width: '100%' }}>
                {s.running ? <Btn kind="primary" onClick={pause}>⏸ Pause</Btn> : <Btn kind="primary" onClick={start}>▶ {s.left < total ? 'Resume' : 'Start'}</Btn>}
                <Btn onClick={() => set({ running: false, left: total })}>↺ Restart</Btn>
                <Btn onClick={skip}>⏭ Skip</Btn>
              </div>
            </Row>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '12px 0 4px' }} aria-label="Sessions in this set">
              {Array.from({ length: s.every }, (_, i) => (
                <span key={i} style={{ width: 14, height: 14, borderRadius: 14, background: i < s.done % s.every ? PH.focus.color : 'var(--line)' }} />
              ))}
            </div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>{s.every - (s.done % s.every)} focus session(s) until a long break · {s.done} completed this run</p>
          </div>
          <Txt label="What are you working on?" value={s.task} onChange={(task) => set({ task })} placeholder="Task name (used in stats)" />
        </Panel>
        <Panel title="Settings">
          <Row>
            <Num label="Focus" value={s.focus} onChange={(v) => setLen('focus', v)} unit="min" min={1} max={180} />
            <Num label="Short break" value={s.short} onChange={(v) => setLen('short', v)} unit="min" min={1} max={180} />
            <Num label="Long break" value={s.long} onChange={(v) => setLen('long', v)} unit="min" min={1} max={180} />
            <Num label="Long break every" value={s.every} onChange={(v) => set({ every: Math.max(1, Math.min(12, Math.round(v))) })} unit="sessions" min={1} max={12} step={1} />
          </Row>
          <Row>
            {([['Classic 25/5', 25, 5, 15], ['Long focus 50/10', 50, 10, 30], ['Short 15/3', 15, 3, 10], ['Ultradian 90/20', 90, 20, 30]] as const).map(([n, f, sh, l]) => (
              <Btn key={n} onClick={() => set({ focus: f, short: sh, long: l, ...(s.running ? {} : { left: (s.phase === 'focus' ? f : s.phase === 'short' ? sh : l) * MIN }) })}>{n}</Btn>
            ))}
          </Row>
          <div>
            <Check label="Start breaks automatically" value={s.autoBreak} onChange={(autoBreak) => set({ autoBreak })} />
            <Check label="Start focus after a break automatically" value={s.autoFocus} onChange={(autoFocus) => set({ autoFocus })} />
            <Check label="Chime" value={s.sound} onChange={(sound) => set({ sound })} />
          </div>
          {s.sound && (
            <Row>
              <Slider label="Volume" value={s.volume} onChange={(volume) => set({ volume })} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />
              <div style={{ marginBottom: 10 }}><Btn onClick={() => chime(s.volume, [523, 659, 784])}>🔔 Test</Btn></div>
            </Row>
          )}
          {perm === 'unsupported' ? (
            <Note>Desktop notifications are not supported in this browser; the chime and tab title still tell you when time is up.</Note>
          ) : perm === 'granted' ? (
            <Note tone="ok">Desktop notifications are on.</Note>
          ) : (
            <Btn onClick={() => void Notification.requestPermission().then((p) => setPerm(p))}>🔔 Enable desktop notifications</Btn>
          )}
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Today" value={`${today.length} 🍅`} sub={`${todayMin} min focused`} tone="accent" />
          <Stat label="Last 7 days" value={`${Math.round(s.history.filter((h) => h.start > now - 7 * DAY).reduce((a, h) => a + h.min, 0) / 6) / 10} h`} sub="focus time" />
          <Stat label="Streak" value={`${streak} day${streak === 1 ? '' : 's'}`} />
        </Stats>
        <Panel title="Focus minutes per day">
          <BarChart bars={days.map((t) => ({ label: new Date(t).toLocaleDateString([], { weekday: 'short' }), value: s.history.filter((h) => dayKey(h.start) === dayKey(t)).reduce((a, h) => a + h.min, 0), color: PH.focus.color }))} fy={(v) => `${Math.round(v)}`} height={200} />
        </Panel>
        <Panel title="By task (7 days)">
          {byTask.size ? <Donut size={170} slices={[...byTask].map(([label, value]) => ({ label, value }))} fv={(v) => `${v} min`} /> : <Note>No sessions yet.</Note>}
        </Panel>
        <Panel
          title="History"
          actions={
            <>
              <CsvButton name="pomodoro-history.csv" rows={() => [['Start', 'End', 'Minutes', 'Task'], ...recent.map((h) => [new Date(h.start).toISOString(), new Date(h.end).toISOString(), h.min, h.task])]} />
              <JsonButtons name="pomodoro.json" data={s} onLoad={(d) => {
                if (d && Array.isArray(d.history)) set({ ...DEF, ...d, running: false })
              }} />
              <Btn kind="danger" onClick={() => set({ history: [] })}>Clear</Btn>
            </>
          }
        >
          <Table
            max={15}
            head={['When', 'Task', 'Minutes', '']}
            rows={recent.map((h) => [
              new Date(h.start).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
              h.task,
              h.min,
              <Btn key="x" kind="ghost" title="Delete" onClick={() => set({ history: s.history.filter((x) => x.id !== h.id) })}>✕</Btn>,
            ])}
          />
        </Panel>
      </div>
    </Split>
  )
}
