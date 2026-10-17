import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Btn, Check, Note, Panel, Ring, Seg, Slider, Split, Stat, Stats, today, useToolState } from '../kit'
import { mmss, RANGE, schedule, stepAt, STEPS, type Method, type Pose } from './lib/hand-hygiene-timer'

interface State { method: Method; secs: Record<Method, number>; sound: boolean; voice: boolean; day: string; todayCount: number; total: number }
const DEF: State = { method: 'wash', secs: { wash: 50, rub: 25 }, sound: true, voice: false, day: '', todayCount: 0, total: 0 }

// ---------- illustrations ----------
const SKIN = '#f3c89a', EDGE = '#b9783f', SKIN2 = '#e9b07c'

/** Stylised open hand, fingers up, palm centre at the origin. */
function Hand({ fill = SKIN, mirror = false }: { fill?: string; mirror?: boolean }) {
  return (
    <g transform={mirror ? 'scale(-1,1)' : undefined} stroke={EDGE} strokeWidth={2} fill={fill} strokeLinejoin="round">
      <rect x={-34} y={-2} width={13} height={38} rx={6.5} transform="rotate(-32 -27 34)" />
      <rect x={-23} y={-50} width={11} height={52} rx={5.5} />
      <rect x={-11} y={-60} width={11} height={62} rx={5.5} />
      <rect x={1} y={-56} width={11} height={58} rx={5.5} />
      <rect x={13} y={-44} width={10} height={46} rx={5} />
      <path d="M-24,-8 C-24,-12 -21,-14 -17,-14 L18,-14 C22,-14 24,-11 24,-8 L24,26 C24,40 14,48 0,48 C-14,48 -24,40 -24,26 Z" />
      <path d="M-12,-14 v-6 M0,-14 v-6 M12,-14 v-6" fill="none" stroke={EDGE} strokeWidth={1.2} opacity={0.6} />
    </g>
  )
}

const rubX = (d = 8, dur = '0.7s') => <animateTransform attributeName="transform" type="translate" values={`-${d} 0; ${d} 0; -${d} 0`} dur={dur} repeatCount="indefinite" additive="sum" />
const rubY = (d = 8, dur = '0.7s') => <animateTransform attributeName="transform" type="translate" values={`0 -${d}; 0 ${d}; 0 -${d}`} dur={dur} repeatCount="indefinite" additive="sum" />
const spin = (cx: number, cy: number, dur = '1.2s') => <animateTransform attributeName="transform" type="rotate" values={`0 ${cx} ${cy}; 360 ${cx} ${cy}`} dur={dur} repeatCount="indefinite" additive="sum" />

