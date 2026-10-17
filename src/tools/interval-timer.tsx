import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, CsvButton, JsonButtons, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { buildPlan, clock, segmentAt, summary, type SegKind, type Workout } from './lib/interval-timer'

interface Done { id: string; at: number; name: string; sec: number; full: boolean }
interface State { workouts: Workout[]; sel: string; sound: boolean; volume: number; voice: boolean; wake: boolean; history: Done[] }

const PRESETS: Workout[] = [
  { id: 'tabata', name: 'Tabata (20/10 × 8)', prep: 10, work: 20, rest: 10, rounds: 8, sets: 1, setRest: 60, cool: 0, moves: '' },
  { id: 'hiit', name: 'HIIT 40/20 circuit', prep: 10, work: 40, rest: 20, rounds: 6, sets: 3, setRest: 60, cool: 120, moves: 'Jump squats, Push-ups, Mountain climbers, Lunges, Plank jacks, Burpees' },
  { id: 'emom', name: 'EMOM 12 min', prep: 10, work: 60, rest: 0, rounds: 12, sets: 1, setRest: 0, cool: 0, moves: 'Kettlebell swings, Goblet squats' },
  { id: 'box', name: 'Boxing rounds 3/1', prep: 15, work: 180, rest: 60, rounds: 6, sets: 1, setRest: 0, cool: 0, moves: '' },
  { id: 'run', name: 'Run/walk 1:2', prep: 300, work: 60, rest: 120, rounds: 8, sets: 1, setRest: 0, cool: 300, moves: 'Run' },
]
const H = 3_600_000
const DEF: State = {
  workouts: PRESETS, sel: 'hiit', sound: true, volume: 0.6, voice: false, wake: true,
  history: [
    { id: 'h1', at: Date.now() - 26 * H, name: 'Tabata (20/10 × 8)', sec: 240, full: true },
    { id: 'h2', at: Date.now() - 74 * H, name: 'HIIT 40/20 circuit', sec: 1380, full: true },
    { id: 'h3', at: Date.now() - 120 * H, name: 'Boxing rounds 3/1', sec: 900, full: false },
  ],
}
const COL: Record<SegKind, string> = { prep: '#f59e0b', work: '#ef4444', rest: '#10b981', setRest: '#0ea5e9', cool: '#a855f7' }

let ctx: AudioContext | null = null
function beep(freq: number, dur: number, vol: number) {
  try {
    ctx ??= new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'square'
    o.frequency.value = freq
    const t = ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.25 * vol + 0.0001, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(ctx.destination)
    o.start(t)
    o.stop(t + dur + 0.05)
  } catch {
    /* audio unavailable */
  }
}
function say(text: string) {
  try {
    speechSynthesis.cancel()
    speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  } catch {
    /* no speech */
  }
}

type Lock = { release: () => Promise<void> }
const stamp = () => performance.now()

