import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CsvButton, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, num, today, useToolState } from '../kit'
import { breathsPerMinute, cycleLength, fullness, phaseAt, phases, type Pattern, type PhaseKind } from './lib/breathing-exercise-guide'

const PRESETS: { id: string; name: string; p: Pattern; tip: string }[] = [
  { id: 'box', name: 'Box breathing 4-4-4-4', p: [4, 4, 4, 4], tip: 'Used by pilots and first responders to steady the mind under stress. Even counts on every side of the “box”.' },
  { id: '478', name: '4-7-8 relaxing breath', p: [4, 7, 8, 0], tip: 'Inhale through the nose, hold, then a long whooshing exhale through the mouth. Popular before sleep. Start with 4 cycles.' },
  { id: 'coherent', name: 'Coherent 5.5 / 5.5', p: [5.5, 0, 5.5, 0], tip: 'About 5.5 breaths per minute, the rate often linked with higher heart-rate variability. Smooth, no pauses.' },
  { id: 'calm', name: 'Calming 4-0-6-0', p: [4, 0, 6, 0], tip: 'A longer exhale than inhale nudges the body toward rest. Easy for beginners.' },
  { id: 'triangle', name: 'Triangle 4-4-4', p: [4, 4, 4, 0], tip: 'Three even sides; a gentler alternative to box breathing.' },
  { id: 'energize', name: 'Energizing 4-0-2-0', p: [4, 0, 2, 0], tip: 'Short sharp exhales feel activating. Stop if you feel light-headed.' },
  { id: 'custom', name: 'Custom', p: [4, 2, 6, 2], tip: 'Set your own counts below.' },
]
const COLORS: Record<PhaseKind, string> = { in: '#0ea5e9', hold: '#a855f7', out: '#10b981', rest: '#64748b' }
const TONES: Record<PhaseKind, number> = { in: 523.25, hold: 659.25, out: 392, rest: 329.63 }

interface Log { date: string; pattern: string; minutes: number; cycles: number }
interface State { preset: string; custom: Pattern; minutes: number; sound: boolean; voice: boolean; log: Log[] }
const DEF: State = {
  preset: 'box', custom: [4, 2, 6, 2], minutes: 3, sound: true, voice: false,
  log: [
    { date: '2026-10-14', pattern: 'Box breathing 4-4-4-4', minutes: 3, cycles: 11 },
    { date: '2026-10-15', pattern: '4-7-8 relaxing breath', minutes: 1.3, cycles: 4 },
    { date: '2026-10-16', pattern: 'Coherent 5.5 / 5.5', minutes: 5, cycles: 27 },
  ],
}