function Drops({ x = 0, y = -95, n = 5, color = '#38bdf8' }: { x?: number; y?: number; n?: number; color?: string }) {
  return (
    <g fill={color}>
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M${x - 24 + i * 12},${y} q4,7 0,10 q-4,-3 0,-10`} opacity={0.85}>
          <animateTransform attributeName="transform" type="translate" values="0 0; 0 60" dur={`${0.7 + (i % 3) * 0.15}s`} begin={`${i * 0.13}s`} repeatCount="indefinite" />
        </path>
      ))}
    </g>
  )
}

function Arrow({ r = 30, cx = 0, cy = 0 }: { r?: number; cx?: number; cy?: number }) {
  return (
    <g fill="none" stroke="#6366f1" strokeWidth={4} strokeLinecap="round">
      <path d={`M${cx + r},${cy} A${r},${r} 0 1 1 ${cx},${cy - r}`}>{spin(cx, cy, '1.6s')}</path>
    </g>
  )
}

function Illustration({ pose }: { pose: Pose }) {
  const body: Record<Pose, ReactNode> = {
    wet: <><path d="M-60,-92 h50 v12 h-20 v10 h-10 v-10 h-20 z" fill="#94a3b8" /><Drops x={-25} y={-68} /><g transform="translate(-28 30) rotate(-10)"><Hand /></g><g transform="translate(28 30) rotate(10)"><Hand mirror fill={SKIN2} /></g></>,
    soap: <><rect x={30} y={-88} width={34} height={46} rx={6} fill="#a78bfa" /><rect x={40} y={-98} width={14} height={12} fill="#7c3aed" /><path d="M54,-96 h-30 v6" stroke="#7c3aed" strokeWidth={5} fill="none" /><circle cx={22} cy={-72} r={5} fill="#e9d5ff"><animate attributeName="cy" values="-80;-40" dur="1s" repeatCount="indefinite" /></circle><g transform="translate(-10 40) rotate(-15)"><Hand /></g></>,
    palms: <><g transform="translate(-8 20) rotate(-6)"><Hand />{rubY(7)}</g><g transform="translate(8 20) rotate(6)"><Hand mirror fill={SKIN2} /></g></>,
    backs: <><g transform="translate(-6 25) rotate(-20)"><Hand fill={SKIN2} /></g><g transform="translate(10 10) rotate(25)"><g>{rubY(9)}<Hand /></g></g></>,
    interlace: <><g transform="translate(-6 20) rotate(-4)"><Hand fill={SKIN2} /></g><g transform="translate(6 18) rotate(4)"><g>{rubX(5, '0.6s')}<Hand mirror /></g></g></>,
    fingerbacks: <><g transform="translate(-22 0) rotate(90)"><Hand fill={SKIN2} /></g><g transform="translate(22 6) rotate(-90)"><g>{rubY(6, '0.6s')}<Hand mirror /></g></g></>,
    thumbs: <><g transform="translate(-10 25) rotate(-10)"><Hand fill={SKIN2} /></g><g><circle cx={-34} cy={30} r={22} fill={SKIN} stroke={EDGE} strokeWidth={2} />{spin(-34, 30, '1.4s')}<rect x={-40} y={10} width={12} height={10} rx={4} fill={SKIN2} stroke={EDGE} /></g><Arrow cx={-34} cy={30} r={36} /></>,
    tips: <><g transform="translate(0 30) rotate(180) scale(1 0.9)"><Hand fill={SKIN2} /></g><g transform="translate(0 15)"><g>{spin(0, 0, '1.3s')}{[0, 72, 144, 216, 288].map((a) => <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 10} cy={Math.sin((a * Math.PI) / 180) * 10} r={7} fill={SKIN} stroke={EDGE} strokeWidth={2} />)}</g></g><Arrow cx={0} cy={15} r={30} /></>,
    rinse: <><path d="M-30,-92 h50 v12 h-20 v10 h-10 v-10 h-20 z" fill="#94a3b8" /><Drops x={0} y={-68} n={6} /><g transform="translate(-14 30) rotate(-8)"><g>{rubY(5, '0.9s')}<Hand /></g></g><g transform="translate(14 30) rotate(8)"><Hand mirror fill={SKIN2} /></g></>,
    dry: <><rect x={-70} y={-30} width={140} height={60} rx={8} fill="#e0f2fe" stroke="#38bdf8" strokeWidth={3}>{rubX(6, '0.8s')}</rect><g transform="translate(-30 50) rotate(-20) scale(0.8)"><Hand /></g><g transform="translate(30 50) rotate(20) scale(0.8)"><Hand mirror fill={SKIN2} /></g></>,
    tap: <><path d="M-60,-40 h70 v16 h-26 v14 h-16 v-14 h-28 z" fill="#94a3b8" /><rect x={-4} y={-62} width={20} height={20} rx={4} fill="#64748b"><animateTransform attributeName="transform" type="rotate" values="0 6 -52; 90 6 -52; 90 6 -52" dur="1.6s" repeatCount="indefinite" /></rect><rect x={-6} y={-30} width={60} height={40} rx={6} fill="#e0f2fe" stroke="#38bdf8" strokeWidth={3} /><g transform="translate(30 50) rotate(-20) scale(0.8)"><Hand /></g></>,
    drip: <><rect x={22} y={-98} width={30} height={40} rx={6} fill="#5eead4" /><path d="M30,-58 h14 v8 h-14 z" fill="#0f766e" /><Drops x={60} y={-48} n={1} color="#2dd4bf" /><g transform="translate(-6 40) rotate(180) scale(1 0.8)"><Hand /></g><ellipse cx={-6} cy={36} rx={18} ry={7} fill="#99f6e4" opacity={0.9} /></>,
  }
  return (
    <svg viewBox="-100 -100 200 200" style={{ width: '100%', height: '100%' }} role="img" aria-label={pose}>
      <circle r={96} fill="color-mix(in srgb, var(--accent) 8%, transparent)" />
      {body[pose]}
    </svg>
  )
}

// ---------- sound ----------
function useBeeper() {
  const ctx = useRef<AudioContext | null>(null)
  const get = () => (ctx.current ??= new AudioContext())
  const tone = (f: number, at: number, dur: number, vol = 0.18) => {
    const c = get(), o = c.createOscillator(), g = c.createGain()
    o.frequency.value = f
    o.type = 'sine'
    g.gain.setValueAtTime(0.0001, c.currentTime + at)
    g.gain.exponentialRampToValueAtTime(vol, c.currentTime + at + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur)
    o.connect(g).connect(c.destination)
    o.start(c.currentTime + at)
    o.stop(c.currentTime + at + dur + 0.05)
  }
  useEffect(() => () => void ctx.current?.close(), [])
  return {
    unlock: () => void get().resume(),
    step: () => tone(880, 0, 0.15),
    tick: () => tone(1320, 0, 0.05, 0.08),
    done: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.12, 0.35)),
  }
}

const say = (t: string) => {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  speechSynthesis.speak(new SpeechSynthesisUtterance(t))
}

export default function HandHygieneTimer() {
  const [s, set] = useToolState('hand-hygiene-timer', DEF)
  const steps = STEPS[s.method]
  const total = s.secs[s.method]
  const slots = schedule(steps, total)
  const [run, setRun] = useState<{ start: number; paused: number | null; offset: number } | null>(null)
  const [now, setNow] = useState(0)
  const [kiosk, setKiosk] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const beep = useBeeper()
  const lastStep = useRef(-1)
  const lastSec = useRef(-1)

  const elapsed = run ? ((run.paused ?? now) - run.start) / 1000 + run.offset : 0
  const idx = run ? stepAt(slots, elapsed) : -1
  const finished = idx >= steps.length
  const cur = idx >= 0 && !finished ? slots[idx] : null

  const cue = useRef({ s, steps, total, slots, beep })
  useEffect(() => {
    cue.current = { s, steps, total, slots, beep }
  })

  useEffect(() => {
    if (!run || run.paused !== null) return
    let raf = 0
    const loop = () => {
      const t = performance.now()
      setNow(t)
      // cues on step changes, ticks in the last 3 s, completion
      const c = cue.current
      const el = (t - run.start) / 1000 + run.offset
      const i = stepAt(c.slots, el)
      if (i !== lastStep.current) {
        lastStep.current = i
        if (i >= c.steps.length) {
          if (c.s.sound) c.beep.done()
          if (c.s.voice) say('Done. Your hands are clean.')
          const d = today()
          set((st) => ({ ...st, day: d, todayCount: (st.day === d ? st.todayCount : 0) + 1, total: st.total + 1 }))
          setRun((r) => (r ? { ...r, paused: t } : r))
          return
        }
        if (c.s.sound && i > 0) c.beep.step()
        if (c.s.voice) say(c.steps[i].title)
      }
      const left = Math.ceil(c.total - el)
      if (left <= 3 && left > 0 && left !== lastSec.current) {
        lastSec.current = left
        if (c.s.sound) c.beep.tick()
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [run, set])

  const start = () => {
    beep.unlock()
    lastStep.current = -1
    lastSec.current = -1
    const t = performance.now()
    setNow(t)
    setRun({ start: t, paused: null, offset: 0 })
  }
  const pause = () => setRun((r) => (r && r.paused === null ? { ...r, paused: performance.now() } : r))
  const resume = () => setRun((r) => (r && r.paused !== null ? { start: performance.now(), paused: null, offset: r.offset + (r.paused - r.start) / 1000 } : r))
  const stop = () => {
    setRun(null)
    if ('speechSynthesis' in window) speechSynthesis.cancel()
  }

  useEffect(() => {
    const on = () => setKiosk(document.fullscreenElement === stage.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const toggleKiosk = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void stage.current?.requestFullscreen?.().catch(() => setKiosk((k) => !k))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input, textarea, select, button')) return
      e.preventDefault()
      if (!run || finished) start()
      else if (run.paused !== null) resume()
      else pause()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })
  // kiosk: return to the ready screen a few seconds after finishing
  useEffect(() => {
    if (!kiosk || !finished) return
    const t = setTimeout(() => setRun(null), 8000)
    return () => clearTimeout(t)
  }, [kiosk, finished])

  const shown = cur ? steps[cur.i] : finished ? null : steps[0]
  const stepLeft = cur ? cur.start + cur.dur - elapsed : 0
  const paused = run?.paused != null && !finished
  const [lo, hi] = RANGE[s.method]
  const todayCount = s.day === today() ? s.todayCount : 0
  const big = kiosk

  const stageEl = (
    <div
      ref={stage}
      onClick={() => kiosk && (!run || finished) && start()}
      style={{ background: 'var(--panel)', borderRadius: big ? 0 : 14, padding: big ? '4vh 4vw' : 12, height: big ? '100vh' : undefined, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12, ...(kiosk && !document.fullscreenElement ? { position: 'fixed', inset: 0, zIndex: 50 } : {}) }}
    >
      <div style={{ display: 'flex', gap: 3 }}>
        {steps.map((st, i) => (
          <span key={st.title} title={st.title} style={{ flex: slots[i].dur, height: big ? 14 : 8, borderRadius: 4, background: idx > i || finished ? 'var(--ok)' : idx === i ? 'var(--accent)' : 'var(--line)', transition: 'background .3s' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 16, alignItems: 'center', flex: 1 }}>
        <div style={{ aspectRatio: '1', maxHeight: big ? '70vh' : 330, margin: '0 auto', width: '100%' }}>
          {finished ? (
            <svg viewBox="-100 -100 200 200" style={{ width: '100%', height: '100%' }}>
              <circle r={80} fill="var(--ok)" opacity={0.15} />
              <path d="M-40,0 L-10,30 L45,-30" fill="none" stroke="var(--ok)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            shown && <Illustration pose={shown.pose} />
          )}
        </div>
        <div style={{ textAlign: 'center' }}>
          {finished ? (
            <>
              <h2 style={{ fontSize: big ? '6vh' : 28, margin: '0 0 8px' }}>Clean hands!</h2>
              <p className="muted" style={{ fontSize: big ? '2.6vh' : 15 }}>{mmss(total)} {s.method === 'wash' ? 'wash' : 'rub'} complete. {kiosk ? 'Tap anywhere to start again.' : ''}</p>
            </>
          ) : (
            <>
              <div className="muted" style={{ fontWeight: 700, fontSize: big ? '2.4vh' : 13 }}>{run ? `Step ${(cur?.i ?? 0) + 1} of ${steps.length}` : 'Ready'}</div>
              <h2 style={{ fontSize: big ? '5.5vh' : 26, margin: '4px 0 6px' }}>{shown?.title}</h2>
              <p style={{ fontSize: big ? '2.8vh' : 15, minHeight: '2.6em', margin: '0 0 12px' }}>{shown?.tip}</p>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Ring value={run ? Math.min(1, elapsed / total) : 0} size={big ? 220 : 130} label={<span style={{ fontSize: big ? 44 : 26, fontWeight: 800 }}>{mmss(run ? total - elapsed : total)}</span>} />
              </div>
              {run && cur && <p className="muted" style={{ fontSize: big ? '2.2vh' : 13 }}>this step: {mmss(stepLeft)}</p>}
            </>
          )}
          {kiosk && !run && <p style={{ fontSize: '3vh', fontWeight: 700, color: 'var(--accent)' }}>Tap anywhere to start</p>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
        {!run || finished ? <Btn kind="primary" onClick={start}>▶ Start {mmss(total)}</Btn> : paused ? <Btn kind="primary" onClick={resume}>▶ Resume</Btn> : <Btn onClick={pause}>❚❚ Pause</Btn>}
        {run && <Btn kind="ghost" onClick={stop}>Reset</Btn>}
        <Btn onClick={toggleKiosk}>{kiosk ? '✕ Exit kiosk' : '⛶ Kiosk fullscreen'}</Btn>
      </div>
    </div>
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Method">
          <Seg value={s.method} onChange={(method) => { stop(); set({ method }) }} options={[['wash', '🧼 Soap & water'], ['rub', '🧴 Alcohol rub']]} />
          <Slider label="Total time" value={total} onChange={(v) => set({ secs: { ...s.secs, [s.method]: v } })} min={lo - 10} max={hi + 30} unit=" s" show={(v) => String(v)} />
          {total < lo ? <Note tone="warn">WHO recommends {lo}–{hi} s for {s.method === 'wash' ? 'handwashing' : 'a handrub'}. {total} s is too short to cover every surface.</Note> : <Note tone="ok">WHO recommends {lo}–{hi} s for {s.method === 'wash' ? 'the entire handwash (about 20 s of that is lathering)' : 'a handrub — keep rubbing until your hands are dry'}.</Note>}
          <Check label="Sound cues (step chime, last-3-second ticks, finish)" value={s.sound} onChange={(sound) => set({ sound })} />
          <Check label="Spoken step names" value={s.voice} onChange={(voice) => set({ voice })} />
        </Panel>
        <Panel title="Steps">
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {steps.map((st, i) => (
              <li key={st.title} style={{ padding: '3px 0', fontWeight: idx === i ? 800 : 400, color: idx > i || finished ? 'var(--muted)' : idx === i ? 'var(--accent)' : undefined }}>
                {st.title} <span className="muted" style={{ fontSize: 12 }}>· {slots[i].dur.toFixed(1)} s</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
      <div>
        <Panel title="Timer">{stageEl}</Panel>
        <Stats>
          <Stat label="Washes today" value={todayCount} tone="accent" />
          <Stat label="All time" value={s.total} />
          <Stat label="Per step" value={`${(total / steps.length).toFixed(1)} s`} sub={`${steps.length} steps`} />
        </Stats>
        <Note>Kiosk mode fills the screen for a sink-side tablet: big text, tap anywhere to start, it resets itself after each wash. Space bar works too when a keyboard is attached.</Note>
      </div>
    </Split>
  )
}
