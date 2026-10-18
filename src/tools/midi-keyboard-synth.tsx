import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react'
import { Btn, download, JsonButtons, Note, Panel, Row, Select, Slider, Split, Stat, Stats, Txt, num, useToolState } from '../kit'
import { encodeWav } from './lib/audio-converter'
import { adsrPoints, impulse, isBlack, KEYMAP, keyLabel, midiToFreq, noteName, parseMidi, PRESETS, unisonDetunes, type Patch, type Wave } from './lib/midi-keyboard-synth'

interface Voice { note: number; oscs: { o: OscillatorNode; det: number }[]; vca: GainNode; filt: BiquadFilterNode; cutoff: number; started: number }

/** Polyphonic subtractive synth on the Web Audio API. */
class Synth {
  ctx = new AudioContext()
  voices = new Map<number, Voice>()
  held = new Set<number>()
  sustain = false
  bend = 0
  mod = 0
  patch: Patch
  private bus = this.ctx.createGain()
  private lfo = this.ctx.createOscillator()
  private lfoPitch = this.ctx.createGain()
  private lfoFilt = this.ctx.createGain()
  private lfoAmp = this.ctx.createGain()
  private delay = this.ctx.createDelay(2)
  private fb = this.ctx.createGain()
  private delayWet = this.ctx.createGain()
  private conv = this.ctx.createConvolver()
  private revWet = this.ctx.createGain()
  private master = this.ctx.createGain()
  analyser = this.ctx.createAnalyser()
  private revSize = -1
  rec: Float32Array[][] | null = null
  onChange: () => void = () => {}

  constructor(p: Patch) {
    this.patch = p
    const c = this.ctx
    this.lfo.connect(this.lfoPitch)
    this.lfo.connect(this.lfoFilt)
    this.lfo.connect(this.lfoAmp)
    this.lfoAmp.connect(this.bus.gain)
    this.lfo.start()
    this.bus.connect(this.master)
    this.bus.connect(this.delay)
    this.delay.connect(this.fb).connect(this.delay)
    this.delay.connect(this.delayWet).connect(this.master)
    this.bus.connect(this.conv)
    this.conv.connect(this.revWet).connect(this.master)
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -10
    this.master.connect(comp).connect(this.analyser).connect(c.destination)
    // recorder tap (ScriptProcessor keeps this file self-contained; it only copies samples)
    const tap = c.createScriptProcessor(4096, 2, 2)
    tap.onaudioprocess = (e) => {
      if (this.rec) this.rec.push([0, 1].map((k) => e.inputBuffer.getChannelData(Math.min(k, e.inputBuffer.numberOfChannels - 1)).slice()))
    }
    const mute = c.createGain()
    mute.gain.value = 0
    this.analyser.connect(tap).connect(mute).connect(c.destination)
    this.setPatch(p)
  }

  setPatch(p: Patch) {
    this.patch = p
    const t = this.ctx.currentTime
    const depth = Math.min(1, p.lfoDepth + this.mod)
    this.lfo.frequency.setTargetAtTime(p.lfoRate, t, 0.02)
    this.lfoPitch.gain.setTargetAtTime(p.lfoTarget === 'pitch' ? depth * 60 : 0, t, 0.02)
    this.lfoFilt.gain.setTargetAtTime(p.lfoTarget === 'filter' ? depth * 2400 : 0, t, 0.02)
    this.lfoAmp.gain.setTargetAtTime(p.lfoTarget === 'amp' ? depth * 0.5 : 0, t, 0.02)
    this.bus.gain.setTargetAtTime(p.lfoTarget === 'amp' ? 1 - depth * 0.5 : 1, t, 0.02)
    this.delay.delayTime.setTargetAtTime(p.delayTime, t, 0.05)
    this.fb.gain.setTargetAtTime(p.delayFb, t, 0.02)
    this.delayWet.gain.setTargetAtTime(p.delayMix, t, 0.02)
    this.revWet.gain.setTargetAtTime(p.revMix, t, 0.02)
    this.master.gain.setTargetAtTime(p.volume, t, 0.02)
    if (p.revSize !== this.revSize) {
      this.revSize = p.revSize
      const ir = impulse(p.revSize, this.ctx.sampleRate)
      const b = this.ctx.createBuffer(2, ir[0].length, this.ctx.sampleRate)
      ir.forEach((ch, k) => b.copyToChannel(ch as Float32Array<ArrayBuffer>, k))
      this.conv.buffer = b
    }
    for (const v of this.voices.values()) {
      v.filt.type = p.ftype
      v.filt.Q.setTargetAtTime(p.q, t, 0.02)
    }
  }