export default function IntervalTimer() {
  const [s, set, reset] = useToolState('interval-timer', DEF)
  const w = s.workouts.find((x) => x.id === s.sel) ?? s.workouts[0] ?? PRESETS[0]
  const plan = useMemo(() => buildPlan(w), [w])
  const sum = summary(plan)
  const [t, setT] = useState(0)
  const [running, setRunning] = useState(false)
  const [lockOn, setLockOn] = useState(false)
  const [now0] = useState(Date.now)
  const base = useRef(0)
  const startAt = useRef(0)
  const lastBeep = useRef('')
  const opts = useRef(s)
  useEffect(() => {
    opts.current = s
  })

  const idx = segmentAt(plan, t)
  const finished = idx >= plan.length
  const seg = plan[Math.min(idx, plan.length - 1)]
  const left = finished ? 0 : seg.start + seg.sec - t
  const next = plan[idx + 1]

  const log = useCallback((full: boolean, sec: number) => {
    if (sec < 5) return
    set((x) => ({ ...x, history: [{ id: uid(), at: Date.now(), name: w.name, sec: Math.round(sec), full }, ...x.history].slice(0, 200) }))
  }, [set, w.name])

  // Animation loop: compute elapsed time, fire cues, detect the end.
  useEffect(() => {
    if (!running) return
    let raf = 0
    const tick = () => {
      const now = base.current + (performance.now() - startAt.current) / 1000
      const i = segmentAt(plan, now)
      const o = opts.current
      if (i >= plan.length) {
        setT(now)
        setRunning(false)
        base.current = now
        if (o.sound) [0, 180, 360].forEach((d) => setTimeout(() => beep(1046, 0.3, o.volume), d))
        if (o.voice) say('Workout complete. Great job!')
        log(true, now)
        return
      }
      const sg = plan[i]
      const rem = Math.ceil(sg.start + sg.sec - now)
      const key = `${i}:${rem}`
      if (key !== lastBeep.current) {
        const first = !lastBeep.current.startsWith(`${i}:`)
        lastBeep.current = key
        if (first) {
          if (o.sound) beep(sg.kind === 'work' ? 880 : 587, 0.45, o.volume)
          if (o.voice) say(sg.kind === 'work' ? sg.label : sg.label + (plan[i + 1] ? `. Next: ${plan[i + 1].label}` : ''))
        } else if (rem <= 3 && rem >= 1 && sg.sec > 4 && o.sound) beep(440, 0.12, o.volume)
      }
      setT(now)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, plan, log])

  // Screen Wake Lock while running.
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Lock> } }
    if (!running || !s.wake || !nav.wakeLock) return
    let lock: Lock | null = null
    let dead = false
    const get = () => nav.wakeLock!.request('screen').then((l) => {
      if (dead) void l.release()
      else {
        lock = l
        setLockOn(true)
      }
    }).catch(() => setLockOn(false))
    void get()
    const vis = () => document.visibilityState === 'visible' && void get()
    document.addEventListener('visibilitychange', vis)
    return () => {
      dead = true
      document.removeEventListener('visibilitychange', vis)
      void lock?.release()
      setLockOn(false)
    }
  }, [running, s.wake])

  const start = () => {
    if (finished) jump(0)
    startAt.current = stamp()
    setRunning(true)
  }
  const pause = () => {
    base.current = t
    setRunning(false)
  }
  const jump = (sec: number) => {
    base.current = sec
    startAt.current = stamp()
    lastBeep.current = ''
    setT(sec)
  }
  const stop = () => {
    if (t > 0 && !finished) log(false, t)
    setRunning(false)
    jump(0)
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input,textarea,select,button')) return
      e.preventDefault()
      if (running) pause()
      else start()
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  })

  const edit = (p: Partial<Workout>) => {
    if (running) pause()
    set({ workouts: s.workouts.map((x) => (x.id === w.id ? { ...x, ...p } : x)) })
  }
  const choose = (id: string) => {
    setRunning(false)
    jump(0)
    set({ sel: id })
  }

  const R = 120, C = 2 * Math.PI * R
  const frac = finished ? 1 : 1 - left / seg.sec
  const colr = finished ? '#6366f1' : COL[seg.kind]
  const total7 = s.history.filter((h) => h.at > now0 - 7 * 24 * H).reduce((a, h) => a + h.sec, 0)

  return (
    <Split wide="left">
      <div>
        <Panel title={w.name}>
          <div style={{ display: 'grid', placeItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', width: 280, height: 280, maxWidth: '100%' }}>
              <svg viewBox="0 0 280 280" width="100%" height="100%">
                <circle cx={140} cy={140} r={R} fill="none" stroke="var(--line)" strokeWidth={16} />
                <circle cx={140} cy={140} r={R} fill="none" stroke={colr} strokeWidth={16} strokeLinecap="round"
                  strokeDasharray={`${frac * C} ${C}`} opacity={frac > 0 ? 1 : 0} transform="rotate(-90 140 140)" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center' }}>
                <div style={{ color: colr, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 14 }}>
                  {finished ? 'Done!' : seg.kind === 'work' ? 'Work' : seg.label}
                </div>
                <div style={{ fontSize: 64, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{clock(left)}</div>
                {!finished && seg.kind === 'work' && seg.label !== 'Work' && <div style={{ fontWeight: 700 }}>{seg.label}</div>}
                {!finished && seg.set > 0 && (
                  <div className="muted">Round {seg.round}/{Math.max(1, w.rounds)}{w.sets > 1 ? ` · Set ${seg.set}/${w.sets}` : ''}</div>
                )}
              </div>
            </div>
            <div className="muted">{finished ? 'Workout complete 🎉' : next ? <>Next: <b style={{ color: COL[next.kind] }}>{next.label}</b> ({clock(next.sec)})</> : 'Last interval'}</div>
            <Row>
              {running ? <Btn kind="primary" onClick={pause}>⏸ Pause</Btn> : <Btn kind="primary" onClick={start}>▶ {t > 0 && !finished ? 'Resume' : 'Start'}</Btn>}
              <Btn onClick={() => jump(idx > 0 && t - seg.start < 2 ? plan[idx - 1].start : finished ? 0 : seg.start)} disabled={t === 0}>⏮ Back</Btn>
              <Btn onClick={() => jump(finished ? t : seg.start + seg.sec)} disabled={finished}>⏭ Skip</Btn>
              <Btn kind="ghost" onClick={stop} disabled={t === 0}>⏹ Stop</Btn>
            </Row>
          </div>
          <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', margin: '14px 0 4px', position: 'relative', gap: 1 }}>
            {plan.map((p, i) => (
              <button key={i} type="button" title={`${p.label} · ${clock(p.sec)}`} onClick={() => jump(p.start)}
                style={{ flex: p.sec, background: COL[p.kind], opacity: i < idx ? 0.35 : 1, border: 0, padding: 0, minWidth: 2, cursor: 'pointer' }} />
            ))}
            <span style={{ position: 'absolute', top: 0, bottom: 0, width: 3, background: 'var(--fg)', left: `${Math.min(100, (t / (sum.total || 1)) * 100)}%`, pointerEvents: 'none' }} />
          </div>
          <Row>
            <span className="muted">Elapsed {clock(t)} / {clock(sum.total)}</span>
            <span className="muted" style={{ marginLeft: 'auto' }}>Space = start/pause · click the strip to jump</span>
          </Row>
        </Panel>
        <Stats>
          <Stat label="Total time" value={clock(sum.total)} />
          <Stat label="Work" value={clock(sum.work)} sub={`${sum.intervals} intervals`} tone="accent" />
          <Stat label="Rest" value={clock(sum.rest)} />
          <Stat label="Work ratio" value={`${Math.round(sum.ratio * 100)}%`} sub="of total time" />
        </Stats>
        <Panel title="History" actions={<CsvButton name="interval-history.csv" rows={() => [['Date', 'Workout', 'Seconds', 'Completed'], ...s.history.map((h) => [new Date(h.at).toISOString(), h.name, h.sec, h.full ? 'yes' : 'no'])]} />}>
          <p className="muted" style={{ marginTop: 0 }}>Last 7 days: <b>{clock(total7)}</b> of training in {s.history.filter((h) => h.at > now0 - 7 * 24 * H).length} sessions.</p>
          <Table max={8} head={['When', 'Workout', 'Time', '']} rows={s.history.map((h) => [
            new Date(h.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }), h.name, clock(h.sec), h.full ? '✓' : 'stopped',
          ])} />
        </Panel>
      </div>
      <div>
        <Panel title="Workout" actions={<>
          <Btn onClick={() => {
            const id = uid()
            set({ workouts: [...s.workouts, { ...w, id, name: `${w.name} (copy)` }], sel: id })
          }}>+ Duplicate</Btn>
          <Btn kind="ghost" disabled={s.workouts.length < 2} onClick={() => {
            const rest = s.workouts.filter((x) => x.id !== w.id)
            set({ workouts: rest, sel: rest[0].id })
          }}>Delete</Btn>
        </>}>
          <Select label="Saved workouts" value={w.id} onChange={choose} options={s.workouts.map((x) => [x.id, x.name] as const)} />
          <Txt label="Name" value={w.name} onChange={(name) => edit({ name })} />
          <Row>
            <Num label="Work" unit="s" min={1} value={w.work} onChange={(v) => edit({ work: Math.max(1, v) })} />
            <Num label="Rest" unit="s" min={0} value={w.rest} onChange={(v) => edit({ rest: Math.max(0, v) })} />
          </Row>
          <Row>
            <Num label="Rounds per set" min={1} step={1} value={w.rounds} onChange={(v) => edit({ rounds: Math.max(1, Math.round(v)) })} />
            <Num label="Sets" min={1} step={1} value={w.sets} onChange={(v) => edit({ sets: Math.max(1, Math.round(v)) })} />
          </Row>
          <Row>
            <Num label="Set break" unit="s" min={0} value={w.setRest} onChange={(v) => edit({ setRest: Math.max(0, v) })} />
            <Num label="Get ready" unit="s" min={0} value={w.prep} onChange={(v) => edit({ prep: Math.max(0, v) })} />
            <Num label="Cool down" unit="s" min={0} value={w.cool} onChange={(v) => edit({ cool: Math.max(0, v) })} />
          </Row>
          <Area label="Exercises (comma or line separated, cycled through work intervals)" rows={3} value={w.moves} onChange={(moves) => edit({ moves })} />
        </Panel>
        <Panel title="Cues & screen">
          <Check label="Beeps (3-2-1 countdown + interval change)" value={s.sound} onChange={(sound) => set({ sound })} />
          {s.sound && <Slider label="Volume" min={0} max={1} step={0.05} value={s.volume} onChange={(volume) => set({ volume })} show={(v) => `${Math.round(v * 100)}%`} />}
          <Check label="Voice announcements" value={s.voice} onChange={(voice) => set({ voice })} />
          <Check label="Keep screen awake while running" value={s.wake} onChange={(wake) => set({ wake })} />
          {s.wake && !('wakeLock' in navigator) && <Note tone="warn">This browser has no Wake Lock API. Keep the screen on manually.</Note>}
          {lockOn && <Note tone="ok">Screen wake lock active.</Note>}
          <Row>
            <Btn onClick={() => beep(880, 0.4, s.volume)}>🔊 Test beep</Btn>
            <JsonButtons name="interval-timer.json" data={s} onLoad={(d) => set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset all</Btn>
          </Row>
        </Panel>
        <Note>Tabata = 20 s all-out, 10 s rest, 8 rounds (4 min). For HIIT beginners, start at a 1:2 work-to-rest ratio and progress toward 2:1.</Note>
      </div>
    </Split>
  )
}
