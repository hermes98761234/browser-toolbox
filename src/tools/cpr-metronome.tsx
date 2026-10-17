import { useCallback, useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, Note, Panel, Seg, Slider, Split, Stat, Stats, Table, num, pct, useToolState } from '../kit'
import { clampRate, cycleInfo, events, fmtClock, phaseAt, tapFeedback, type CprCfg, type Phase } from './lib/cpr-metronome'

type Mode = 'adult' | 'child2' | 'continuous'
interface Session { t: number; secs: number; compressions: number; cycles: number; tapRate: number | null }
interface State { mode: Mode; bpm: number; pause: number; switchEvery: number; voice: boolean; clicks: boolean; sessions: Session[] }
const MODES: Record<Mode, { label: string; compressions: number; breaths: number; hint: string }> = {
  adult: { label: 'Adult 30:2', compressions: 30, breaths: 2, hint: 'Adults, and children/infants with a single rescuer: 30 compressions, then 2 breaths.' },
  child2: { label: 'Child 15:2', compressions: 15, breaths: 2, hint: 'Children and infants with two trained rescuers: 15 compressions, then 2 breaths.' },
  continuous: { label: 'Continuous', compressions: 0, breaths: 0, hint: 'Hands-only CPR, or with an advanced airway (one breath every 6 s given by a second rescuer).' },
}
const DEF: State = {
  mode: 'adult', bpm: 110, pause: 6, switchEvery: 120, voice: true, clicks: true,
  sessions: [{ t: Date.now() - 864e5, secs: 125, compressions: 210, cycles: 7, tapRate: 113 }],
}

