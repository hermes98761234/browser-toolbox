import { useEffect, useRef, useState } from 'react'
import { Btn, Check, Note, Num, Panel, Ring, Row, Select, Split, Stat, Stats, Txt, color, uid, useToolState } from '../kit'
import { clock, parseCommand, parseDuration } from './lib/cooking-timer-hub'

// Minimal Web Speech + Wake Lock typings (not in every TS DOM lib).
interface SREvent { results: { length: number; [i: number]: { [j: number]: { transcript: string } } } }
interface SR { lang: string; interimResults: boolean; onresult: ((e: SREvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void }
type SRCtor = new () => SR
const SRClass = (): SRCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}
interface WakeLockSentinelLike { release(): Promise<void> }

type Status = 'idle' | 'running' | 'paused' | 'done'
interface Timer { id: string; name: string; total: number; left: number; endAt: number; status: Status; color: number }
interface State { timers: Timer[]; sound: 'beep' | 'chime' | 'alarm'; volume: number; keepAwake: boolean }

const PRESETS: [string, number][] = [
  ['Soft-boiled egg', 360], ['Hard-boiled egg', 600], ['Pasta (al dente)', 540], ['White rice', 1080], ['Steak rest', 300],
  ['Green tea', 120], ['Black tea', 240], ['French press', 240], ['Pizza', 720], ['Roast chicken', 4800], ['Bread proof', 3600], ['Cookies', 660],
]

const mk = (name: string, total: number, i: number, run = false): Timer => ({ id: uid(), name, total, left: total, endAt: run ? Date.now() + total * 1000 : 0, status: run ? 'running' : 'idle', color: i })

const DEF: State = {
  timers: [mk('Pasta', 540, 0), mk('Garlic bread', 480, 1), mk('Sauce simmer', 1200, 2)],
  sound: 'chime',
  volume: 0.6,
  keepAwake: true,
}

const remaining = (t: Timer, now: number) => (t.status === 'running' ? Math.max(0, (t.endAt - now) / 1000) : t.left)

let ctx: AudioContext | null = null
function ring(kind: State['sound'], vol: number) {
  try {
    ctx ??= new AudioContext()
    void ctx.resume()
    const notes = kind === 'beep' ? [880, 0, 880, 0, 880] : kind === 'chime' ? [784, 988, 1175, 1568] : [600, 900, 600, 900, 600, 900]
    const step = kind === 'chime' ? 0.22 : 0.16
    notes.forEach((f, i) => {
      if (!f || !ctx) return
      const t0 = ctx.currentTime + i * step
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = kind === 'alarm' ? 'square' : 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol * (kind === 'alarm' ? 0.25 : 0.5)), t0 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + step * (kind === 'chime' ? 2.5 : 0.9))
      o.connect(g).connect(ctx.destination)
      o.start(t0)
      o.stop(t0 + step * 3)
    })
  } catch {
    /* audio blocked */
  }
}

