import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, CopyButton, Note, Num, Panel, Row, Select, Split, Txt, uid, useToolState } from '../kit'
import { download } from '../kitlib'
import { chordName, chordNotes, MODES, palette, parseRoman, scaleOf, smoothVoice, TONICS, voice, writeMidi, type Chord } from './lib/chord-progression-builder'
import { midiToFreq } from './lib/midi-keyboard-synth'

interface Block { id: string; roman: string; beats: number }
const mkB = (roman: string, beats = 4): Block => ({ id: uid(), roman, beats })
const PRESETS: Record<string, { key: [string, string]; chords: string }> = {
  'Pop anthem (I–V–vi–IV)': { key: ['C', 'major'], chords: 'I V vi IV' },
  'Jazz ii–V–I': { key: ['F', 'major'], chords: 'ii7 V7 Imaj7 Imaj7' },
  '50s doo-wop': { key: ['G', 'major'], chords: 'I vi IV V' },
  'Canon-style': { key: ['D', 'major'], chords: 'I V vi iii IV I IV V' },
  'Andalusian cadence': { key: ['A', 'minor'], chords: 'i bVII bVI V' },
  '12-bar blues': { key: ['A', 'mixolydian'], chords: 'I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7' },
  'Secondary dominants': { key: ['C', 'major'], chords: 'I V7/vi vi V7/V V7 I' },
  'Borrowed (modal mixture)': { key: ['E', 'major'], chords: 'I bVI bVII I iv I' },
  'Circle of fifths (minor)': { key: ['E', 'minor'], chords: 'i iv7 VII7 IIImaj7 VImaj7 ii°7 V7 i' },
}
const DEF = { tonic: 'C', mode: 'major', bpm: 96, blocks: PRESETS['Pop anthem (I–V–vi–IV)'].chords.split(' ').map((r) => mkB(r)), inst: 'Piano', smooth: true, bass: true, loop: true }
const FN_COL: Record<Chord['fn'], string> = { T: '#22c55e', PD: '#0ea5e9', D: '#f97316', other: '#a855f7' }
const FN_NAME: Record<Chord['fn'], string> = { T: 'tonic', PD: 'predominant', D: 'dominant', other: 'colour' }
const lo = 48, hi = 84
const WHITES = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k).filter((n) => ![1, 3, 6, 8, 10].includes(n % 12)).length
const INSTS = ['Piano', 'Pad', 'Organ', 'Pluck'] as const

function playNote(ctx: AudioContext, out: AudioNode, midi: number, t: number, dur: number, inst: string, vel = 0.18) {
  const f = midiToFreq(midi)
  const g = ctx.createGain()
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.connect(g)
  g.connect(out)
  const oscs: [OscillatorType, number, number][] = inst === 'Pad' ? [['sawtooth', 1, -7], ['sawtooth', 1, 7]] : inst === 'Organ' ? [['sine', 1, 0], ['sine', 2, 0], ['sine', 3, 0]] : inst === 'Pluck' ? [['square', 1, 0]] : [['triangle', 1, 0], ['sine', 2, 3]]
  lp.frequency.value = inst === 'Pad' ? 1400 : inst === 'Pluck' ? 2200 : 5000
  const end = t + dur
  g.gain.setValueAtTime(0, t)
  if (inst === 'Pad') { g.gain.linearRampToValueAtTime(vel * 0.6, t + 0.35); g.gain.setValueAtTime(vel * 0.6, end - 0.05); g.gain.linearRampToValueAtTime(0, end + 0.4) }
  else if (inst === 'Organ') { g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.02); g.gain.setValueAtTime(vel * 0.5, end - 0.03); g.gain.linearRampToValueAtTime(0, end + 0.05) }
  else { g.gain.linearRampToValueAtTime(vel, t + 0.005); g.gain.exponentialRampToValueAtTime(vel * (inst === 'Pluck' ? 0.02 : 0.25), t + (inst === 'Pluck' ? 0.4 : 1.2)); g.gain.setValueAtTime(vel * 0.1, end - 0.02); g.gain.linearRampToValueAtTime(0, end + 0.15) }
  for (const [type, mul, det] of oscs) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = f * mul
    o.detune.value = det
    const og = ctx.createGain()
    og.gain.value = 1 / (mul * oscs.length)
    o.connect(og)
    og.connect(lp)
    o.start(t)
    o.stop(end + 0.5)
  }
}

