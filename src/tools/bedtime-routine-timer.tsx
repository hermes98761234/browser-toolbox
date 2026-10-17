import { useEffect, useRef, useState } from 'react'
import { Btn, Check, Note, Panel, Row, Split, Txt, uid, useToolState } from '../kit'

interface Step { id: string; emoji: string; name: string; min: number }
interface State { steps: Step[]; lightsOut: string; auto: boolean; sound: boolean; kid: string }

const DEF: State = {
  kid: 'Mia',
  lightsOut: '20:00',
  auto: false,
  sound: true,
  steps: [
    { id: 'tidy', emoji: '🧸', name: 'Tidy up toys', min: 5 },
    { id: 'bath', emoji: '🛁', name: 'Bath time', min: 10 },
    { id: 'pj', emoji: '👕', name: 'Pajamas on', min: 4 },
    { id: 'teeth', emoji: '🪥', name: 'Brush teeth', min: 3 },
    { id: 'potty', emoji: '🚽', name: 'Potty & wash hands', min: 2 },
    { id: 'story', emoji: '📖', name: 'Story time', min: 15 },
    { id: 'night', emoji: '🌙', name: 'Cuddle & lights out', min: 5 },
  ],
}
const EMOJI = ['🧸', '🛁', '👕', '🪥', '🚽', '📖', '🌙', '🥛', '🍎', '🎵', '🙏', '💧', '🧴', '🛏️', '⭐', '🐻', '🧦', '🎒', '💤', '🤗']
const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#a855f7', '#14b8a6', '#f97316']

function chime(kind: 'step' | 'done') {
  try {
    const ctx = new AudioContext()
    const notes = kind === 'done' ? [523, 659, 784, 1047, 784, 1047] : [784, 659, 523]
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.18
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'triangle'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.55)
    })
    setTimeout(() => void ctx.close(), 2500)
  } catch {
    /* audio unavailable */
  }
}