  noteOn(note: number, vel = 0.8) {
    const c = this.ctx, p = this.patch, t = c.currentTime
    if (c.state !== 'running') void c.resume()
    this.held.delete(note)
    const old = this.voices.get(note)
    if (old) this.release(old, 0.02)
    if (this.voices.size >= 16) {
      const oldest = [...this.voices.values()].sort((a, b) => a.started - b.started)[0]
      this.release(oldest, 0.02)
    }
    const vca = c.createGain()
    vca.gain.value = 0
    const filt = c.createBiquadFilter()
    filt.type = p.ftype
    filt.Q.value = p.q
    this.lfoFilt.connect(filt.detune)
    filt.connect(vca).connect(this.bus)
    const dets = unisonDetunes(p.unison, p.spread)
    const oscs: Voice['oscs'] = []
    const f = midiToFreq(note)
    for (const [wave, semi, fine, level] of [[p.waveA, 0, 0, 1 - p.mixB], [p.waveB, p.semiB, p.fineB, p.mixB]] as [Wave, number, number, number][]) {
      if (level <= 0.001) continue
      const g = c.createGain()
      g.gain.value = (level * 0.6) / Math.sqrt(dets.length)
      g.connect(filt)
      for (const d of dets) {
        const o = c.createOscillator()
        o.type = wave
        o.frequency.value = f * 2 ** (semi / 12)
        o.detune.value = d + fine + this.bend * 200
        this.lfoPitch.connect(o.detune)
        o.connect(g)
        o.start(t)
        oscs.push({ o, det: d + fine })
      }
    }
    const peak = 0.3 * (1 - p.velSens + p.velSens * vel)
    vca.gain.setValueAtTime(0, t)
    vca.gain.linearRampToValueAtTime(peak, t + Math.max(0.001, p.a))
    vca.gain.setTargetAtTime(peak * p.s, t + Math.max(0.001, p.a), Math.max(0.005, p.d / 3))
    const c0 = Math.min(20000, Math.max(20, p.cutoff))
    filt.frequency.setValueAtTime(c0, t)
    filt.frequency.exponentialRampToValueAtTime(Math.min(20000, Math.max(20, c0 * 2 ** p.famt)), t + Math.max(0.001, p.fa))
    filt.frequency.setTargetAtTime(Math.min(20000, Math.max(20, c0 * 2 ** (p.famt * p.fs))), t + Math.max(0.001, p.fa), Math.max(0.005, p.fd / 3))
    this.voices.set(note, { note, oscs, vca, filt, cutoff: c0, started: t })
    this.onChange()
  }

  noteOff(note: number) {
    const v = this.voices.get(note)
    if (!v) return
    if (this.sustain) {
      this.held.add(note)
      return
    }
    this.release(v, this.patch.r)
  }

  private release(v: Voice, r: number) {
    const t = this.ctx.currentTime
    for (const prm of [v.vca.gain, v.filt.frequency]) {
      if (prm.cancelAndHoldAtTime) prm.cancelAndHoldAtTime(t)
      else {
        prm.cancelScheduledValues(t)
        prm.setValueAtTime(prm.value, t)
      }
    }
    v.vca.gain.setTargetAtTime(0, t, Math.max(0.005, r / 3))
    v.filt.frequency.setTargetAtTime(v.cutoff, t, Math.max(0.005, this.patch.fr / 3))
    const end = t + Math.max(0.03, r * 4) + 0.05
    v.oscs.forEach(({ o }) => o.stop(end))
    v.oscs[0]?.o.addEventListener('ended', () => v.vca.disconnect())
    if (this.voices.get(v.note) === v) this.voices.delete(v.note)
    this.onChange()
  }