export default function BreathingExerciseGuide() {
  const [s, set, reset] = useToolState('breathing-exercise-guide', DEF)
  const preset = PRESETS.find((p) => p.id === s.preset) ?? PRESETS[0]
  const pat: Pattern = preset.id === 'custom' ? s.custom : preset.p
  const L = cycleLength(pat)
  const [running, setRunning] = useState(false)
  const [t, setT] = useState(0)
  const base = useRef(0) // elapsed seconds banked before the current run
  const startedAt = useRef(0)
  const lastPhase = useRef('')
  const ac = useRef<AudioContext | null>(null)
  const total = s.minutes * 60
  const st = phaseAt(pat, t)

  const beep = (kind: PhaseKind) => {
    const ctx = (ac.current ??= new AudioContext())
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = TONES[kind]
    const now = ctx.currentTime
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(0.18, now + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6)
    o.connect(g).connect(ctx.destination)
    o.start(now)
    o.stop(now + 0.65)
  }

  const finish = (elapsed: number) => {
    setRunning(false)
    const cycles = Math.floor(elapsed / (L || 1))
    if (elapsed >= 20) set((x) => ({ ...x, log: [...x.log, { date: today(), pattern: preset.name, minutes: Math.round((elapsed / 60) * 10) / 10, cycles }] }))
    base.current = 0
    setT(0)
    lastPhase.current = ''
  }

  useEffect(() => {
    if (!running) return
    let raf = 0
    const tick = () => {
      const el = base.current + (performance.now() - startedAt.current) / 1000
      setT(el)
      const ps = phaseAt(pat, el)
      const key = ps ? `${ps.cycle}:${ps.index}` : ''
      if (ps && key !== lastPhase.current) {
        lastPhase.current = key
        if (s.sound) beep(ps.phase.kind)
        if (s.voice && 'speechSynthesis' in window) {
          speechSynthesis.cancel()
          speechSynthesis.speak(new SpeechSynthesisUtterance(ps.phase.label))
        }
      }
      if (total > 0 && el >= total) {
        finish(total)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, pat.join(','), s.sound, s.voice, total])

  const start = () => {
    startedAt.current = performance.now()
    setRunning(true)
    void (ac.current ??= new AudioContext()).resume()
  }
  const pause = () => {
    base.current = t
    setRunning(false)
  }

  const f = st ? fullness(st) : 0
  const kind = st?.phase.kind ?? 'rest'
  const size = 300, c = size / 2, rMin = 58, rMax = 122
  const r = rMin + (rMax - rMin) * f
  // ring of phase segments around the circle
  const ph = phases(pat)
  let acc = 0
  const segs = ph.map((p) => {
    const a0 = (acc / L) * Math.PI * 2 - Math.PI / 2
    acc += p.secs
    const a1 = (acc / L) * Math.PI * 2 - Math.PI / 2
    return { p, a0, a1 }
  })
  const R = 140
  const arc = (a0: number, a1: number) => `M${c + R * Math.cos(a0)},${c + R * Math.sin(a0)}A${R},${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${c + R * Math.cos(a1)},${c + R * Math.sin(a1)}`
  const dotA = (st?.cycleProgress ?? 0) * Math.PI * 2 - Math.PI / 2
  const totalMin = s.log.reduce((a, l) => a + l.minutes, 0)
  const days = new Set(s.log.map((l) => l.date))
  let streak = 0
  const d = new Date()
  if (!days.has(today())) d.setDate(d.getDate() - 1) // streak still alive if you practised yesterday
  while (days.has(d.toISOString().slice(0, 10)) && streak < 1000) {
    streak++
    d.setDate(d.getDate() - 1)
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Pattern">
          <Select label="Technique" value={s.preset} onChange={(preset) => { set({ preset }); base.current = 0; setT(0) }} options={PRESETS.map((p) => [p.id, p.name] as const)} />
          <Note>{preset.tip}</Note>
          {preset.id === 'custom' && (
            <Row>
              {(['Inhale', 'Hold (full)', 'Exhale', 'Hold (empty)'] as const).map((n, i) => (
                <Num key={n} label={n} value={s.custom[i]} min={0} max={30} unit="s" onChange={(v) => set({ custom: s.custom.map((x, j) => (j === i ? Math.max(0, Math.min(30, v)) : x)) as Pattern })} />
              ))}
            </Row>
          )}
          <Slider label="Session length" value={s.minutes} min={1} max={20} step={0.5} unit=" min" onChange={(minutes) => set({ minutes })} />
          <Check label="Soft tone at each phase change" value={s.sound} onChange={(sound) => set({ sound })} />
          <Check label="Spoken cues (speech synthesis)" value={s.voice} onChange={(voice) => set({ voice })} />
        </Panel>
        <Stats>
          <Stat label="Cycle" value={`${num(L, 1)} s`} />
          <Stat label="Breaths / min" value={num(breathsPerMinute(pat), 1)} />
          <Stat label="Cycles in session" value={num(Math.floor(total / (L || 1)), 0)} />
        </Stats>
        <Note tone="warn">Breathe gently and stop if you feel dizzy. Breath holds are not advised during pregnancy or with heart or lung conditions without medical advice.</Note>
      </div>
      <div>
        <Panel title="Follow the circle">
          <div style={{ display: 'grid', placeItems: 'center', gap: 10 }}>
            <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: 360 }} role="img" aria-label={st?.phase.label ?? 'breathing guide'}>
              {segs.map(({ p, a0, a1 }, i) => (
                <path key={i} d={arc(a0 + 0.03, a1 - 0.03)} fill="none" stroke={COLORS[p.kind]} strokeWidth={8} strokeLinecap="round" opacity={st?.index === i ? 1 : 0.35} />
              ))}
              <circle cx={c + R * Math.cos(dotA)} cy={c + R * Math.sin(dotA)} r={8} fill="var(--fg)" />
              <circle cx={c} cy={c} r={rMax} fill="none" stroke="var(--line)" strokeDasharray="4 6" />
              <circle cx={c} cy={c} r={r} fill={COLORS[kind]} opacity={0.22} />
              <circle cx={c} cy={c} r={r * 0.82} fill={COLORS[kind]} opacity={0.55} />
              <text x={c} y={c - 6} textAnchor="middle" fontSize={20} fontWeight={700} fill="var(--fg)">{running || t > 0 ? st?.phase.label : 'Ready'}</text>
              <text x={c} y={c + 26} textAnchor="middle" fontSize={30} fontWeight={800} fill="var(--fg)">{running || t > 0 ? Math.ceil(st?.remaining ?? 0) : num(L, 1) + 's'}</text>
            </svg>
            <Row>
              {running ? <Btn kind="primary" onClick={pause}>⏸ Pause</Btn> : <Btn kind="primary" onClick={start}>{t > 0 ? '▶ Resume' : '▶ Start'}</Btn>}
              <Btn disabled={t === 0} onClick={() => finish(t)}>■ Finish & log</Btn>
            </Row>
            <div style={{ width: '100%', maxWidth: 360 }}>
              <div className="k-bar"><span style={{ width: `${Math.min(100, (t / (total || 1)) * 100)}%`, background: 'var(--accent)' }} /></div>
              <p className="muted" style={{ textAlign: 'center', margin: '6px 0 0' }}>
                Cycle {(st?.cycle ?? 0) + 1} · {Math.floor(t / 60)}:{String(Math.floor(t % 60)).padStart(2, '0')} of {s.minutes} min
              </p>
            </div>
            <Row>
              {ph.map((p, i) => (
                <span key={i} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><i style={{ width: 10, height: 10, borderRadius: 5, background: COLORS[p.kind], display: 'inline-block' }} />{p.label} {num(p.secs, 1)}s</span>
              ))}
            </Row>
          </div>
        </Panel>
        <Panel title="Session log" actions={<><CsvButton name="breathing-sessions.csv" rows={() => [['Date', 'Pattern', 'Minutes', 'Cycles'], ...s.log.map((l) => [l.date, l.pattern, l.minutes, l.cycles])]} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Stats>
            <Stat label="Sessions" value={s.log.length} />
            <Stat label="Total minutes" value={num(totalMin, 1)} />
            <Stat label="Day streak" value={streak} tone={streak > 0 ? 'good' : undefined} />
          </Stats>
          <Table head={['Date', 'Pattern', 'Minutes', 'Cycles', '']} rows={[...s.log].reverse().map((l, i) => [l.date, l.pattern, num(l.minutes, 1), l.cycles, <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ log: s.log.filter((_, j) => j !== s.log.length - 1 - i) })}>✕</Btn>])} max={12} />
        </Panel>
      </div>
    </Split>
  )
}
