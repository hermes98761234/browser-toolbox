import { useCallback, useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, CsvButton, Note, Panel, Row, Select, Split, Stat, Stats, useToolState } from '../kit'
import { ccName, decode, noteFreq, noteName, toHex, type MsgType } from './lib/midi-monitor'

interface Entry { id: number; t: number; src: string; data: number[] }
interface Live { notes: Map<number, number>; cc: Map<string, number>; bend: number; program: number | null }

const TYPES: [MsgType, string][] = [['noteon', 'Note On'], ['noteoff', 'Note Off'], ['cc', 'Control Change'], ['pitch', 'Pitch Bend'], ['program', 'Program'], ['chanpress', 'Ch. Aftertouch'], ['polypress', 'Poly Aftertouch'], ['sysex', 'SysEx'], ['transport', 'Transport'], ['clock', 'Clock / Sensing'], ['system', 'Other system']]
const TONE: Partial<Record<MsgType, string>> = { noteon: 'var(--ok)', noteoff: 'var(--muted)', cc: '#0ea5e9', pitch: '#a855f7', program: '#f59e0b', sysex: '#ef4444' }
const KEYS = 'awsedftgyhujkolp;'
const DEF = { show: Object.fromEntries(TYPES.map(([t]) => [t, t !== 'clock'])) as Record<MsgType, boolean>, channel: 0, sound: true, octave: 4, output: '' }

let ac: AudioContext | null = null
const voices = new Map<number, { o: OscillatorNode; g: GainNode }>()
function synth(note: number, vel: number) {
  try {
    ac ??= new AudioContext()
    const old = voices.get(note)
    if (old) { old.g.gain.setTargetAtTime(0, ac.currentTime, 0.05); old.o.stop(ac.currentTime + 0.3); voices.delete(note) }
    if (vel <= 0) return
    const o = ac.createOscillator(), g = ac.createGain()
    o.type = 'triangle'; o.frequency.value = noteFreq(note)
    g.gain.setValueAtTime(0, ac.currentTime); g.gain.linearRampToValueAtTime((vel / 127) * 0.25, ac.currentTime + 0.01)
    o.connect(g).connect(ac.destination); o.start()
    voices.set(note, { o, g })
  } catch { /* no audio */ }
}