export default function CookingTimerHub() {
  const [s, set, reset] = useToolState('cooking-timer-hub', DEF)
  const [now, setNow] = useState(() => Date.now())
  const [name, setName] = useState('Potatoes')
  const [dur, setDur] = useState('20 min')
  const [heard, setHeard] = useState('')
  const [listening, setListening] = useState(false)
  const [lockOn, setLockOn] = useState(false)
  const srRef = useRef<SR | null>(null)
  const lockRef = useRef<WakeLockSentinelLike | null>(null)

  const anyRunning = s.timers.some((t) => t.status === 'running')
  const ringing = s.timers.some((t) => t.status === 'done')

  // Tick; mark timers that reach zero as done.
  useEffect(() => {
    const iv = setInterval(() => {
      const n = Date.now()
      setNow(n)
      set((st) => (st.timers.some((t) => t.status === 'running' && t.endAt <= n) ? { ...st, timers: st.timers.map((t) => (t.status === 'running' && t.endAt <= n ? { ...t, status: 'done', left: 0 } : t)) } : st))
    }, 250)
    return () => clearInterval(iv)
  }, [set])

  // Repeat the alarm every 2 s while something is done and not dismissed.
  useEffect(() => {
    if (!ringing) return
    ring(s.sound, s.volume)
    navigator.vibrate?.([300, 150, 300])
    const iv = setInterval(() => ring(s.sound, s.volume), 2000)
    return () => clearInterval(iv)
  }, [ringing, s.sound, s.volume])

  // Wake Lock while timers run.
  useEffect(() => {
    const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock
    if (!wl || !s.keepAwake || !anyRunning) return
    let cancelled = false
    const get = () => wl.request('screen').then((l) => { if (cancelled) void l.release(); else { lockRef.current = l; setLockOn(true) } }).catch(() => setLockOn(false))
    void get()
    const vis = () => { if (document.visibilityState === 'visible') void get() }
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', vis)
      void lockRef.current?.release()
      lockRef.current = null
      setLockOn(false)
    }
  }, [s.keepAwake, anyRunning])

  // Tab title shows the next timer.
  const next = s.timers.filter((t) => t.status === 'running').sort((a, b) => a.endAt - b.endAt)[0]
  useEffect(() => {
    const old = document.title
    if (ringing) document.title = '⏰ Time is up!'
    else if (next) document.title = `${clock(remaining(next, now))} · ${next.name}`
    return () => { document.title = old }
  }, [ringing, next, now])

  const upd = (id: string, f: (t: Timer) => Timer) => set((st) => ({ ...st, timers: st.timers.map((t) => (t.id === id ? f(t) : t)) }))
  const start = (t: Timer): Timer => ({ ...t, status: 'running', endAt: Date.now() + (t.left > 0 ? t.left : t.total) * 1000, left: t.left > 0 ? t.left : t.total })
  const pause = (t: Timer): Timer => ({ ...t, status: 'paused', left: remaining(t, Date.now()) })
  const stop = (t: Timer): Timer => ({ ...t, status: 'idle', left: t.total, endAt: 0 })
  const add = (nm: string, sec: number, run: boolean) => {
    ctx ??= new AudioContext() // unlock audio on a user gesture
    set((st) => ({ ...st, timers: [...st.timers, mk(nm || `Timer ${st.timers.length + 1}`, sec, st.timers.length, run)] }))
  }
  const plus = (t: Timer, sec: number): Timer => (t.status === 'running' ? { ...t, endAt: t.endAt + sec * 1000, total: t.total + sec } : t.status === 'done' ? { ...t, status: 'running', endAt: Date.now() + sec * 1000, left: sec, total: sec } : { ...t, left: t.left + sec, total: t.total + sec })

  const runVoice = (text: string) => {
    const c = parseCommand(text)
    if (!c) { setHeard(`“${text}” — not understood`); return }
    const match = s.timers.find((t) => c.name && (t.name.toLowerCase().includes(c.name) || c.name.includes(t.name.toLowerCase())))
    const all = /\ball\b/.test(c.name)
    if (c.action === 'stop') set((st) => ({ ...st, timers: st.timers.map((t) => (all || t.id === match?.id || (!match && t.status === 'done') ? stop(t) : t)) }))
    else if (c.action === 'pause') set((st) => ({ ...st, timers: st.timers.map((t) => ((all || t.id === match?.id) && t.status === 'running' ? pause(t) : t)) }))
    else if (c.action === 'reset' && match) upd(match.id, stop)
    else if (c.action === 'add' && match) upd(match.id, (t) => plus(t, c.seconds))
    else if (c.action === 'start') {
      if (match && !c.seconds) upd(match.id, start)
      else if (match) upd(match.id, (t) => start({ ...t, total: c.seconds, left: c.seconds }))
      else if (c.seconds) add(c.name.replace(/^\w/, (x) => x.toUpperCase()), c.seconds, true)
    }
    setHeard(`“${text}” → ${c.action} ${c.name || ''} ${c.seconds ? clock(c.seconds) : ''}`)
  }

  const listen = () => {
    const C = SRClass()
    if (!C) return
    if (listening) { srRef.current?.stop(); return }
    ctx ??= new AudioContext()
    const r = new C()
    r.lang = 'en-US'
    r.interimResults = false
    r.onresult = (e) => runVoice(e.results[0][0].transcript)
    r.onerror = (e) => setHeard(`Microphone error: ${e.error}`)
    r.onend = () => setListening(false)
    srRef.current = r
    setListening(true)
    r.start()
  }

  const secs = parseDuration(dur) || (/^\d+(\.\d+)?$/.test(dur.trim()) ? Number(dur) * 60 : 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="New timer">
          <Txt label="Name" value={name} onChange={setName} placeholder="e.g. Pasta" />
          <Txt label="Duration" value={dur} onChange={setDur} placeholder="12 min, 1h 20m, 7:30" hint={secs ? `= ${clock(secs)}` : 'Type minutes, “1h 20m” or m:ss'} />
          <Row>
            <Btn kind="primary" disabled={!secs} onClick={() => add(name, secs, true)}>▶ Start now</Btn>
            <Btn disabled={!secs} onClick={() => add(name, secs, false)}>+ Add paused</Btn>
          </Row>
        </Panel>
        <Panel title="Presets">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PRESETS.map(([n, sec]) => (
              <button key={n} className="k-btn" style={{ fontSize: 13 }} onClick={() => add(n, sec, true)}>
                {n} <span className="muted">{clock(sec)}</span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="🎙 Voice control">
          {SRClass() ? (
            <>
              <Btn kind={listening ? 'danger' : 'primary'} onClick={listen}>{listening ? '● Listening… (tap to stop)' : '🎙 Speak a command'}</Btn>
              <p className="muted" style={{ fontSize: 13 }}>Try “start pasta nine minutes”, “add two minutes to rice”, “pause sauce”, “stop all”.</p>
            </>
          ) : (
            <Note tone="warn">Speech recognition isn't available in this browser (try Chrome or Edge). You can type a command below instead.</Note>
          )}
          <VoiceTyped onRun={runVoice} />
          {heard && <Note>{heard}</Note>}
        </Panel>
        <Panel title="Settings">
          <Select label="Alarm sound" value={s.sound} onChange={(sound) => set({ sound })} options={[['chime', 'Chime'], ['beep', 'Triple beep'], ['alarm', 'Kitchen alarm']]} />
          <Num label="Volume (0–1)" value={s.volume} onChange={(volume) => set({ volume: Math.min(1, Math.max(0, volume)) })} min={0} max={1} step={0.1} />
          <Row>
            <Btn onClick={() => ring(s.sound, s.volume)}>🔔 Test sound</Btn>
            <Btn kind="ghost" onClick={reset}>Reset all</Btn>
          </Row>
          <Check label={`Keep screen awake while timers run${lockOn ? ' (active)' : ''}`} value={s.keepAwake} onChange={(keepAwake) => set({ keepAwake })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Timers" value={s.timers.length} />
          <Stat label="Running" value={s.timers.filter((t) => t.status === 'running').length} tone="accent" />
          <Stat label="Next done" value={next ? clock(remaining(next, now)) : '—'} sub={next?.name} />
          <Stat label="Finished" value={s.timers.filter((t) => t.status === 'done').length} tone={ringing ? 'bad' : undefined} />
        </Stats>
        {ringing && (
          <Note tone="err">
            ⏰ <b>{s.timers.filter((t) => t.status === 'done').map((t) => t.name).join(', ')}</b> done!{' '}
            <Btn kind="danger" onClick={() => set((st) => ({ ...st, timers: st.timers.map((t) => (t.status === 'done' ? stop(t) : t)) }))}>Dismiss all</Btn>
          </Note>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
          {s.timers.map((t) => {
            const left = remaining(t, now)
            const c = t.status === 'done' ? 'var(--err)' : color(t.color)
            return (
              <div key={t.id}><Panel className={t.status === 'done' ? 'ct-done' : ''}>
                <style>{'.ct-done{animation:ctflash 1s steps(2) infinite}@keyframes ctflash{50%{background:color-mix(in srgb,var(--err) 18%,var(--panel))}}'}</style>
                <Row wrap={false}>
                  <input value={t.name} onChange={(e) => upd(t.id, (x) => ({ ...x, name: e.target.value }))} aria-label="Timer name" style={{ flex: 1, fontWeight: 700, border: 'none', background: 'transparent', color: 'var(--fg)', fontSize: 16, minWidth: 0 }} />
                  <button className="k-btn ghost" title="Remove" onClick={() => set((st) => ({ ...st, timers: st.timers.filter((x) => x.id !== t.id) }))}>✕</button>
                </Row>
                <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
                  <Ring size={130} value={t.total ? left / t.total : 0} color={c} label={<b style={{ fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{clock(left)}</b>} />
                </div>
                <p className="muted" style={{ textAlign: 'center', margin: '0 0 8px', fontSize: 13 }}>
                  {t.status === 'running' ? `ready at ${new Date(t.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : t.status === 'done' ? 'Time is up!' : t.status === 'paused' ? 'paused' : `set for ${clock(t.total)}`}
                </p>
                <Row>
                  {t.status === 'running' ? <Btn onClick={() => upd(t.id, pause)}>⏸ Pause</Btn> : t.status === 'done' ? <Btn kind="danger" onClick={() => upd(t.id, stop)}>Dismiss</Btn> : <Btn kind="primary" onClick={() => upd(t.id, start)}>▶ {t.status === 'paused' ? 'Resume' : 'Start'}</Btn>}
                  <Btn kind="ghost" onClick={() => upd(t.id, (x) => plus(x, 60))}>+1 min</Btn>
                  {t.status !== 'idle' && <Btn kind="ghost" onClick={() => upd(t.id, stop)}>↺</Btn>}
                </Row>
              </Panel></div>
            )
          })}
        </div>
        {!s.timers.length && <Note>No timers yet — add one or tap a preset.</Note>}
        <Note>Timers keep their end time, so they stay accurate if you switch tabs or reload the page. Keep this tab open to hear the alarm.</Note>
      </div>
    </Split>
  )
}

function VoiceTyped({ onRun }: { onRun: (t: string) => void }) {
  const [v, setV] = useState('start eggs 6 minutes')
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) onRun(v) }} style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      <input className="k-text" value={v} onChange={(e) => setV(e.target.value)} aria-label="Typed command" style={{ flex: 1, minWidth: 0 }} />
      <button className="k-btn" type="submit">Run</button>
    </form>
  )
}