export default function CprMetronome() {
  const [s, set] = useToolState('cpr-metronome', DEF)
  const cfg: CprCfg = { bpm: clampRate(s.bpm), compressions: MODES[s.mode].compressions, breaths: MODES[s.mode].breaths, pause: Math.max(3, Math.min(10, s.pause)), switchEvery: s.switchEvery }
  const ci = cycleInfo(cfg)
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<Phase | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [lock, setLock] = useState<'off' | 'on' | 'unsupported'>('off')
  const [taps, setTaps] = useState<number[]>([])
  const audio = useRef<AudioContext | null>(null)
  const run = useRef<{ stop: () => void } | null>(null)
  const tapsRef = useRef<number[]>([])

  const say = (text: string) => {
    if (typeof speechSynthesis === 'undefined') return
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.1
    speechSynthesis.speak(u)
  }

  const stop = useCallback(() => run.current?.stop(), [])

  const start = async () => {
    const ctx = (audio.current ??= new AudioContext())
    await ctx.resume()
    const c = { ...cfg }
    const voice = s.voice, clicks = s.clicks
    const t0 = ctx.currentTime + 0.15
    let scheduledTo = 0
    const timers: number[] = []
    const beep = (at: number, f: number, g: number, len = 0.05) => {
      const o = ctx.createOscillator(), gn = ctx.createGain()
      o.frequency.value = f
      gn.gain.setValueAtTime(0.0001, at)
      gn.gain.exponentialRampToValueAtTime(g, at + 0.003)
      gn.gain.exponentialRampToValueAtTime(0.0001, at + len)
      o.connect(gn).connect(ctx.destination)
      o.start(at)
      o.stop(at + len + 0.02)
    }
    const schedule = () => {
      const now = ctx.currentTime - t0
      const until = now + 0.2
      for (const e of events(scheduledTo, until, c)) {
        const at = t0 + e.t
        if (e.kind === 'click' || e.kind === 'accent') { if (clicks) beep(at, e.kind === 'accent' ? 1500 : 1000, e.kind === 'accent' ? 0.5 : 0.35) }
        else {
          if (e.kind === 'breaths') { beep(at, 440, 0.4, 0.25); beep(at + 0.3, 330, 0.4, 0.3) }
          const text = e.kind === 'breaths' ? `Give ${c.breaths} breaths` : e.kind === 'resume' ? 'Resume compressions' : 'Switch compressor'
          if (voice) timers.push(window.setTimeout(() => say(text), Math.max(0, (at - ctx.currentTime) * 1000)))
        }
      }
      scheduledTo = until
    }
    schedule()
    const iv = window.setInterval(schedule, 25)
    let raf = 0
    const frame = () => {
      const t = Math.max(0, ctx.currentTime - t0)
      setElapsed(t)
      setPhase(phaseAt(t, c))
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    if (voice) say(c.compressions ? `Start compressions. ${c.compressions} to ${c.breaths}.` : 'Start continuous compressions')
    let sentinel: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    if (nav.wakeLock) {
      try { sentinel = await nav.wakeLock.request('screen'); setLock('on') } catch { setLock('off') }
    } else setLock('unsupported')
    tapsRef.current = []
    setTaps([])
    setRunning(true)
    run.current = {
      stop: () => {
        clearInterval(iv)
        cancelAnimationFrame(raf)
        timers.forEach(clearTimeout)
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
        void sentinel?.release().catch(() => undefined)
        setLock('off')
        const t = Math.max(0, ctx.currentTime - t0)
        const ph = phaseAt(t, c)
        const comps = c.compressions ? (ph.cycle - 1) * c.compressions + (ph.kind === 'compress' ? ph.count : c.compressions) : Math.floor((t * c.bpm) / 60)
        const fbk = tapFeedback(tapsRef.current)
        if (t > 10) set((st) => ({ ...st, sessions: [...st.sessions.slice(-49), { t: Date.now(), secs: Math.round(t), compressions: comps, cycles: ph.cycle, tapRate: fbk ? Math.round(fbk.rate) : null }] }))
        setRunning(false)
        setPhase(null)
        run.current = null
      },
    }
  }
  useEffect(() => () => run.current?.stop(), [])

  const tap = useCallback((ts: number) => {
    if (!run.current) return
    tapsRef.current = [...tapsRef.current.slice(-60), ts]
    setTaps(tapsRef.current)
  }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === 'Space' && run.current && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); tap(e.timeStamp) }
      if (e.key === 'Escape') stop()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [tap, stop])
  const fb = tapFeedback(taps)

  const switchIn = cfg.switchEvery > 0 ? cfg.switchEvery - (elapsed % cfg.switchEvery) : 0
  const pressed = phase?.kind === 'compress' && phase.nextAt - elapsed > (60 / cfg.bpm) * 0.55
  const breathing = phase?.kind === 'breathe'
  const label = !phase ? 'Ready' : phase.kind === 'compress' ? String(phase.count) : `Breath ${phase.breath}`
  const progress = !phase ? 0 : phase.kind === 'compress' ? (cfg.compressions ? phase.count / cfg.compressions : ((elapsed * cfg.bpm) / 60 % 10) / 10) : 1

  return (
    <Split>
      <div>
        <Note tone="warn"><b>Training aid only — not a medical device.</b> In a real emergency call your local emergency number (112 / 911 / 999) first, put the phone on speaker and follow the dispatcher, and use an AED as soon as one arrives. Practise on a manikin, never on a person.</Note>
        <Panel title="Protocol">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={(Object.keys(MODES) as Mode[]).map((m) => [m, MODES[m].label] as [Mode, string])} label="Protocol" />
          <p className="muted" style={{ fontSize: 13 }}>{MODES[s.mode].hint}</p>
          <Slider label="Compression rate" value={clampRate(s.bpm)} onChange={(bpm) => set({ bpm })} min={100} max={120} unit="/min" />
          {cfg.compressions > 0 && <Slider label="Pause for breaths" value={cfg.pause} onChange={(pause) => set({ pause })} min={3} max={10} step={0.5} unit=" s" />}
          <Slider label="Switch compressor every" value={s.switchEvery} onChange={(switchEvery) => set({ switchEvery })} min={0} max={300} step={30} show={(v) => (v ? fmtClock(v) : 'never')} />
          <Check label="Voice prompts (breaths, resume, switch)" value={s.voice} onChange={(voice) => set({ voice })} />
          <Check label="Click on every compression (accent every 10th)" value={s.clicks} onChange={(clicks) => set({ clicks })} />
        </Panel>
        <Panel title="Cycle math">
          <Table head={['', 'Value']} rows={[
            ['Compression interval', `${num(60000 / cfg.bpm, 0)} ms`],
            ['Compressing per cycle', Number.isFinite(ci.comp) ? `${num(ci.comp, 1)} s` : 'continuous'],
            ['Full cycle', Number.isFinite(ci.total) ? `${num(ci.total, 1)} s` : '—'],
            ['Compression fraction', pct(ci.fraction, 0)],
            ['Delivered compressions / min', num(ci.perMinute, 0)],
            ['Cycles per 2 minutes', Number.isFinite(ci.total) ? num(120 / ci.total, 1) : '—'],
          ]} />
          <p className="muted" style={{ fontSize: 13 }}>Guidelines (AHA / ERC): 100–120 compressions per minute, depth 5–6 cm in adults, full chest recoil, pauses under 10 s, compression fraction above 60% (ideally 80%).</p>
        </Panel>
      </div>
      <div>
        <Panel title="Metronome" actions={running ? <Btn kind="danger" onClick={stop}>■ Stop (Esc)</Btn> : <Btn kind="primary" onClick={() => void start()}>▶ Start practice</Btn>}>
          <div style={{ display: 'grid', placeItems: 'center', padding: '10px 0' }}>
            <div onPointerDown={(e) => tap(e.timeStamp)} role="button" aria-label="Tap on each compression" style={{
              width: 230, height: 230, borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: running ? 'pointer' : 'default', userSelect: 'none', touchAction: 'manipulation',
              background: breathing ? 'color-mix(in srgb, var(--accent2) 30%, var(--panel))' : running ? 'color-mix(in srgb, var(--err) 22%, var(--panel))' : 'var(--panel2)',
              border: `6px solid ${breathing ? 'var(--accent2)' : running ? 'var(--err)' : 'var(--line)'}`,
              transform: pressed ? 'scale(0.9)' : 'scale(1)', transition: 'transform 70ms ease-out, background 200ms',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: !phase ? 44 : breathing ? 34 : 72, fontWeight: 800, lineHeight: 1 }}>{label}</div>
                <div className="muted" style={{ marginTop: 6 }}>{!phase ? `${cfg.bpm}/min` : breathing ? 'Give rescue breaths' : cfg.compressions ? `of ${cfg.compressions} · cycle ${phase.cycle}` : 'push hard, push fast'}</div>
              </div>
            </div>
            <div style={{ width: '100%', marginTop: 14 }}><Bar value={progress} color={breathing ? 'var(--accent2)' : 'var(--err)'} /></div>
          </div>
          <Stats>
            <Stat label="Elapsed" value={fmtClock(elapsed)} />
            <Stat label="Switch in" value={cfg.switchEvery && running ? fmtClock(switchIn) : '—'} tone={running && switchIn < 10 ? 'bad' : undefined} />
            <Stat label="Screen wake lock" value={lock === 'on' ? '🔒 On' : lock === 'unsupported' ? 'n/a' : 'Off'} sub={lock === 'unsupported' ? 'browser lacks Wake Lock' : 'keeps the display awake'} />
          </Stats>
          <p className="muted" style={{ fontSize: 13 }}>Practice feedback: tap the circle (or press Space) on every compression you do on the manikin.</p>
          {fb && running && <Note tone={fb.good ? 'ok' : 'warn'}>Your rate: <b>{num(fb.rate, 0)}/min</b> · {pct(fb.inRange, 0)} of compressions in the 100–120 window · ±{num(fb.sd, 0)} ms jitter. {fb.verdict}</Note>}
        </Panel>
        <Panel title="Practice log" actions={<Btn kind="ghost" onClick={() => set({ sessions: [] })}>Clear</Btn>}>
          {s.sessions.length ? (
            <Table head={['Date', 'Duration', 'Compressions', 'Cycles', 'Your tapped rate']} rows={[...s.sessions].reverse().slice(0, 10).map((x) => [new Date(x.t).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }), fmtClock(x.secs), x.compressions, x.cycles, x.tapRate ? <b key="r" style={{ color: x.tapRate >= 100 && x.tapRate <= 120 ? 'var(--ok)' : 'var(--err)' }}>{x.tapRate}/min</b> : '—'])} />
          ) : <p className="muted">Sessions longer than 10 s are logged here (on this device only).</p>}
        </Panel>
      </div>
    </Split>
  )
}