export default function MidiMonitor() {
  const [s, set] = useToolState('midi-monitor', DEF)
  const [log, setLog] = useState<Entry[]>([])
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState<'unsupported' | 'pending' | 'denied' | 'ok'>(() => ('requestMIDIAccess' in navigator ? 'pending' : 'unsupported'))
  const [inputs, setInputs] = useState<string[]>([])
  const [outputs, setOutputs] = useState<[string, string][]>([])
  const [demo, setDemo] = useState(false)
  const [live, setLive] = useState<Live>({ notes: new Map(), cc: new Map(), bend: 0, program: null })
  const [count, setCount] = useState(0)
  const access = useRef<MIDIAccess | null>(null)
  const buf = useRef<Entry[]>([])
  const t0 = useRef(0)
  const seq = useRef(0)
  const opt = useRef({ paused, sound: s.sound })
  useEffect(() => { opt.current = { paused, sound: s.sound } }, [paused, s.sound])

  const push = useCallback((src: string, data: number[], playSound: boolean) => {
    if (opt.current.paused) return
    buf.current.push({ id: seq.current++, t: performance.now() - t0.current, src, data })
    const d = decode(data)
    if (playSound && opt.current.sound && d.note !== undefined && (d.type === 'noteon' || d.type === 'noteoff')) synth(d.note, d.type === 'noteon' ? d.velocity ?? 0 : 0)
  }, [])

  useEffect(() => { t0.current = performance.now() }, [])
  // flush buffered messages once per frame (clock streams send 24+ msgs per beat)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!buf.current.length) return
      const b = buf.current
      buf.current = []
      setCount((c) => c + b.length)
      setLog((l) => [...l, ...b].slice(-3000))
      setLive((lv) => {
        const notes = new Map(lv.notes), cc = new Map(lv.cc)
        let { bend, program } = lv
        for (const e of b) {
          const d = decode(e.data)
          if (d.type === 'noteon') notes.set(d.note!, d.velocity!)
          else if (d.type === 'noteoff') notes.delete(d.note!)
          else if (d.type === 'cc') { cc.delete(`${d.channel}:${d.cc}`); cc.set(`${d.channel}:${d.cc}`, d.value!) }
          else if (d.type === 'pitch') bend = d.value!
          else if (d.type === 'program') program = d.value!
        }
        while (cc.size > 8) cc.delete(cc.keys().next().value!)
        return { notes, cc, bend, program }
      })
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])

  const connect = useCallback(async () => {
    if (!('requestMIDIAccess' in navigator)) return
    try {
      const a = await navigator.requestMIDIAccess({ sysex: false })
      access.current = a
      setStatus('ok')
      const refresh = () => {
        const ins: string[] = []
        a.inputs.forEach((i) => {
          ins.push(i.name ?? i.id)
          i.onmidimessage = (ev) => ev.data && push(i.name ?? 'input', Array.from(ev.data), false)
        })
        const outs: [string, string][] = []
        a.outputs.forEach((o) => outs.push([o.id, o.name ?? o.id]))
        setInputs(ins); setOutputs(outs)
        if (ins.length) setDemo(false)
      }
      refresh()
      a.onstatechange = refresh
    } catch {
      setStatus('denied')
    }
  }, [push])
  useEffect(() => {
    void connect() // eslint-disable-line react-hooks/set-state-in-effect
    return () => { access.current?.inputs.forEach((i) => (i.onmidimessage = null)) }
  }, [connect])
  useEffect(() => { if (status !== 'pending' && status !== 'ok') setDemo(true) }, [status]) // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { if (status === 'ok' && inputs.length === 0) setDemo(true) }, [status, inputs.length]) // eslint-disable-line react-hooks/set-state-in-effect

  // synthetic demo stream: arpeggio + mod-wheel sweep + pitch-bend wobble + occasional program change
  useEffect(() => {
    if (!demo) return
    const arp = [60, 64, 67, 71, 72, 71, 67, 64]
    let step = 0
    const id = setInterval(() => {
      const n = arp[step % arp.length] + (Math.floor(step / 16) % 2 ? -3 : 0)
      push('Demo', [0x90, n, 70 + ((step * 13) % 50)], true)
      setTimeout(() => push('Demo', [0x80, n, 64], true), 180)
      push('Demo', [0xb0, 1, Math.round(63.5 + 63.5 * Math.sin(step / 5))], false)
      if (step % 4 === 0) { const v = Math.round(8192 + 3000 * Math.sin(step / 3)); push('Demo', [0xe0, v & 127, v >> 7], false) }
      if (step % 32 === 0) push('Demo', [0xc0, (step / 32) % 8], false)
      if (step % 8 === 0) push('Demo', [0xb0, 64, step % 16 === 0 ? 127 : 0], false)
      for (let k = 0; k < 6; k++) push('Demo', [0xf8], false)
      step++
    }, 250)
    return () => clearInterval(id)
  }, [demo, push])

  const send = (data: number[]) => {
    push('Keyboard', data, true)
    const out = s.output && access.current?.outputs.get(s.output)
    if (out) out.send(data)
  }
  const down = useRef(new Set<number>())
  const noteOn = (n: number) => { if (!down.current.has(n)) { down.current.add(n); send([0x90 + Math.max(0, s.channel - 1), n, 100]) } }
  const noteOff = (n: number) => { if (down.current.delete(n)) send([0x80 + Math.max(0, s.channel - 1), n, 64]) }
  useEffect(() => {
    const base = (s.octave + 1) * 12
    const kd = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement).closest('input,textarea,select')) return
      const i = KEYS.indexOf(e.key.toLowerCase())
      if (i >= 0) noteOn(base + i)
    }
    const ku = (e: KeyboardEvent) => { const i = KEYS.indexOf(e.key.toLowerCase()); if (i >= 0) noteOff(base + i) }
    addEventListener('keydown', kd); addEventListener('keyup', ku)
    return () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku) }
  })

  const shown = log.filter((e) => { const d = decode(e.data); return s.show[d.type] && (s.channel === 0 || d.channel === null || d.channel === s.channel) })
  const rows = shown.slice(-250).reverse()
  const ccs = [...live.cc.entries()].reverse()
  const kbStart = (s.octave + 1) * 12 - 12
  const white = [0, 2, 4, 5, 7, 9, 11]
  const keys = Array.from({ length: 36 }, (_, i) => kbStart + i)

  return (
    <div>
      <Stats>
        <Stat label="Web MIDI" value={status === 'ok' ? 'Connected' : status === 'pending' ? 'Asking…' : status === 'denied' ? 'Blocked' : 'Not supported'} tone={status === 'ok' ? 'good' : 'bad'} sub={status === 'ok' ? `${inputs.length} input(s), ${outputs.length} output(s)` : 'demo stream available'} />
        <Stat label="Messages" value={count.toLocaleString('en-US')} sub={`${shown.length} shown after filters`} />
        <Stat label="Notes held" value={live.notes.size ? [...live.notes.keys()].sort((a, b) => a - b).map(noteName).join(' ') : '—'} />
        <Stat label="Pitch bend" value={live.bend > 0 ? `+${live.bend}` : live.bend} sub={live.program !== null ? `program ${live.program + 1}` : 'centre = 0'} />
      </Stats>
      {status === 'unsupported' && <Note tone="warn">This browser has no Web MIDI API (Safari and Firefox without the add-on). Use Chrome or Edge to read real devices; the demo stream and on-screen keyboard still work.</Note>}
      {status === 'denied' && <Note tone="warn">MIDI access was blocked. Allow it in the site permissions and press Retry.</Note>}
      {status === 'ok' && inputs.length === 0 && <Note>No MIDI inputs found. Plug in a controller (it appears automatically) — meanwhile the demo stream is running.</Note>}
      <Split wide="right">
        <div>
          <Panel title="Sources">
            {inputs.map((n) => <div key={n}>🎹 <b>{n}</b></div>)}
            <Row>
              <Btn kind={demo ? 'primary' : 'normal'} onClick={() => setDemo(!demo)}>{demo ? '■ Stop demo' : '▶ Demo stream'}</Btn>
              {status !== 'ok' && status !== 'unsupported' && <Btn onClick={() => void connect()}>Retry access</Btn>}
            </Row>
            {outputs.length > 0 && <Select label="Echo keyboard to output" value={s.output} onChange={(output) => set({ output })} options={[['', '— none —'], ...outputs]} />}
            <Check label="Play notes with built-in synth" value={s.sound} onChange={(sound) => set({ sound })} />
          </Panel>
          <Panel title="Filters">
            <Select label="Channel" value={s.channel} onChange={(channel) => set({ channel })} options={[[0, 'All channels'], ...Array.from({ length: 16 }, (_, i) => [i + 1, `Channel ${i + 1}`] as [number, string])]} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              {TYPES.map(([t, n]) => <Check key={t} label={n} value={s.show[t]} onChange={(v) => set({ show: { ...s.show, [t]: v } })} />)}
            </div>
          </Panel>
          <Panel title="Controllers (last touched)">
            {ccs.length === 0 ? <p className="muted">Move a knob or fader…</p> : ccs.map(([k, v]) => {
              const [ch, cc] = k.split(':').map(Number)
              return <div key={k} style={{ marginBottom: 6 }}><Row wrap={false}><span style={{ flex: 1, fontSize: 13 }}>{ccName(cc)} <span className="muted">ch {ch} · CC {cc}</span></span><b>{v}</b></Row><Bar value={v} max={127} /></div>
            })}
            <div style={{ marginTop: 8, fontSize: 13 }}>Pitch bend</div>
            <div style={{ position: 'relative', height: 10, background: 'var(--line)', borderRadius: 5 }}>
              <span style={{ position: 'absolute', left: '50%', width: 2, top: -2, bottom: -2, background: 'var(--muted)' }} />
              <span style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 5, background: '#a855f7', left: `${50 + Math.min(0, live.bend / 163.84)}%`, width: `${Math.abs(live.bend / 163.84)}%` }} />
            </div>
          </Panel>
        </div>
        <div>
          <Panel title="Message log" actions={<>
            <Btn onClick={() => setPaused(!paused)}>{paused ? '▶ Resume' : '⏸ Pause'}</Btn>
            <Btn kind="ghost" onClick={() => { setLog([]); setCount(0); setLive({ notes: new Map(), cc: new Map(), bend: 0, program: null }) }}>Clear</Btn>
            <CsvButton name="midi-log.csv" rows={() => [['time_ms', 'source', 'hex', 'channel', 'message'], ...shown.map((e) => { const d = decode(e.data); return [e.t.toFixed(1), e.src, toHex(e.data), d.channel ?? '', d.summary] })]} />
          </>}>
            <div className="k-table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
              <table className="k-table" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead><tr><th>Time</th><th>Source</th><th>Ch</th><th>Bytes</th><th>Message</th></tr></thead>
                <tbody>
                  {rows.map((e) => {
                    const d = decode(e.data)
                    return (
                      <tr key={e.id}>
                        <td className="muted">{(e.t / 1000).toFixed(3)}</td>
                        <td>{e.src}</td>
                        <td>{d.channel ?? '—'}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{toHex(e.data.slice(0, 8))}{e.data.length > 8 ? ' …' : ''}</td>
                        <td><span style={{ color: TONE[d.type], fontWeight: 600 }}>{d.summary}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {rows.length === 0 && <p className="muted" style={{ padding: 8 }}>Waiting for messages…</p>}
            </div>
          </Panel>
          <Panel title="On-screen keyboard" actions={<><Btn onClick={() => set({ octave: Math.max(0, s.octave - 1) })}>◀ Oct</Btn><b>C{s.octave - 1}–B{s.octave + 1}</b><Btn onClick={() => set({ octave: Math.min(8, s.octave + 1) })}>Oct ▶</Btn></>}>
            <div style={{ position: 'relative', height: 120, userSelect: 'none', touchAction: 'none', display: 'flex' }}>
              {keys.filter((n) => white.includes(n % 12)).map((n) => (
                <div key={n} onPointerDown={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); noteOn(n) }} onPointerUp={() => noteOff(n)} onPointerLeave={() => noteOff(n)}
                  style={{ flex: 1, border: '1px solid var(--line)', borderRadius: '0 0 6px 6px', background: live.notes.has(n) ? 'var(--accent)' : '#f8fafc', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontSize: 10, color: '#64748b', paddingBottom: 4, cursor: 'pointer' }}>
                  {n % 12 === 0 ? noteName(n) : ''}
                </div>
              ))}
              {keys.filter((n) => !white.includes(n % 12)).map((n) => {
                const wi = keys.filter((k) => white.includes(k % 12) && k < n).length
                return <div key={n} onPointerDown={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); noteOn(n) }} onPointerUp={() => noteOff(n)} onPointerLeave={() => noteOff(n)}
                  style={{ position: 'absolute', top: 0, height: '62%', width: `${(100 / 21) * 0.6}%`, left: `${(wi / 21) * 100 - (100 / 21) * 0.3}%`, background: live.notes.has(n) ? 'var(--accent)' : '#1e293b', borderRadius: '0 0 4px 4px', cursor: 'pointer', zIndex: 1 }} />
              })}
            </div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Click or use the computer keys <span className="mono">A W S E D F T G Y H U J K O L P ;</span> (from C{s.octave}). Notes go to the log{outputs.length ? ' and to the chosen MIDI output' : ''}.</p>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
