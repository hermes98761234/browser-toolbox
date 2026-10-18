import { useCallback, useEffect, useRef, useState } from 'react'
import { BarChart, Btn, Check, JsonButtons, Note, Num, Panel, Ring, Row, Seg, Split, Stat, Stats, today, useToolState } from '../kit'

type Phase = 'idle' | 'work' | 'break' | 'paused'
type Unit = 'ft' | 'm'

interface Day { done: number; skipped: number }
interface State {
  workMin: number
  breakSec: number
  unit: Unit
  notify: boolean
  sound: boolean
  overlay: boolean
  autoNext: boolean
  goal: number
  history: Record<string, Day>
}

const DEF: State = {
  workMin: 20,
  breakSec: 20,
  unit: 'ft',
  notify: true,
  sound: true,
  overlay: true,
  autoNext: true,
  goal: 16,
  history: {},
}

const TIPS = [
  'Look at something at least 20 feet (6 m) away: a tree outside, the far wall, a building across the street.',
  'Blink slowly ten times. Screen work cuts blink rate by about half, which dries the eyes.',
  'Roll your shoulders and drop them away from your ears while you look into the distance.',
  'Close your eyes gently and cup your palms over them for a few seconds of darkness.',
  'Check your screen: its top edge should sit at or just below eye level, about an arm’s length away.',
  'Trace the outline of a distant object with your eyes to relax the focusing muscles.',
]

const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

function chime(kind: 'start' | 'end') {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const notes = kind === 'start' ? [660, 880] : [880, 660, 990]
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      const t = ctx.currentTime + i * 0.18
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.18, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.4)
    })
    setTimeout(() => void ctx.close(), 1500)
  } catch {
    /* audio not available */
  }
}