const mmss = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`

export default function BedtimeRoutineTimer() {
  const [s, set, reset] = useToolState('bedtime-routine-timer', DEF)
  const [idx, setIdx] = useState(-1) // -1 = not started; steps.length = finished
  const [left, setLeft] = useState(0)
  const [running, setRunning] = useState(false)
  const [edit, setEdit] = useState(false)
  const endAt = useRef(0)
  const rang = useRef(false)
  const steps = s.steps
  const total = steps.reduce((a, x) => a + x.min, 0)
  const [lh, lm] = s.lightsOut.split(':').map(Number)
  const startMin = (((lh || 0) * 60 + (lm || 0) - total) % 1440 + 1440) % 1440
  const startBy = `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`
  const finished = idx >= steps.length
  const cur = idx >= 0 && !finished ? steps[idx] : null

  const begin = (i: number) => {
    if (i >= steps.length) {
      setIdx(steps.length)
      setRunning(false)
      if (s.sound) chime('done')
      return
    }
    setIdx(i)
    setLeft(steps[i].min * 60)
    endAt.current = Date.now() + steps[i].min * 60_000
    rang.current = false
    setRunning(true)
  }

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const l = (endAt.current - Date.now()) / 1000
      setLeft(l)
      if (l <= 0 && !rang.current) {
        rang.current = true
        if (s.sound) chime('step')
        if (s.auto) begin(idx + 1)
      }
    }, 250)
    return () => clearInterval(id)
  })

  const pause = () => {
    if (running) setRunning(false)
    else {
      endAt.current = Date.now() + left * 1000
      setRunning(true)
    }
  }
  const editStep = (id: string, p: Partial<Step>) => set({ steps: steps.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= steps.length) return
    const n = [...steps]
    ;[n[i], n[j]] = [n[j], n[i]]
    set({ steps: n })
  }

  const frac = cur ? Math.max(0, left) / (cur.min * 60 || 1) : 0
  const R = 92
  const C = 2 * Math.PI * R
  const color = COLORS[Math.max(0, idx) % COLORS.length]
  const over = cur && left <= 0

  return (
    <Split wide="left">
      <div>
        <Panel title={`${s.kid ? s.kid + "'s" : 'My'} bedtime routine`}>
          <style>{`@keyframes brt-pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}@keyframes brt-wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}`}</style>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            {steps.map((x, i) => {
              const done = i < idx
              return (
                <button key={x.id} type="button" onClick={() => begin(i)} title={x.name} style={{ fontSize: 26, width: 50, height: 50, borderRadius: 14, border: `2px solid ${i === idx ? COLORS[i % COLORS.length] : 'var(--line)'}`, background: done ? COLORS[i % COLORS.length] + '33' : 'var(--panel)', position: 'relative', cursor: 'pointer', opacity: done || i === idx || idx < 0 ? 1 : 0.55 }}>
                  {x.emoji}
                  {done && <span style={{ position: 'absolute', right: -6, top: -8, fontSize: 16 }}>⭐</span>}
                </button>
              )
            })}
          </div>

          {idx < 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 84 }}>🌜</div>
              <h2 style={{ margin: '6px 0' }}>Ready for bed{s.kid ? `, ${s.kid}` : ''}?</h2>
              <p className="muted">{steps.length} steps · {total} minutes · start by <b>{startBy}</b> for lights out at <b>{s.lightsOut}</b></p>
              <button type="button" className="k-btn primary" style={{ fontSize: 22, padding: '14px 34px', borderRadius: 999 }} onClick={() => begin(0)} disabled={!steps.length}>▶ Let's go!</button>
            </div>
          )}

          {cur && (
            <div key={cur.id} style={{ textAlign: 'center', animation: 'brt-pop .45s ease-out' }}>
              <div style={{ position: 'relative', width: 220, height: 220, margin: '0 auto' }}>
                <svg viewBox="0 0 220 220" width={220} height={220}>
                  <circle cx={110} cy={110} r={R} fill="none" stroke="var(--line)" strokeWidth={16} />
                  <circle cx={110} cy={110} r={R} fill="none" stroke={over ? 'var(--warn)' : color} strokeWidth={16} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 110 110)" style={{ transition: 'stroke-dashoffset .25s linear' }} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 76, animation: over ? 'brt-wiggle .6s infinite' : undefined }}>{cur.emoji}</span>
                  <b style={{ fontSize: 26, fontFamily: 'var(--mono)' }}>{over ? "Time's up!" : mmss(left)}</b>
                </div>
              </div>
              <h2 style={{ margin: '10px 0 4px', color }}>{cur.name}</h2>
              <p className="muted" style={{ margin: 0 }}>Step {idx + 1} of {steps.length}</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                <button type="button" className="k-btn" style={{ fontSize: 18, padding: '12px 18px' }} onClick={() => begin(idx - 1)} disabled={idx === 0}>◀</button>
                <button type="button" className="k-btn" style={{ fontSize: 18, padding: '12px 18px' }} onClick={pause}>{running ? '⏸ Pause' : '▶ Resume'}</button>
                <button type="button" className="k-btn primary" style={{ fontSize: 20, padding: '12px 26px', borderRadius: 999 }} onClick={() => begin(idx + 1)}>✓ Done!</button>
              </div>
            </div>
          )}

          {finished && (
            <div style={{ textAlign: 'center', padding: '16px 0', animation: 'brt-pop .6s ease-out' }}>
              <div style={{ fontSize: 40, letterSpacing: 4 }}>{steps.map(() => '⭐').join('')}</div>
              <div style={{ fontSize: 80 }}>😴</div>
              <h2 style={{ margin: '6px 0' }}>All done! Sweet dreams{s.kid ? `, ${s.kid}` : ''}!</h2>
              <p className="muted">You earned {steps.length} stars tonight.</p>
              <Btn onClick={() => setIdx(-1)}>Start over</Btn>
            </div>
          )}

          <div style={{ height: 10, borderRadius: 5, background: 'var(--line)', marginTop: 16, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(Math.max(0, Math.min(idx, steps.length)) / (steps.length || 1)) * 100}%`, background: 'linear-gradient(90deg, #6366f1, #ec4899)', transition: 'width .5s' }} />
          </div>
        </Panel>
      </div>
      <div>
        <Panel title="Settings">
          <Row>
            <Txt label="Child's name" value={s.kid} onChange={(kid) => set({ kid })} />
            <Txt label="Lights out" type="time" value={s.lightsOut} onChange={(lightsOut) => set({ lightsOut })} />
          </Row>
          <Note>Routine takes <b>{total} min</b>. Start by <b>{startBy}</b>.</Note>
          <Check label="Chime when a step's time is up" value={s.sound} onChange={(sound) => set({ sound })} />
          <Check label="Move on automatically when time is up" value={s.auto} onChange={(auto) => set({ auto })} />
        </Panel>
        <Panel
          title="Steps"
          actions={
            <>
              <Btn kind="ghost" onClick={() => setEdit(!edit)}>{edit ? 'Done' : '✎ Edit'}</Btn>
              <Btn kind="ghost" onClick={() => { reset(); setIdx(-1) }}>Reset</Btn>
            </>
          }
        >
          {steps.map((x, i) =>
            edit ? (
              <div key={x.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                <select value={x.emoji} onChange={(e) => editStep(x.id, { emoji: e.target.value })} aria-label="Picture" style={{ fontSize: 20 }}>
                  {EMOJI.map((em) => <option key={em}>{em}</option>)}
                </select>
                <input value={x.name} onChange={(e) => editStep(x.id, { name: e.target.value })} aria-label="Step name" style={{ flex: 1, minWidth: 110 }} />
                <input type="number" min={1} max={60} value={x.min} onChange={(e) => editStep(x.id, { min: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} aria-label="Minutes" style={{ width: 54 }} />
                <span className="muted">min</span>
                <Btn kind="ghost" title="Up" onClick={() => move(i, -1)}>↑</Btn>
                <Btn kind="ghost" title="Down" onClick={() => move(i, 1)}>↓</Btn>
                <Btn kind="ghost" title="Remove" onClick={() => set({ steps: steps.filter((y) => y.id !== x.id) })}>✕</Btn>
              </div>
            ) : (
              <div key={x.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 24 }}>{x.emoji}</span>
                <span style={{ flex: 1, fontWeight: i === idx ? 700 : 400 }}>{x.name}</span>
                <span className="muted">{x.min} min</span>
              </div>
            ),
          )}
          {edit && <Btn onClick={() => set({ steps: [...steps, { id: uid(), emoji: '⭐', name: 'New step', min: 5 }] })}>+ Add step</Btn>}
          <p className="muted" style={{ fontSize: 13 }}>Tip: tap any picture in the routine to jump to that step. Steps and settings are saved on this device.</p>
        </Panel>
      </div>
    </Split>
  )
}