  setSustain(on: boolean) {
    this.sustain = on
    if (!on) for (const n of [...this.held]) {
      this.held.delete(n)
      this.noteOff(n)
    }
  }

  setBend(b: number) {
    this.bend = b
    const t = this.ctx.currentTime
    for (const v of this.voices.values()) for (const { o, det } of v.oscs) o.detune.setTargetAtTime(det + b * 200, t, 0.01)
  }

  panic() {
    for (const v of [...this.voices.values()]) this.release(v, 0.02)
    this.held.clear()
  }
}

interface State { patch: Patch; preset: string; octave: number; user: Record<string, Patch>; channel: number }
const DEF: State = { patch: PRESETS['Supersaw lead'], preset: 'Supersaw lead', octave: 4, user: {}, channel: -1 }

function Env({ a, d, s, r, color }: { a: number; d: number; s: number; r: number; color: string }) {
  const pts = adsrPoints(a, d, s, r)
  const T = pts[pts.length - 1][0] || 1
  return (
    <svg viewBox="0 0 200 60" preserveAspectRatio="none" style={{ width: '100%', height: 60, background: 'var(--panel2)', borderRadius: 8 }}>
      <path d={pts.map(([x, y], i) => `${i ? 'L' : 'M'}${((x / T) * 196 + 2).toFixed(1)},${(56 - y * 52).toFixed(1)}`).join('')} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default function MidiKeyboardSynth() {
  const [s, set] = useToolState('midi-keyboard-synth', DEF)
  const p = s.patch
  const synth = useRef<Synth | null>(null)
  const [active, setActive] = useState<number[]>([])
  const [midi, setMidi] = useState<{ status: 'unsupported' | 'idle' | 'denied' | 'ready'; inputs: string[] }>(() => ({ status: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator ? 'idle' : 'unsupported', inputs: [] }))
  const [log, setLog] = useState<string[]>([])
  const [rec, setRec] = useState<{ on: boolean; url?: string; secs?: number }>({ on: false })
  const [presetName, setPresetName] = useState('My patch')
  const scope = useRef<HTMLCanvasElement>(null)
  const pointerNote = useRef(new Map<number, number>())
  const chRef = useRef(s.channel)
  chRef.current = s.channel
  const base = s.octave * 12 + 12

  const get = () => {
    if (!synth.current) {
      synth.current = new Synth(p)
      synth.current.onChange = () => setActive([...synth.current!.voices.keys()])
    }
    return synth.current
  }
  useEffect(() => {
    synth.current?.setPatch(p)
  }, [p])
  useEffect(() => () => {
    synth.current?.panic()
    void synth.current?.ctx.close()
  }, [])

  // computer keyboard
  useEffect(() => {
    const down = new Set<string>()
    const kd = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Minus') return set((x) => ({ ...x, octave: Math.max(1, x.octave - 1) }))
      if (e.code === 'Equal') return set((x) => ({ ...x, octave: Math.min(7, x.octave + 1) }))
      if (e.code === 'Space') {
        e.preventDefault()
        get().setSustain(true)
        return
      }
      const off = KEYMAP[e.code]
      if (off === undefined) return
      e.preventDefault()
      down.add(e.code)
      get().noteOn(base + off, 0.8)
    }
    const ku = (e: KeyboardEvent) => {
      if (e.code === 'Space') return synth.current?.setSustain(false)
      const off = KEYMAP[e.code]
      if (off === undefined || !down.has(e.code)) return
      down.delete(e.code)
      synth.current?.noteOff(base + off)
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base])

  // oscilloscope
  useEffect(() => {
    let raf = 0
    const buf = new Uint8Array(1024)
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const c = scope.current
      if (!c) return
      const g = c.getContext('2d')!
      const w = (c.width = c.clientWidth), h = (c.height = 90)
      g.clearRect(0, 0, w, h)
      g.strokeStyle = '#38bdf8'
      g.lineWidth = 2
      g.beginPath()
      if (synth.current) synth.current.analyser.getByteTimeDomainData(buf)
      else buf.fill(128)
      for (let i = 0; i < buf.length; i++) {
        const x = (i / (buf.length - 1)) * w, y = (buf[i] / 255) * h
        if (i) g.lineTo(x, y)
        else g.moveTo(x, y)
      }
      g.stroke()
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  const connectMidi = async () => {
    const sy = get()
    try {
      const acc = await navigator.requestMIDIAccess()
      const bind = () => {
        const names: string[] = []
        acc.inputs.forEach((inp) => {
          names.push(inp.name ?? 'MIDI input')
          inp.onmidimessage = (ev) => {
            const m = parseMidi(ev.data ?? [])
            if (m.type === 'other' || (chRef.current >= 0 && m.ch !== chRef.current)) return
            if (m.type === 'on') sy.noteOn(m.note, m.vel)
            else if (m.type === 'off') sy.noteOff(m.note)
            else if (m.type === 'bend') sy.setBend(m.value)
            else if (m.type === 'cc' && m.cc === 64) sy.setSustain(m.value >= 0.5)
            else if (m.type === 'cc' && m.cc === 1) {
              sy.mod = m.value
              sy.setPatch(sy.patch)
            } else if (m.type === 'cc' && (m.cc === 120 || m.cc === 123)) sy.panic()
            const txt = m.type === 'on' ? `on ${noteName(m.note)} v${Math.round(m.vel * 127)}` : m.type === 'off' ? `off ${noteName(m.note)}` : m.type === 'bend' ? `bend ${m.value.toFixed(2)}` : `cc${m.cc} = ${Math.round(m.value * 127)}`
            setLog((l) => [`ch${m.ch + 1} ${txt}`, ...l].slice(0, 6))
          }
        })
        setMidi({ status: 'ready', inputs: names })
      }
      bind()
      acc.onstatechange = bind
    } catch {
      setMidi({ status: 'denied', inputs: [] })
    }
  }

  const toggleRec = () => {
    const sy = get()
    if (!rec.on) {
      if (rec.url) URL.revokeObjectURL(rec.url)
      sy.rec = []
      setRec({ on: true })
      return
    }
    const chunks = sy.rec ?? []
    sy.rec = null
    const len = chunks.reduce((a, c) => a + c[0].length, 0)
    const ch = [new Float32Array(len), new Float32Array(len)]
    let o = 0
    for (const c of chunks) {
      ch[0].set(c[0], o)
      ch[1].set(c[1], o)
      o += c[0].length
    }
    const wav = encodeWav(ch, sy.ctx.sampleRate, 16)
    const url = URL.createObjectURL(new Blob([wav as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }))
    setRec({ on: false, url, secs: len / sy.ctx.sampleRate })
  }

  // on-screen keyboard (29 keys = the computer-keyboard range)
  const keys = Array.from({ length: 29 }, (_, i) => base + i)
  const whites = keys.filter((n) => !isBlack(n))
  const noteAt = (e: RPE<HTMLDivElement>): [number, number] | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const n = el?.dataset.note
    if (!n) return null
    const r = el!.getBoundingClientRect()
    return [Number(n), Math.min(1, 0.35 + (0.65 * (e.clientY - r.top)) / r.height)]
  }
  const pDown = (e: RPE<HTMLDivElement>) => {
    const hit = noteAt(e)
    if (!hit) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointerNote.current.set(e.pointerId, hit[0])
    get().noteOn(hit[0], hit[1])
  }
  const pMove = (e: RPE<HTMLDivElement>) => {
    const cur = pointerNote.current.get(e.pointerId)
    if (cur === undefined) return
    const hit = noteAt(e)
    if (!hit || hit[0] === cur) return
    synth.current?.noteOff(cur)
    pointerNote.current.set(e.pointerId, hit[0])
    synth.current?.noteOn(hit[0], hit[1])
  }
  const pUp = (e: RPE<HTMLDivElement>) => {
    const cur = pointerNote.current.get(e.pointerId)
    if (cur !== undefined) synth.current?.noteOff(cur)
    pointerNote.current.delete(e.pointerId)
  }

  const P = (patch: Partial<Patch>) => set({ patch: { ...p, ...patch }, preset: '' })
  const all = { ...PRESETS, ...s.user }
  const waves: [Wave, string][] = [['sawtooth', 'Saw'], ['square', 'Square'], ['triangle', 'Triangle'], ['sine', 'Sine']]
  const sec = (v: number) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`)

  return (
    <div>
      <Stats>
        <Stat label="Patch" value={s.preset || 'Custom'} />
        <Stat label="Voices playing" value={`${active.length} / 16`} sub={`${p.unison * (p.mixB > 0 && p.mixB < 1 ? 2 : 1)} oscillators per voice`} />
        <Stat label="Octave" value={`C${s.octave}`} sub="− / = keys shift" />
        <Stat label="MIDI" value={midi.status === 'ready' ? `${midi.inputs.length} input${midi.inputs.length === 1 ? '' : 's'}` : midi.status === 'unsupported' ? 'Not supported' : midi.status === 'denied' ? 'Blocked' : 'Not connected'} tone={midi.status === 'ready' ? 'good' : undefined} />
      </Stats>
      <Panel title="Keyboard" actions={<>
        <Btn onClick={() => set({ octave: Math.max(1, s.octave - 1) })}>◀ Oct</Btn>
        <Btn onClick={() => set({ octave: Math.min(7, s.octave + 1) })}>Oct ▶</Btn>
        <Btn kind={rec.on ? 'danger' : 'normal'} onClick={toggleRec}>{rec.on ? '■ Stop recording' : '● Record WAV'}</Btn>
        <Btn kind="ghost" onClick={() => synth.current?.panic()}>Panic</Btn>
      </>}>
        <div onPointerDown={pDown} onPointerMove={pMove} onPointerUp={pUp} onPointerCancel={pUp} style={{ position: 'relative', height: 170, display: 'flex', touchAction: 'none', userSelect: 'none', overflowX: 'auto' }}>
          {whites.map((n) => (
            <div key={n} data-note={n} style={{ flex: '1 0 34px', border: '1px solid #94a3b8', borderRadius: '0 0 8px 8px', background: active.includes(n) ? 'var(--accent)' : '#f8fafc', color: active.includes(n) ? '#fff' : '#475569', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', fontSize: 11, paddingBottom: 6, cursor: 'pointer' }}>
              <b style={{ pointerEvents: 'none' }}>{keyLabel(n - base)}</b>
              <span style={{ pointerEvents: 'none', opacity: 0.7 }}>{n % 12 === 0 ? noteName(n) : ''}</span>
            </div>
          ))}
          {keys.filter(isBlack).map((n) => {
            const wi = whites.filter((w) => w < n).length
            return (
              <div key={n} data-note={n} style={{ position: 'absolute', top: 0, left: `calc(${(wi / whites.length) * 100}% - ${(0.3 / whites.length) * 100}%)`, width: `${(0.6 / whites.length) * 100}%`, height: '60%', background: active.includes(n) ? 'var(--accent)' : '#1e293b', borderRadius: '0 0 5px 5px', color: '#cbd5e1', fontSize: 10, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 4, cursor: 'pointer', zIndex: 1 }}>
                <span style={{ pointerEvents: 'none' }}>{keyLabel(n - base)}</span>
              </div>
            )
          })}
        </div>
        <canvas ref={scope} style={{ width: '100%', height: 90, display: 'block', background: '#0f172a', borderRadius: 8, marginTop: 10 }} />
        <p className="muted" style={{ fontSize: 13 }}>Play with the mouse or touch (lower on a key = louder), or the computer keyboard: <b>Z…/</b> lower octave, <b>Q…P</b> upper octave, <b>Space</b> = sustain. Audio starts on the first note.</p>
        {rec.url && (
          <Row>
            <audio controls src={rec.url} style={{ flex: 1, minWidth: 220 }} />
            <Btn kind="primary" onClick={() => fetch(rec.url!).then((r) => r.blob()).then((b) => download('synth-take.wav', b))}>⬇ WAV ({num(rec.secs ?? 0, 1)} s)</Btn>
          </Row>
        )}
      </Panel>
      <Split>
        <div>
          <Panel title="Presets">
            <Select label="Load preset" value={s.preset} onChange={(k: string) => k && all[k] && set({ patch: all[k], preset: k })} options={[['', 'Custom…'], ...Object.keys(PRESETS).map((k) => [k, k] as [string, string]), ...Object.keys(s.user).map((k) => [k, `★ ${k}`] as [string, string])]} />
            <Row>
              <Txt label="Save current as" value={presetName} onChange={setPresetName} />
              <Btn kind="primary" disabled={!presetName.trim()} onClick={() => set({ user: { ...s.user, [presetName.trim()]: p }, preset: presetName.trim() })}>Save</Btn>
              {s.user[s.preset] && <Btn kind="ghost" onClick={() => { const u = { ...s.user }; delete u[s.preset]; set({ user: u, preset: '' }) }}>Delete</Btn>}
            </Row>
            <Row><JsonButtons name="synth-presets.json" data={s.user} onLoad={(u) => u && typeof u === 'object' && set({ user: { ...s.user, ...u } })} /></Row>
          </Panel>
          <Panel title="MIDI input">
            {midi.status === 'unsupported' ? (
              <Note tone="warn">Web MIDI isn't available in this browser. It works in Chrome, Edge and Opera (desktop and Android); Firefox needs a site-permission add-on and Safari doesn't support it. The on-screen and computer keyboards still work.</Note>
            ) : (
              <>
                <Row>
                  <Btn kind="primary" onClick={connectMidi}>{midi.status === 'ready' ? 'Rescan devices' : 'Connect MIDI keyboard'}</Btn>
                  <Select label="Channel" value={s.channel} onChange={(channel) => set({ channel })} options={[[-1, 'Omni (all)'], ...Array.from({ length: 16 }, (_, i) => [i, `Ch ${i + 1}`] as [number, string])]} />
                </Row>
                {midi.status === 'denied' && <Note tone="err">MIDI access was blocked. Allow it in the site settings and try again.</Note>}
                {midi.status === 'ready' && (midi.inputs.length ? <Note tone="ok">Listening to: {midi.inputs.join(', ')}. Sustain pedal (CC64), mod wheel (CC1 → LFO depth) and pitch bend (±2 semitones) are supported.</Note> : <Note tone="warn">No MIDI inputs found. Plug in a keyboard; the list updates automatically.</Note>)}
                {log.length > 0 && <pre style={{ fontSize: 12, margin: 0, background: 'var(--panel2)', padding: 8, borderRadius: 8 }}>{log.join('\n')}</pre>}
              </>
            )}
          </Panel>
          <Panel title="Oscillators & unison">
            <Row>
              <Select label="Osc A" value={p.waveA} onChange={(waveA) => P({ waveA })} options={waves} />
              <Select label="Osc B" value={p.waveB} onChange={(waveB) => P({ waveB })} options={waves} />
            </Row>
            <Slider label="Osc B mix" value={p.mixB} onChange={(mixB) => P({ mixB })} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Osc B transpose" value={p.semiB} onChange={(semiB) => P({ semiB })} min={-24} max={24} unit=" st" show={(v) => num(v, 0)} />
            <Slider label="Osc B fine" value={p.fineB} onChange={(fineB) => P({ fineB })} min={-50} max={50} unit=" ct" show={(v) => num(v, 0)} />
            <Slider label="Unison voices" value={p.unison} onChange={(unison) => P({ unison })} min={1} max={7} show={(v) => num(v, 0)} />
            <Slider label="Unison detune" value={p.spread} onChange={(spread) => P({ spread })} min={0} max={80} unit=" ct" show={(v) => num(v, 0)} />
            <Slider label="Velocity sensitivity" value={p.velSens} onChange={(velSens) => P({ velSens })} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />
          </Panel>
        </div>
        <div>
          <Panel title="Amp envelope">
            <Env a={p.a} d={p.d} s={p.s} r={p.r} color="#10b981" />
            <Row>
              <Slider label="Attack" value={p.a} onChange={(a) => P({ a })} min={0.001} max={3} step={0.001} show={sec} />
              <Slider label="Decay" value={p.d} onChange={(d) => P({ d })} min={0.01} max={3} step={0.01} show={sec} />
              <Slider label="Sustain" value={p.s} onChange={(v) => P({ s: v })} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Release" value={p.r} onChange={(r) => P({ r })} min={0.01} max={5} step={0.01} show={sec} />
            </Row>
          </Panel>
          <Panel title="Filter & filter envelope">
            <Row>
              <Select label="Type" value={p.ftype} onChange={(ftype) => P({ ftype })} options={[['lowpass', 'Low-pass'], ['highpass', 'High-pass'], ['bandpass', 'Band-pass']]} />
            </Row>
            <Slider label="Cutoff" value={Math.log2(p.cutoff / 20)} onChange={(v) => P({ cutoff: Math.round(20 * 2 ** v) })} min={0} max={9.9} step={0.01} show={(v) => `${num(20 * 2 ** v, 0)} Hz`} />
            <Slider label="Resonance (Q)" value={p.q} onChange={(q) => P({ q })} min={0.1} max={20} step={0.1} />
            <Slider label="Envelope amount" value={p.famt} onChange={(famt) => P({ famt })} min={-4} max={6} step={0.1} unit=" oct" />
            <Env a={p.fa} d={p.fd} s={p.fs} r={p.fr} color="#f59e0b" />
            <Row>
              <Slider label="Attack" value={p.fa} onChange={(fa) => P({ fa })} min={0.001} max={3} step={0.001} show={sec} />
              <Slider label="Decay" value={p.fd} onChange={(fd) => P({ fd })} min={0.01} max={3} step={0.01} show={sec} />
              <Slider label="Sustain" value={p.fs} onChange={(fs) => P({ fs })} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Release" value={p.fr} onChange={(fr) => P({ fr })} min={0.01} max={5} step={0.01} show={sec} />
            </Row>
          </Panel>
          <Panel title="LFO & effects">
            <Row>
              <Select label="LFO target" value={p.lfoTarget} onChange={(lfoTarget) => P({ lfoTarget })} options={[['pitch', 'Pitch (vibrato)'], ['filter', 'Filter (wah)'], ['amp', 'Volume (tremolo)']]} />
            </Row>
            <Slider label="LFO rate" value={p.lfoRate} onChange={(lfoRate) => P({ lfoRate })} min={0.05} max={20} step={0.05} unit=" Hz" />
            <Slider label="LFO depth" value={p.lfoDepth} onChange={(lfoDepth) => P({ lfoDepth })} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Delay time" value={p.delayTime} onChange={(delayTime) => P({ delayTime })} min={0.03} max={1.5} step={0.005} show={sec} />
            <Slider label="Delay feedback" value={p.delayFb} onChange={(delayFb) => P({ delayFb })} min={0} max={0.9} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Delay mix" value={p.delayMix} onChange={(delayMix) => P({ delayMix })} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Reverb size" value={p.revSize} onChange={(revSize) => P({ revSize })} min={0.2} max={6} step={0.1} unit=" s" />
            <Slider label="Reverb mix" value={p.revMix} onChange={(revMix) => P({ revMix })} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Master volume" value={p.volume} onChange={(volume) => P({ volume })} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
          </Panel>
        </div>
      </Split>
    </div>
  )
}