export default function ChordProgressionBuilder() {
  const [s, set] = useToolState('chord-progression-builder', DEF)
  const key = useMemo(() => ({ tonic: s.tonic, mode: s.mode }), [s.tonic, s.mode])
  const [text, setText] = useState(s.blocks.map((b) => b.roman).join(' '))
  const [playing, setPlaying] = useState<number | null>(null)
  const [selected, setSelected] = useState(0)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const timer = useRef<number[]>([])
  const sc = scaleOf(key)

  const parsed = useMemo(() => s.blocks.map((b) => parseRoman(b.roman, key)), [s.blocks, key])
  const voicings = useMemo(() => {
    const out: { notes: number[]; inversion: number }[] = []
    for (const c of parsed) {
      const prev = out.length ? out[out.length - 1].notes : null
      if (!c) out.push({ notes: prev ?? [], inversion: 0 })
      else out.push(s.smooth ? smoothVoice(c, prev && prev.length ? prev : null) : { notes: voice(c, 0), inversion: 0 })
    }
    return out.map((v, i) => (parsed[i] ? v : { notes: [], inversion: 0 }))
  }, [parsed, s.smooth])
  const pal = useMemo(() => palette(key), [key])
  const bad = s.blocks.filter((_, i) => !parsed[i]).map((b) => b.roman)
  const totalBeats = s.blocks.reduce((a, b) => a + b.beats, 0)

  const setBlocks = (blocks: Block[]) => { set({ blocks }); setText(blocks.map((b) => b.roman).join(' ')) }
  const stop = () => {
    timer.current.forEach(clearTimeout)
    timer.current = []
    ctxRef.current?.close()
    ctxRef.current = null
    setPlaying(null)
  }
  useEffect(() => () => { timer.current.forEach(clearTimeout); ctxRef.current?.close() }, [])

  const audition = (notes: number[], bassNote?: number) => {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    if (!ctxRef.current) ctxRef.current = new AC()
    const ctx = ctxRef.current
    const t = ctx.currentTime + 0.03
    notes.forEach((n) => playNote(ctx, ctx.destination, n, t, 1.2, s.inst))
    if (bassNote !== undefined) playNote(ctx, ctx.destination, bassNote, t, 1.2, s.inst, 0.2)
  }

  const play = () => {
    stop()
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    ctxRef.current = ctx
    const master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
    const spb = 60 / s.bpm
    const run = (start: number) => {
      let t = start
      s.blocks.forEach((b, i) => {
        const v = voicings[i]
        const c = parsed[i]
        const dur = b.beats * spb
        if (c) {
          v.notes.forEach((n) => playNote(ctx, master, n, t, dur * 0.97, s.inst))
          if (s.bass) playNote(ctx, master, 36 + c.root, t, dur * 0.97, s.inst === 'Pad' ? 'Pad' : 'Pluck', 0.22)
        }
        timer.current.push(window.setTimeout(() => { setPlaying(i); setSelected(i) }, (t - ctx.currentTime) * 1000))
        t += dur
      })
      timer.current.push(window.setTimeout(() => {
        if (s.loop && ctxRef.current === ctx) { timer.current = []; run(ctx.currentTime + 0.05) }
        else stop()
      }, (t - ctx.currentTime - 0.1) * 1000))
    }
    run(ctx.currentTime + 0.08)
  }

  const exportMidi = () => {
    const tpq = 480
    let tick = 0
    const ev = s.blocks.flatMap((b, i) => {
      const c = parsed[i]
      const dur = b.beats * tpq
      const out = c ? [{ tick, notes: voicings[i].notes, dur: dur - 10, vel: 80, ch: 0 }, ...(s.bass ? [{ tick, notes: [36 + c.root], dur: dur - 10, vel: 90, ch: 1 }] : [])] : []
      tick += dur
      return out
    })
    const prog = s.inst === 'Organ' ? 16 : s.inst === 'Pad' ? 89 : s.inst === 'Pluck' ? 24 : 0
    download(`progression-${s.tonic}-${s.mode.replace(/\s/g, '-')}.mid`, new Blob([writeMidi(ev, s.bpm, prog, tpq) as BlobPart], { type: 'audio/midi' }), 'audio/midi')
  }

  const sel = parsed[selected] ? { c: parsed[selected]!, v: voicings[selected] } : null

  return (
    <Split wide="left">
      <div>
        <Panel
          title={`Progression in ${s.tonic} ${s.mode} · ${s.blocks.length} chords · ${totalBeats} beats`}
          actions={<>
            {playing === null ? <Btn kind="primary" onClick={play} disabled={!s.blocks.length}>▶ Play</Btn> : <Btn kind="danger" onClick={stop}>■ Stop</Btn>}
            <Btn onClick={exportMidi} disabled={!s.blocks.length}>⬇ MIDI</Btn>
            <CopyButton text={() => s.blocks.map((b, i) => (parsed[i] ? chordName(parsed[i]!, voicings[i].inversion) : b.roman)).join(' | ')} label="Chord names" />
          </>}
        >
          <Row>
            <Select label="Preset" value="" onChange={(p) => {
              const pr = PRESETS[p]
              if (!pr) return
              stop()
              set({ tonic: pr.key[0], mode: pr.key[1] })
              setBlocks(pr.chords.split(' ').map((r) => mkB(r)))
              setSelected(0)
            }} options={[['', 'Load a preset…'], ...Object.keys(PRESETS).map((k) => [k, k] as [string, string])]} />
            <Btn kind="ghost" onClick={() => setBlocks([])}>Clear</Btn>
          </Row>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { const r = e.dataTransfer.getData('text/roman'); if (r) setBlocks([...s.blocks, mkB(r)]) }}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 110, padding: 8, border: '2px dashed var(--line)', borderRadius: 12, margin: '8px 0' }}
          >
            {s.blocks.length === 0 && <span className="k-hint">Drop chords here, or type numerals below.</span>}
            {s.blocks.map((b, i) => {
              const c = parsed[i]
              return (
                <div key={b.id} draggable onDragStart={(e) => { setDragIdx(i); e.dataTransfer.setData('text/idx', String(i)) }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.stopPropagation()
                    const r = e.dataTransfer.getData('text/roman')
                    const a = s.blocks.slice()
                    if (r) a.splice(i, 0, mkB(r))
                    else if (dragIdx !== null) { const [x] = a.splice(dragIdx, 1); a.splice(i, 0, x) }
                    setBlocks(a)
                    setDragIdx(null)
                  }}
                  onClick={() => { setSelected(i); if (c && playing === null) audition(voicings[i].notes, s.bass ? 36 + c.root : undefined) }}
                  style={{
                    flex: `${b.beats} 0 ${60 + b.beats * 14}px`, maxWidth: 260, cursor: 'grab', borderRadius: 10, padding: '8px 10px', position: 'relative',
                    background: c ? `color-mix(in srgb, ${FN_COL[c.fn]} 16%, var(--panel))` : 'color-mix(in srgb, var(--err) 18%, var(--panel))',
                    border: `2px solid ${playing === i ? 'var(--fg)' : selected === i ? 'var(--accent)' : 'transparent'}`,
                    boxShadow: playing === i ? '0 0 0 3px color-mix(in srgb, var(--accent) 40%, transparent)' : undefined,
                  }}>
                  <div style={{ fontFamily: 'serif', fontSize: 22, fontWeight: 700 }}>{c?.roman ?? b.roman}</div>
                  <div style={{ fontSize: 13 }}>{c ? chordName(c, voicings[i].inversion) : 'unknown'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c ? `${FN_NAME[c.fn]}${c.source !== 'diatonic' ? ' · ' + c.source : ''}` : '—'}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <select aria-label="Beats" value={b.beats} onChange={(e) => setBlocks(s.blocks.map((x) => (x.id === b.id ? { ...x, beats: +e.target.value } : x)))}
                      style={{ fontSize: 11, background: 'var(--panel)', color: 'var(--fg)', border: '1px solid var(--line)', borderRadius: 4 }}>
                      {[1, 2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{n} beat{n > 1 ? 's' : ''}</option>)}
                    </select>
                    <button type="button" aria-label="Remove chord" onClick={() => setBlocks(s.blocks.filter((x) => x.id !== b.id))}
                      style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
                  </div>
                </div>
              )
            })}
          </div>
          <Row>
            <Txt label="Roman numerals (space separated)" value={text} onChange={setText} hint="e.g. I vi ii7 V7/V V7 I · bVII · iv · N6 · viiø7" />
            <Btn onClick={() => setBlocks(text.split(/[\s|,]+/).filter(Boolean).map((r) => mkB(r, s.blocks.find((x) => x.roman === r)?.beats ?? 4)))}>Apply</Btn>
          </Row>
          {bad.length > 0 && <Note tone="err">Couldn't read: {bad.join(', ')}. Use I–VII (upper = major, lower = minor) with optional ♭/♯, °, ø, +, 7, maj7, sus4 and /target.</Note>}
        </Panel>
        <Panel title={sel ? `${sel.c.roman} — ${chordName(sel.c, sel.v.inversion)}` : 'Chord detail'}>
          {sel ? (
            <>
              <p style={{ margin: '0 0 8px' }}>
                Notes: <b>{chordNotes(sel.c).join(' – ')}</b> · voicing {sel.v.inversion === 0 ? 'root position' : sel.v.inversion === 1 ? '1st inversion' : sel.v.inversion === 2 ? '2nd inversion' : '3rd inversion'} · function: <b style={{ color: FN_COL[sel.c.fn] }}>{FN_NAME[sel.c.fn]}</b>
              </p>
              <svg viewBox={`0 0 ${WHITES * 20 + 2} 70`} style={{ width: '100%', height: 90 }} role="img" aria-label="Keyboard">
                {Array.from({ length: hi - lo + 1 }, (_, k) => lo + k).filter((n) => ![1, 3, 6, 8, 10].includes(n % 12)).map((n, k) => (
                  <rect key={n} x={k * 20 + 1} y={1} width={19} height={68} rx={2} fill={sel.v.notes.includes(n) ? 'var(--accent)' : '#fff'} stroke="#94a3b8" />
                ))}
                {Array.from({ length: hi - lo + 1 }, (_, k) => lo + k).filter((n) => [1, 3, 6, 8, 10].includes(n % 12)).map((n) => {
                  const whites = Array.from({ length: n - lo }, (_, k) => lo + k).filter((m) => ![1, 3, 6, 8, 10].includes(m % 12)).length
                  return <rect key={n} x={whites * 20 - 6} y={1} width={12} height={42} rx={2} fill={sel.v.notes.includes(n) ? 'var(--accent2)' : '#1e293b'} />
                })}
              </svg>
              {sel.c.source === 'secondary' && <Note>Secondary dominant: it borrows the dominant of another degree to tonicise it briefly — expect it to resolve to the chord after the slash.</Note>}
              {sel.c.source === 'borrowed' && <Note>Borrowed chord (modal mixture): taken from the parallel {s.mode === 'major' ? 'minor' : 'major'} key for colour.</Note>}
            </>
          ) : <Note>Select a chord block to see its notes.</Note>}
        </Panel>
      </div>
      <div>
        <Panel title="Key & sound">
          <Row>
            <Select label="Tonic" value={s.tonic} onChange={(tonic) => set({ tonic })} options={TONICS} />
            <Select label="Mode" value={s.mode} onChange={(mode) => set({ mode })} options={Object.keys(MODES)} />
          </Row>
          <p className="k-hint">Scale: <b>{sc.names.join(' ')}</b></p>
          <Row>
            <Num label="Tempo" value={s.bpm} onChange={(bpm) => set({ bpm: Math.max(30, Math.min(260, bpm)) })} unit="BPM" min={30} max={260} />
            <Select label="Instrument" value={s.inst} onChange={(inst) => set({ inst })} options={INSTS} />
          </Row>
          <Check label="Smooth voice leading (auto inversions)" value={s.smooth} onChange={(smooth) => set({ smooth })} />
          <Check label="Bass note (root)" value={s.bass} onChange={(bass) => set({ bass })} />
          <Check label="Loop playback" value={s.loop} onChange={(loop) => set({ loop })} />
        </Panel>
        <Panel title="Chord palette">
          <p className="k-hint">Click to add, or drag onto the timeline.</p>
          {pal.map((g) => (
            <div key={g.group} style={{ marginBottom: 10 }}>
              <div className="k-label" style={{ marginBottom: 4 }}>{g.group}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {g.chords.map((r) => {
                  const c = parseRoman(r, key)
                  if (!c) return null
                  return (
                    <button key={r} type="button" draggable onDragStart={(e) => e.dataTransfer.setData('text/roman', r)}
                      onClick={() => setBlocks([...s.blocks, mkB(r)])} title={`${chordName(c)}: ${chordNotes(c).join(' ')}`}
                      style={{ border: '1px solid var(--line)', borderBottom: `3px solid ${FN_COL[c.fn]}`, background: 'var(--panel2)', color: 'var(--fg)', borderRadius: 8, padding: '4px 8px', cursor: 'grab', lineHeight: 1.15 }}>
                      <b style={{ fontFamily: 'serif', fontSize: 15 }}>{c.roman}</b><br /><span style={{ fontSize: 11, color: 'var(--muted)' }}>{chordName(c)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <p className="k-hint">
            {(['T', 'PD', 'D', 'other'] as const).map((f) => <span key={f} style={{ marginRight: 10 }}><span style={{ color: FN_COL[f] }}>■</span> {FN_NAME[f]}</span>)}
          </p>
        </Panel>
      </div>
    </Split>
  )
}
