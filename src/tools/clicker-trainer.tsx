import { useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, CsvButton, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, Txt, num, pct, today, uid, useToolState } from '../kit'
import { advice, behaviorStats, dailyKcal, perMinute, treatShare, type Behavior, type Rep } from './lib/clicker-trainer'

type Sound = 'box' | 'soft' | 'pen' | 'tongue'
interface Past { date: string; minutes: number; clicks: number; treats: number; best: string }
interface State {
  sound: Sound; volume: number; autoTreat: boolean; kg: number; kcal: number
  behaviors: Behavior[]; current: string; history: Past[]
}
const DEF: State = {
  sound: 'box', volume: 0.8, autoTreat: true, kg: 12, kcal: 3,
  behaviors: [
    { id: 'charge', name: 'Charge the clicker', cue: 'click → treat, no cue' },
    { id: 'sit', name: 'Sit', cue: '“Sit”' },
    { id: 'down', name: 'Down', cue: '“Down”' },
    { id: 'touch', name: 'Hand touch', cue: 'flat palm' },
    { id: 'leave', name: 'Leave it', cue: '“Leave it”' },
  ],
  current: 'sit',
  history: [
    { date: '2026-10-14', minutes: 6, clicks: 34, treats: 34, best: 'Charge the clicker' },
    { date: '2026-10-15', minutes: 8, clicks: 41, treats: 41, best: 'Sit 86%' },
    { date: '2026-10-16', minutes: 7, clicks: 38, treats: 40, best: 'Hand touch 90%' },
  ],
}
const SOUNDS: [Sound, string][] = [['box', 'Box clicker (classic)'], ['soft', 'Soft click (sound-sensitive dogs)'], ['pen', 'Pen click (bright)'], ['tongue', 'Tongue click']]
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function ClickerTrainer() {
  const [s, set, reset] = useToolState('clicker-trainer', DEF)
  const [reps, setReps] = useState<Rep[]>([])
  const [treats, setTreats] = useState(0)
  const [run, setRun] = useState<{ start: number; acc: number; on: boolean }>({ start: 0, acc: 0, on: false })
  const [now, setNow] = useState(() => Date.now())
  const [flash, setFlash] = useState(0)
  const [newName, setNewName] = useState('')
  const ac = useRef<AudioContext | null>(null)
  const noise = useRef<AudioBuffer | null>(null)
  const elapsed = (run.acc + (run.on ? now - run.start : 0)) / 1000

  useEffect(() => {
    if (!run.on) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [run.on])

  const burst = (ctx: AudioContext, at: number, freq: number, q: number, len: number, gain: number, type: BiquadFilterType = 'bandpass') => {
    const src = ctx.createBufferSource()
    src.buffer = noise.current
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain * s.volume, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + len)
    src.connect(f).connect(g).connect(ctx.destination)
    src.start(at)
    src.stop(at + len + 0.01)
  }
  const tone = (ctx: AudioContext, at: number, f0: number, f1: number, len: number, gain: number) => {
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.setValueAtTime(f0, at)
    o.frequency.exponentialRampToValueAtTime(f1, at + len)
    g.gain.setValueAtTime(gain * s.volume, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + len)
    o.connect(g).connect(ctx.destination)
    o.start(at)
    o.stop(at + len + 0.01)
  }
  const click = () => {
    const ctx = (ac.current ??= new AudioContext())
    void ctx.resume()
    if (!noise.current) {
      const b = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate)
      const d = b.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      noise.current = b
    }
    const t = ctx.currentTime + 0.005
    if (s.sound === 'box') {
      // metal tongue press + release
      burst(ctx, t, 3200, 3, 0.012, 1.6)
      tone(ctx, t, 2300, 1900, 0.02, 0.5)
      burst(ctx, t + 0.07, 4200, 3, 0.009, 1.1)
      tone(ctx, t + 0.07, 2800, 2400, 0.015, 0.35)
    } else if (s.sound === 'soft') {
      burst(ctx, t, 1100, 1, 0.02, 0.9, 'lowpass')
      burst(ctx, t + 0.06, 1300, 1, 0.015, 0.5, 'lowpass')
    } else if (s.sound === 'pen') {
      burst(ctx, t, 5200, 4, 0.008, 1.4)
      burst(ctx, t + 0.04, 6000, 4, 0.006, 0.9)
    } else {
      tone(ctx, t, 1500, 500, 0.035, 0.9)
      burst(ctx, t, 2000, 2, 0.01, 0.6)
    }
  }

  const ensureRun = () => setRun((r) => (r.on ? r : { start: Date.now(), acc: r.acc, on: true }))
  const mark = (ok: boolean) => {
    if (ok) {
      click()
      setFlash((f) => f + 1)
      if (s.autoTreat) setTreats((x) => x + 1)
      navigator.vibrate?.(15)
    }
    setReps((r) => [...r, { t: Date.now(), behavior: s.current, ok }])
    ensureRun()
  }
  const finish = () => {
    if (!reps.length) return
    const best = s.behaviors.map((b) => ({ b, st: behaviorStats(reps, b.id) })).filter((x) => x.st.tries > 0).sort((a, b) => b.st.clicks - a.st.clicks)[0]
    set({ history: [...s.history, { date: today(), minutes: Math.round(elapsed / 6) / 10, clicks: reps.filter((r) => r.ok).length, treats, best: best ? `${best.b.name} ${Math.round(best.st.rate * 100)}%` : '' }] })
    setReps([])
    setTreats(0)
    setRun({ start: 0, acc: 0, on: false })
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      if (e.code === 'Space') { e.preventDefault(); mark(true) }
      else if (e.key === 'm' || e.key === 'M') mark(false)
      else if (e.key === 't' || e.key === 'T') setTreats((x) => x + 1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const clicks = reps.filter((r) => r.ok).length
  const cur = s.behaviors.find((b) => b.id === s.current) ?? s.behaviors[0]
  const st = cur ? behaviorStats(reps, cur.id) : null
  const adv = st ? advice(st.rate10, st.tries) : null
  const share = treatShare(treats, s.kcal, dailyKcal(s.kg))

  return (
    <Split wide="left">
      <div>
        <Panel>
          <div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
            <Row>
              {s.behaviors.map((b) => <Btn key={b.id} kind={b.id === s.current ? 'primary' : 'normal'} onClick={() => set({ current: b.id })}>{b.name}</Btn>)}
            </Row>
            {cur && <p className="muted" style={{ margin: 0 }}>Cue: {cur.cue}</p>}
            <button
              type="button"
              key={flash}
              onPointerDown={(e) => { e.preventDefault(); mark(true) }}
              onKeyDown={(e) => { if (e.key === 'Enter') mark(true) }}
              aria-label="Click"
              style={{
                width: 'min(80vw, 300px)', height: 'min(80vw, 300px)', borderRadius: '42% 42% 48% 48%', border: '6px solid #b45309', cursor: 'pointer', userSelect: 'none', touchAction: 'manipulation',
                background: 'radial-gradient(circle at 40% 30%, #fde047, #f59e0b 70%)', color: '#451a03', fontSize: 30, fontWeight: 900,
                animation: flash ? 'ct-pop .18s ease-out' : undefined, boxShadow: '0 12px 30px rgba(180,83,9,.35)',
              }}
            >
              CLICK!<br /><span style={{ fontSize: 15, fontWeight: 600 }}>tap · space bar</span>
            </button>
            <style>{'@keyframes ct-pop{0%{transform:scale(.93)}100%{transform:scale(1)}}'}</style>
            <Row>
              <Btn onClick={() => mark(false)} title="M">✗ Miss (no click)</Btn>
              <Btn onClick={() => setTreats((x) => x + 1)} title="T">🦴 +1 treat</Btn>
              {run.on ? <Btn onClick={() => setRun((r) => ({ start: 0, acc: r.acc + Date.now() - r.start, on: false }))}>⏸ Pause</Btn> : <Btn onClick={ensureRun}>▶ Timer</Btn>}
              <Btn kind="primary" disabled={!reps.length} onClick={finish}>Finish & save</Btn>
              <Btn kind="ghost" disabled={!reps.length} onClick={() => setReps((r) => r.slice(0, -1))}>Undo</Btn>
            </Row>
          </div>
        </Panel>
        <Stats>
          <Stat label="Session" value={clock(elapsed)} sub={elapsed > 600 ? 'long session: take a break' : 'aim for 3–10 min'} tone={elapsed > 600 ? 'bad' : undefined} />
          <Stat label="Clicks" value={clicks} sub={elapsed >= 10 ? `${num(perMinute(clicks, elapsed), 1)} per min` : 'rate after 10 s'} />
          <Stat label="Treats" value={treats} sub={`${pct(share, 0)} of daily calories`} tone={share > 0.1 ? 'bad' : undefined} />
          <Stat label={cur?.name ?? 'Behavior'} value={st && st.tries ? pct(st.rate, 0) : '—'} sub={st ? `${st.clicks}/${st.tries} success` : undefined} />
        </Stats>
        {adv && <Note tone={adv.tone}>{adv.text}</Note>}
        <Panel title="This session by behavior">
          <Table
            head={['Behavior', 'Tries', 'Clicks', 'Success', 'Last 10']}
            rows={s.behaviors.map((b) => ({ b, x: behaviorStats(reps, b.id) })).filter((r) => r.x.tries).map(({ b, x }) => [
              b.name, x.tries, x.clicks,
              <div key="r" style={{ minWidth: 90 }}><div>{pct(x.rate, 0)}</div><Bar value={x.rate} color={x.rate >= 0.8 ? 'var(--ok)' : x.rate < 0.5 ? 'var(--err)' : 'var(--warn)'} /></div>,
              <span key="l" style={{ letterSpacing: 2 }}>{reps.filter((r) => r.behavior === b.id).slice(-10).map((r) => (r.ok ? '●' : '○')).join('')}</span>,
            ])}
          />
          {!reps.length && <p className="muted">Tap the clicker the instant the behavior happens, then treat. Use Miss when the dog gets it wrong so the success rate stays honest.</p>}
        </Panel>
      </div>
      <div>
        <Panel title="Clicker">
          <Select label="Sound" value={s.sound} onChange={(sound) => set({ sound })} options={SOUNDS} />
          <Slider label="Volume" value={s.volume} min={0.1} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(volume) => set({ volume })} />
          <Row><Btn onClick={click}>🔊 Test sound</Btn></Row>
          <Check label="Count a treat with every click" value={s.autoTreat} onChange={(autoTreat) => set({ autoTreat })} />
        </Panel>
        <Panel title="Treat budget">
          <Row>
            <Num label="Dog weight" value={s.kg} unit="kg" min={0.5} onChange={(kg) => set({ kg })} />
            <Num label="Per treat" value={s.kcal} unit="kcal" min={0} onChange={(kcal) => set({ kcal })} />
          </Row>
          <p className="muted" style={{ margin: 0 }}>≈ {num(dailyKcal(s.kg), 0)} kcal/day (1.6 × RER). Keep treats under 10 % (≈ {num(dailyKcal(s.kg) * 0.1 / (s.kcal || 1), 0)} treats) or reduce meals.</p>
        </Panel>
        <Panel title="Behaviors">
          {s.behaviors.map((b) => (
            <div key={b.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 6, marginBottom: 6 }}>
              <input value={b.name} aria-label="Behavior" onChange={(e) => set({ behaviors: s.behaviors.map((x) => (x.id === b.id ? { ...x, name: e.target.value } : x)) })} className="k-text" />
              <input value={b.cue} aria-label="Cue" onChange={(e) => set({ behaviors: s.behaviors.map((x) => (x.id === b.id ? { ...x, cue: e.target.value } : x)) })} className="k-text" />
              <Btn kind="ghost" disabled={s.behaviors.length < 2} onClick={() => set({ behaviors: s.behaviors.filter((x) => x.id !== b.id), current: s.current === b.id ? s.behaviors.find((x) => x.id !== b.id)!.id : s.current })}>✕</Btn>
            </div>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); if (newName.trim()) { const id = uid(); set({ behaviors: [...s.behaviors, { id, name: newName.trim(), cue: '' }], current: id }); setNewName('') } }}>
            <Txt label="Add behavior" value={newName} onChange={setNewName} placeholder="e.g. Spin, Recall, Paw" />
          </form>
        </Panel>
        <Panel title="History" actions={<><CsvButton name="clicker-sessions.csv" rows={() => [['Date', 'Minutes', 'Clicks', 'Treats', 'Best'], ...s.history.map((h) => [h.date, h.minutes, h.clicks, h.treats, h.best])]} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Table head={['Date', 'Min', 'Clicks', 'Treats', 'Best']} rows={[...s.history].reverse().map((h) => [h.date, h.minutes, h.clicks, h.treats, h.best])} max={10} />
        </Panel>
      </div>
    </Split>
  )
}