export default function EyeBreakReminder() {
  const [s, set, reset] = useToolState('eye-break-reminder', DEF)
  const [phase, setPhase] = useState<Phase>('idle')
  const [endAt, setEndAt] = useState(0)
  const [left, setLeft] = useState(s.workMin * 60000)
  const [pausedFrom, setPausedFrom] = useState<'work' | 'break'>('work')
  const [now, setNow] = useState(() => Date.now())
  const [tip, setTip] = useState(0)
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(() => ('Notification' in window ? Notification.permission : 'unsupported'))
  const overlayRef = useRef<HTMLDivElement>(null)
  const sRef = useRef(s)
  useEffect(() => {
    sRef.current = s
  }, [s])

  const workMs = s.workMin * 60000
  const breakMs = s.breakSec * 1000
  const remaining = phase === 'work' || phase === 'break' ? Math.max(0, endAt - now) : left
  const total = (phase === 'paused' ? pausedFrom : phase) === 'break' ? breakMs : workMs
  const dist = s.unit === 'ft' ? '20 feet' : '6 metres'

  const log = useCallback((field: keyof Day) => {
    const k = today()
    set((st) => {
      const d = st.history[k] ?? { done: 0, skipped: 0 }
      return { ...st, history: { ...st.history, [k]: { ...d, [field]: d[field] + 1 } } }
    })
  }, [set])

  const notify = useCallback((title: string, body: string) => {
    if (!sRef.current.notify || !('Notification' in window) || Notification.permission !== 'granted') return
    try {
      const n = new Notification(title, { body, tag: 'eye-break', requireInteraction: false })
      n.onclick = () => {
        window.focus()
        n.close()
      }
    } catch {
      /* some mobile browsers only allow notifications from a service worker */
    }
  }, [])

  const startBreak = useCallback(() => {
    const st = sRef.current
    setPhase('break')
    setEndAt(Date.now() + st.breakSec * 1000)
    setTip((t) => (t + 1) % TIPS.length)
    if (st.sound) chime('start')
    notify('Eye break 👀', `Look at something ${st.unit === 'ft' ? '20 feet' : '6 metres'} away for ${st.breakSec} seconds.`)
    if (st.overlay && overlayRef.current?.requestFullscreen && !document.fullscreenElement) {
      overlayRef.current.requestFullscreen().catch(() => undefined)
    }
  }, [notify])

  const startWork = useCallback(() => {
    setPhase('work')
    setEndAt(Date.now() + sRef.current.workMin * 60000)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  }, [])

  // Tick using wall-clock end times, so throttled background tabs stay accurate.
  useEffect(() => {
    if (phase !== 'work' && phase !== 'break') return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [phase])

  useEffect(() => {
    if ((phase !== 'work' && phase !== 'break') || now < endAt) return
    // Defer state changes out of the effect body.
    const t = setTimeout(() => {
      if (phase === 'work') startBreak()
      else {
        log('done')
        if (sRef.current.sound) chime('end')
        notify('Break done ✓', 'Back to work. Next reminder in ' + sRef.current.workMin + ' min.')
        if (sRef.current.autoNext) startWork()
        else {
          setPhase('idle')
          setLeft(sRef.current.workMin * 60000)
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
        }
      }
    }, 0)
    return () => clearTimeout(t)
  }, [now, endAt, phase, startBreak, startWork, log, notify])

  // Title shows the countdown so it is visible from other tabs.
  useEffect(() => {
    const old = document.title
    if (phase === 'work') document.title = `⏱ ${fmtClock(remaining)} until eye break`
    else if (phase === 'break') document.title = `👀 Look away · ${fmtClock(remaining)}`
    return () => {
      document.title = old
    }
  }, [phase, remaining])

  const askPerm = async () => {
    if (!('Notification' in window)) return
    setPerm(await Notification.requestPermission())
  }

  const pause = () => {
    setLeft(Math.max(0, endAt - Date.now()))
    setPausedFrom(phase === 'break' ? 'break' : 'work')
    setPhase('paused')
  }
  const resume = () => {
    setPhase(pausedFrom)
    setEndAt(Date.now() + left)
  }
  const stop = () => {
    setPhase('idle')
    setLeft(workMs)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  }
  const skip = () => {
    log('skipped')
    startWork()
  }

  const todayRec = s.history[today()] ?? { done: 0, skipped: 0 }
  const days = Array.from({ length: 14 }, (_, i) => dayKey(new Date(now - (13 - i) * 86400000)))
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const r = s.history[days[i]]
    if (r && r.done >= s.goal) streak++
    else if (i === days.length - 1) continue
    else break
  }
  const week = days.slice(-7).reduce((a, k) => a + (s.history[k]?.done ?? 0), 0)
  const allDone = Object.values(s.history).reduce((a, d) => a + d.done, 0)
  const allSkip = Object.values(s.history).reduce((a, d) => a + d.skipped, 0)
  const isBreak = phase === 'break' || (phase === 'paused' && pausedFrom === 'break')

  return (
    <Split>
      <div>
        <Panel title="Timer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <Ring value={1 - remaining / (total || 1)} size={150} color={isBreak ? 'var(--ok)' : 'var(--accent)'} label={
              <span style={{ textAlign: 'center', display: 'block' }}>
                <b style={{ fontSize: 28, display: 'block' }}>{fmtClock(remaining)}</b>
                <span className="muted" style={{ fontSize: 12 }}>{phase === 'idle' ? 'ready' : phase === 'paused' ? 'paused' : isBreak ? 'look away' : 'until break'}</span>
              </span>
            } />
            <div style={{ flex: 1, minWidth: 180 }}>
              <p style={{ marginTop: 0 }}>
                Every <b>{s.workMin} min</b>, look at something <b>{dist}</b> away for <b>{s.breakSec} s</b>.
              </p>
              <Row>
                {phase === 'idle' && <Btn kind="primary" onClick={startWork}>▶ Start</Btn>}
                {(phase === 'work' || phase === 'break') && <Btn onClick={pause}>⏸ Pause</Btn>}
                {phase === 'paused' && <Btn kind="primary" onClick={resume}>▶ Resume</Btn>}
                {phase === 'work' && <Btn onClick={startBreak}>Break now</Btn>}
                {phase === 'break' && <Btn onClick={skip}>Skip break</Btn>}
                {phase !== 'idle' && <Btn kind="ghost" onClick={stop}>■ Stop</Btn>}
              </Row>
            </div>
          </div>
        </Panel>
        <Panel title="Settings">
          <Row>
            <Num label="Work interval" value={s.workMin} onChange={(workMin) => set({ workMin: Math.max(1, workMin) })} unit="min" min={1} max={180} />
            <Num label="Break length" value={s.breakSec} onChange={(breakSec) => set({ breakSec: Math.max(5, breakSec) })} unit="s" min={5} max={600} />
            <Num label="Daily goal" value={s.goal} onChange={(goal) => set({ goal: Math.max(1, Math.round(goal)) })} unit="breaks" min={1} />
          </Row>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '8px 0' }}>
            <span className="muted">Distance unit</span>
            <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['ft', '20 ft'], ['m', '6 m']]} />
          </div>
          <Check label="Desktop notification when a break starts" value={s.notify} onChange={(notify) => set({ notify })} />
          <Check label="Soft chime at start and end of a break" value={s.sound} onChange={(sound) => set({ sound })} />
          <Check label="Full-screen break overlay" value={s.overlay} onChange={(overlay) => set({ overlay })} />
          <Check label="Start the next interval automatically" value={s.autoNext} onChange={(autoNext) => set({ autoNext })} />
          {perm === 'unsupported' ? (
            <Note tone="warn">This browser has no Notifications API. Keep the tab visible or rely on the chime and tab title.</Note>
          ) : perm !== 'granted' ? (
            <Note tone={perm === 'denied' ? 'err' : 'info'}>
              {perm === 'denied' ? 'Notifications are blocked for this site. Allow them in the browser’s site settings.' : 'Allow notifications so you see the reminder while working in another app.'}{' '}
              {perm === 'default' && <Btn onClick={askPerm}>Allow notifications</Btn>}
            </Note>
          ) : (
            <Note tone="ok">Notifications are allowed ✓</Note>
          )}
          <Note tone="warn">
            Reminders only work <b>while this tab stays open</b> (it can be in the background). There is no server and no background service: close the tab
            and the timer stops. The tab title shows the countdown.
          </Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Breaks today" value={`${todayRec.done} / ${s.goal}`} tone={todayRec.done >= s.goal ? 'good' : 'accent'} sub={`${todayRec.skipped} skipped`} />
          <Stat label="Goal streak" value={`${streak} day${streak === 1 ? '' : 's'}`} />
          <Stat label="Last 7 days" value={week} sub="breaks taken" />
          <Stat label="Completion" value={allDone + allSkip ? `${Math.round((allDone / (allDone + allSkip)) * 100)}%` : '—'} sub="taken vs skipped" />
        </Stats>
        <Panel
          title="Last 14 days"
          actions={
            <>
              <JsonButtons name="eye-breaks.json" data={s} onLoad={(d) => set(d)} />
              <Btn kind="ghost" onClick={() => set({ history: {} })}>Clear history</Btn>
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          {days.every((k) => !s.history[k]) ? (
            <p className="muted">No breaks logged yet. Press Start: each completed or skipped break is counted here, per day, in this browser.</p>
          ) : (
          <BarChart
            bars={days.map((k) => ({ label: k.slice(5), value: [s.history[k]?.done ?? 0, s.history[k]?.skipped ?? 0] }))}
            stacks={[{ name: 'Taken', color: 'var(--ok)' }, { name: 'Skipped', color: 'var(--warn)' }]}
            fy={(v) => String(Math.round(v))}
          />
          )}
        </Panel>
        <Panel title="Why 20-20-20?">
          <p>
            Focusing on a near screen keeps the eye’s ciliary muscle contracted and lowers your blink rate. Short, regular breaks spent looking into the distance
            let the muscle relax and the tear film recover, easing the dryness, blur and headaches known as digital eye strain.
          </p>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {TIPS.slice(1).map((t) => <li key={t}>{t}</li>)}
          </ul>
          <p className="muted" style={{ fontSize: 13 }}>General wellness information, not medical advice. See an eye-care professional if symptoms persist.</p>
        </Panel>
      </div>
      <div
        ref={overlayRef}
        style={{
          display: isBreak ? 'flex' : 'none', position: 'fixed', inset: 0, zIndex: 1000, flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'radial-gradient(circle at 50% 40%, #134e4a, #042f2e)', color: '#ecfeff', textAlign: 'center', padding: 24, gap: 16,
        }}
      >
        <div style={{ fontSize: 'clamp(16px, 3vw, 22px)', opacity: 0.85 }}>Look at something {dist} away</div>
        <div style={{ fontSize: 'clamp(64px, 16vw, 160px)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{Math.ceil(remaining / 1000)}</div>
        <div style={{ maxWidth: 520, fontSize: 17, lineHeight: 1.5 }}>{TIPS[tip]}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {phase === 'break' ? <Btn onClick={pause}>⏸ Pause</Btn> : <Btn onClick={resume}>▶ Resume</Btn>}
          <Btn onClick={skip}>Skip</Btn>
        </div>
      </div>
    </Split>
  )
}
