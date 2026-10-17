import { useEffect, useRef, useState } from 'react'
import { Btn, Check, Note, Num, Panel, Ring, Row, Select, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { clock, formatShutter, ndTime, parseShutter, reciprocity, settingsStops, STANDARD_SHUTTERS, stopsFromFactor, stopsNeeded } from './lib/nd-filter-timer'

const FILTERS: [string, number][] = [
  ['ND2 (0.3)', 1], ['ND4 (0.6)', 2], ['ND8 (0.9)', 3], ['ND16 (1.2)', 4], ['ND32 (1.5)', 5], ['ND64 (1.8)', 6],
  ['ND400 (2.7)', stopsFromFactor(400)], ['ND1000 (3.0)', stopsFromFactor(1000)], ['ND32000 (4.5)', 15], ['ND1M (6.0)', stopsFromFactor(1e6)],
]
const FILMS: [string, number][] = [
  ['Digital (no correction)', 1], ['Ilford Pan F+ (p 1.33)', 1.33], ['Ilford FP4+ (p 1.26)', 1.26], ['Ilford HP5+ (p 1.31)', 1.31],
  ['Ilford Delta 100 (p 1.26)', 1.26], ['Ilford Delta 400 (p 1.41)', 1.41], ['Ilford Delta 3200 (p 1.33)', 1.33], ['Ilford SFX 200 (p 1.43)', 1.43], ['Ilford XP2 Super (p 1.31)', 1.31],
]
const DEF = { base: '1/125', stack: [stopsFromFactor(1000)] as number[], extra: 0, isoM: 100, isoS: 100, fM: 8, fS: 8, film: 1, target: 30, beeps: true, warnAt: 10 }

let audio: AudioContext | null = null
function beep(freq = 880, dur = 0.12, vol = 0.25) {
  try {
    audio ??= new AudioContext()
    const o = audio.createOscillator(), g = audio.createGain()
    o.frequency.value = freq
    o.type = 'sine'
    g.gain.setValueAtTime(vol, audio.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur)
    o.connect(g).connect(audio.destination)
    o.start()
    o.stop(audio.currentTime + dur + 0.02)
  } catch { /* audio unavailable */ }
}

export default function NdFilterTimer() {
  const [s, set, reset] = useToolState('nd-filter-timer', DEF)
  const base = parseShutter(s.base)
  const ndStops = s.stack.reduce((a, b) => a + b, 0) + s.extra
  const setStops = settingsStops(s.isoM, s.isoS, s.fM, s.fS)
  const stops = ndStops + (Number.isFinite(setStops) ? setStops : 0)
  const metered = ndTime(base, stops)
  const final = reciprocity(metered, s.film)
  const valid = Number.isFinite(base) && base > 0 && Number.isFinite(final)

  // countdown timer
  const init = valid ? Math.round(final * 10) / 10 : 0
  const [dur, setDur] = useState(init)
  const [left, setLeft] = useState(init)
  const [running, setRunning] = useState(false)
  const endAt = useRef(0)
  const lastSec = useRef(-1)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const l = (endAt.current - performance.now()) / 1000
      if (l <= 0) {
        setLeft(0); setRunning(false)
        if (s.beeps) { beep(660, 0.6, 0.35); setTimeout(() => beep(990, 0.6, 0.35), 250) }
        return
      }
      setLeft(l)
      const sec = Math.ceil(l)
      if (sec !== lastSec.current) {
        lastSec.current = sec
        if (s.beeps && sec <= s.warnAt) beep(sec <= 3 ? 1200 : 880, 0.08, 0.2)
      }
    }, 50)
    return () => clearInterval(id)
  }, [running, s.beeps, s.warnAt])
  const load = (t: number) => { setRunning(false); setDur(t); setLeft(t) }
  const start = () => {
    const t = left > 0 ? left : dur
    if (!(t > 0)) return
    if (s.beeps) beep(520, 0.15)
    endAt.current = performance.now() + t * 1000
    lastSec.current = Math.ceil(t)
    setLeft(t); setRunning(true)
  }

  const need = stopsNeeded(base, s.target)
  const tbl = FILTERS.map(([n, st]) => [n, `${st.toFixed(1)} stops`, formatShutter(reciprocity(ndTime(base, st + setStops), s.film))])

  return (
    <Split>
      <div>
        <Panel title="Metered exposure (no filter)" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="Base shutter speed" value={s.base} onChange={(b) => set({ base: b })} hint="e.g. 1/125, 0.5, 2s" />
          {!Number.isFinite(base) && <Note tone="err">Enter a shutter speed like 1/250 or 2s.</Note>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {STANDARD_SHUTTERS.map((t) => <Btn key={t} kind={Math.abs(t - base) < 1e-9 ? 'primary' : 'ghost'} onClick={() => set({ base: t < 1 ? `1/${Math.round(1 / t)}` : `${t}s` })}>{formatShutter(t)}</Btn>)}
          </div>
        </Panel>
        <Panel title="Filter stack">
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Tap to add filters; stacked stops add up.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {FILTERS.map(([n, st]) => <Btn key={n} onClick={() => set({ stack: [...s.stack, st] })}>+ {n}</Btn>)}
          </div>
          {s.stack.length === 0 ? <p className="muted">No filters.</p> : s.stack.map((st, i) => (
            <Row key={i} wrap={false}>
              <span style={{ flex: 1 }}>{FILTERS.find((f) => Math.abs(f[1] - st) < 1e-9)?.[0] ?? `${st} stops`}</span>
              <b>{st.toFixed(2)} st</b>
              <Btn kind="ghost" onClick={() => set({ stack: s.stack.filter((_, j) => j !== i) })}>✕</Btn>
            </Row>
          ))}
          <div style={{ height: 10 }} />
          <Slider label="Extra stops (polariser ≈ 1.5, variable ND…)" value={s.extra} min={0} max={6} step={1 / 3} onChange={(extra) => set({ extra })} show={(v) => v.toFixed(2)} />
        </Panel>
        <Panel title="Settings changed after metering?">
          <Row>
            <Num label="Metered ISO" value={s.isoM} min={1} onChange={(isoM) => set({ isoM })} />
            <Num label="Shooting ISO" value={s.isoS} min={1} onChange={(isoS) => set({ isoS })} />
          </Row>
          <Row>
            <Num label="Metered f/" value={s.fM} min={0.7} onChange={(fM) => set({ fM })} />
            <Num label="Shooting f/" value={s.fS} min={0.7} onChange={(fS) => set({ fS })} />
          </Row>
          <Select label="Film reciprocity" value={s.film} onChange={(film) => set({ film })} options={FILMS.map(([n, p]) => [p, n] as [number, string])} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Total stops" value={stops.toFixed(2)} sub={`ND ${ndStops.toFixed(2)} + settings ${setStops.toFixed(2)}`} />
          <Stat label="Filter factor" value={`×${Math.round(2 ** stops).toLocaleString('en-US')}`} sub={`density ${(stops * Math.log10(2)).toFixed(2)}`} />
          <Stat label="Exposure time" value={valid ? formatShutter(final) : '—'} tone="accent" sub={s.film > 1 && metered > 1 ? `metered ${formatShutter(metered)} + reciprocity` : `${valid ? final.toFixed(final < 1 ? 4 : 1) : '—'} s`} />
        </Stats>
        {valid && final > 30 && <Note>Longer than 30″ — set the camera to <b>Bulb</b> and use the timer below with a remote release.</Note>}
        {valid && final < 1 / 8000 && <Note tone="warn">Faster than 1/8000 — add more ND or stop down.</Note>}
        <Panel title="Exposure timer">
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <Ring value={dur ? left / dur : 0} size={150} label={<b style={{ fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{clock(left)}</b>} color={running && left <= s.warnAt ? 'var(--warn)' : 'var(--accent)'} />
            <div style={{ display: 'grid', gap: 6 }}>
              <Btn kind="primary" disabled={!valid} onClick={() => load(Math.round(final * 10) / 10)}>Load {valid ? formatShutter(final) : ''}</Btn>
              <Row>
                {running ? <Btn onClick={() => { setRunning(false); setLeft((endAt.current - performance.now()) / 1000) }}>⏸ Pause</Btn> : <Btn kind="primary" disabled={!(dur > 0)} onClick={start}>▶ Start</Btn>}
                <Btn kind="ghost" onClick={() => load(dur)}>↺ Reset</Btn>
              </Row>
              <Check label="Beeps (last seconds + end)" value={s.beeps} onChange={(beeps) => set({ beeps })} />
            </div>
          </div>
          <Slider label="Countdown beeps from" value={s.warnAt} min={0} max={30} step={1} unit=" s" onChange={(warnAt) => set({ warnAt })} />
        </Panel>
        <Panel title="Same scene, every filter">
          <Table head={['Filter', 'Stops', 'Exposure']} rows={tbl} />
        </Panel>
        <Panel title="Which filter for a target time?">
          <Num label="Desired exposure" value={s.target} unit="s" min={0.001} onChange={(target) => set({ target })} />
          {Number.isFinite(need) && <p>You need <b>{need.toFixed(1)} stops</b> (≈ ND{Math.round(2 ** need).toLocaleString('en-US')}). {need > 0 ? <>Closest single filter: <b>{FILTERS.reduce((a, b) => (Math.abs(b[1] - need) < Math.abs(a[1] - need) ? b : a))[0]}</b>.</> : 'No filter needed.'}</p>}
          <Note>Rules of thumb: 1/4–1″ for waterfalls with texture, 2–30″ for silky water and streaky clouds, 2+ minutes to remove moving people.</Note>
        </Panel>
      </div>
    </Split>
  )
}
