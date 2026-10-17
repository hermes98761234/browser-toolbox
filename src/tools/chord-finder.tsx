import { useMemo, useState } from 'react'
import { Btn, Check, Note, Panel, Row, Select, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { chordTones, findVoicings, INSTRUMENTS, intervalName, midiFreq, midiName, NOTES, parseChord, pianoNotes, QUALITIES, voicingNotes, type Instrument, type Voicing } from './lib/chord-finder'

const DEF = { root: 9, quality: 'm7', bass: -1, inst: 'guitar', inversion: 0, strum: true }
const QUICK = ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm', 'F', 'Bm', 'G7', 'Cmaj7', 'Dsus4', 'E7', 'Bb', 'F#m']

let ctx: AudioContext | null = null
function play(midis: number[], gap: number) {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  ctx ??= new AC()
  const c = ctx
  void c.resume()
  const t0 = c.currentTime + 0.03
  const master = c.createGain()
  master.gain.value = 0.9 / Math.sqrt(midis.length || 1)
  master.connect(c.destination)
  midis.forEach((m, i) => {
    const t = t0 + i * gap
    const f = midiFreq(m)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(Math.min(8000, f * 8), t)
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), t + 1.2)
    for (const [type, mul, vol] of [['triangle', 1, 1], ['sawtooth', 1, 0.25], ['sine', 2, 0.2]] as const) {
      const o = c.createOscillator()
      o.type = type
      o.frequency.value = f * mul
      const v = c.createGain()
      v.gain.value = vol
      o.connect(v).connect(lp)
      o.start(t)
      o.stop(t + 2.3)
    }
    lp.connect(g).connect(master)
  })
}

function Diagram({ v, inst, barre, active, onClick, rootPc }: { v: Voicing; inst: Instrument; barre: number; active: boolean; onClick: () => void; rootPc: number }) {
  const n = v.length
  const fr = v.filter((f) => f > 0)
  const maxF = fr.length ? Math.max(...fr) : 0
  const start = maxF <= 4 ? 1 : Math.min(...fr)
  const W = 22, X0 = 26, Y0 = 30, H = 24
  const sx = (i: number) => X0 + i * W
  const notes = voicingNotes(v, inst.tuning)
  return (
    <button onClick={onClick} className="k-btn" style={{ padding: 6, borderColor: active ? 'var(--accent)' : undefined, borderWidth: active ? 2 : 1, background: 'var(--panel)' }} title="Select and play">
      <svg width={X0 + (n - 1) * W + 22} height={Y0 + 5 * H + 22} style={{ display: 'block' }}>
        {start === 1 ? <rect x={X0 - 1} y={Y0 - 4} width={(n - 1) * W + 2} height={4} fill="currentColor" /> : <text x={X0 - 8} y={Y0 + H * 0.65} fontSize={11} textAnchor="end" fill="currentColor">{start}fr</text>}
        {Array.from({ length: 6 }, (_, k) => <line key={k} x1={X0} x2={X0 + (n - 1) * W} y1={Y0 + k * H} y2={Y0 + k * H} stroke="var(--muted)" />)}
        {v.map((_, i) => <line key={i} x1={sx(i)} x2={sx(i)} y1={Y0} y2={Y0 + 5 * H} stroke="var(--muted)" />)}
        {barre > 0 && (() => {
          const idx = v.map((f, i) => (f === barre ? i : -1)).filter((i) => i >= 0)
          return <rect x={sx(idx[0]) - 7} width={sx(idx[idx.length - 1]) - sx(idx[0]) + 14} y={Y0 + (barre - start + 0.5) * H - 7} height={14} rx={7} fill="var(--accent)" />
        })()}
        {v.map((f, i) =>
          f < 0 ? (
            <text key={i} x={sx(i)} y={Y0 - 10} fontSize={13} textAnchor="middle" fill="var(--muted)">×</text>
          ) : f === 0 ? (
            <circle key={i} cx={sx(i)} cy={Y0 - 14} r={5} fill="none" stroke={notes[i] % 12 === rootPc ? 'var(--err)' : 'currentColor'} strokeWidth={1.5} />
          ) : (
            <circle key={i} cx={sx(i)} cy={Y0 + (f - start + 0.5) * H} r={8} fill={notes[i] % 12 === rootPc ? 'var(--err)' : 'var(--accent)'} />
          ),
        )}
        {notes.map((m, i) => m >= 0 && <text key={i} x={sx(i)} y={Y0 + 5 * H + 15} fontSize={9} textAnchor="middle" fill="var(--muted)">{NOTES[m % 12]}</text>)}
      </svg>
    </button>
  )
}

function Piano({ notes, from = 48, to = 84 }: { notes: number[]; from?: number; to?: number }) {
  const whites: number[] = []
  for (let m = from; m <= to; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m)
  const WW = 24
  const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12)
  return (
    <svg viewBox={`0 0 ${whites.length * WW} 120`} style={{ width: '100%', display: 'block' }} role="img" aria-label="Piano keyboard">
      {whites.map((m, i) => (
        <g key={m}>
          <rect x={i * WW} y={0} width={WW} height={118} fill={notes.includes(m) ? 'var(--accent)' : '#fff'} stroke="#64748b" rx={3} />
          {notes.includes(m) && <text x={i * WW + WW / 2} y={108} fontSize={9} textAnchor="middle" fill="#fff">{NOTES[m % 12]}</text>}
          {m % 12 === 0 && !notes.includes(m) && <text x={i * WW + WW / 2} y={108} fontSize={8} textAnchor="middle" fill="#94a3b8">C{Math.floor(m / 12) - 1}</text>}
        </g>
      ))}
      {whites.map((m, i) => isBlack(m + 1) && m + 1 <= to && <rect key={'b' + m} x={(i + 1) * WW - 8} y={0} width={16} height={72} fill={notes.includes(m + 1) ? 'var(--accent)' : '#1e293b'} stroke="#0f172a" rx={2} />)}
    </svg>
  )
}

export default function ChordFinder() {
  const [s, set, reset] = useToolState('chord-finder', DEF)
  const [text, setText] = useState('')
  const [picked, setPicked] = useState({ name: '', i: 0 })
  const inst = INSTRUMENTS.find((x) => x.id === s.inst) ?? INSTRUMENTS[0]
  const bass = s.bass >= 0 && s.bass !== s.root ? s.bass : undefined
  const tones = chordTones(s.root, s.quality)
  const name = NOTES[s.root] + s.quality + (bass !== undefined ? '/' + NOTES[bass] : '')
  const voicings = useMemo(() => findVoicings(s.root, s.quality, inst, bass, 12), [s.root, s.quality, inst, bass])
  const piano = pianoNotes(s.root, s.quality, s.inversion, 60, bass)
  const pick = picked.name === name + inst.id ? picked.i : 0
  const sel = voicings[Math.min(pick, voicings.length - 1)]
  const parsedErr = text && !parseChord(text)

  const apply = (str: string) => {
    const c = parseChord(str)
    if (c) set({ root: c.root, quality: c.quality, bass: c.bass ?? -1, inversion: 0 })
  }
  const playGuitar = (v: Voicing) => play(voicingNotes(v, inst.tuning).filter((m) => m >= 0), s.strum ? 0.04 : 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Chord">
          <Txt label="Type a chord name" value={text} onChange={(t) => { setText(t); apply(t) }} placeholder="e.g. Am7, F#m, Cmaj7, D/F#, Bbsus4" hint={parsedErr ? 'Not recognised. Try C, Dm7, G7sus4, Ebmaj9, A/C#' : undefined} />
          <div className="k-label" style={{ margin: '8px 0 4px' }}>Root</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
            {NOTES.map((n, i) => <Btn key={n} kind={s.root === i ? 'primary' : 'normal'} onClick={() => set({ root: i })}>{n}</Btn>)}
          </div>
          <Select label="Quality" value={s.quality} onChange={(quality) => set({ quality })} options={QUALITIES.map((q) => [q[0], `${q[0] || 'maj'} — ${q[1]}`] as const)} />
          <Select label="Bass note (slash chord)" value={s.bass} onChange={(b) => set({ bass: b })} options={[[-1, 'Root'] as const, ...NOTES.map((n, i) => [i, '/' + n] as const)]} />
        </Panel>
        <Panel title="Quick picks">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {QUICK.map((q) => <Btn key={q} kind={q === name ? 'primary' : 'ghost'} onClick={() => apply(q)}>{q}</Btn>)}
          </div>
        </Panel>
        <Panel title="Settings">
          <Seg value={s.inst} onChange={(i) => set({ inst: i })} options={INSTRUMENTS.map((x) => [x.id, x.name] as const)} />
          <Row>
            <Check label="Strum (arpeggiate) playback" value={s.strum} onChange={(strum) => set({ strum })} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Chord" value={<span style={{ fontSize: 30 }}>{name}</span>} sub={tones.name} tone="accent" />
          <Stat label="Notes" value={tones.pcs.map((p) => NOTES[p]).join(' · ')} sub={'Formula ' + tones.intervals.map((i) => intervalName(i, s.quality)).join(' – ')} />
          <Stat label="Voicings found" value={voicings.length} sub={inst.name} />
        </Stats>
        <Panel title={`${inst.name} shapes`} actions={sel && <Btn kind="primary" onClick={() => playGuitar(sel.v)}>▶ Play</Btn>}>
          {voicings.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {voicings.map((x, i) => <Diagram key={x.v.join()} v={x.v} inst={inst} barre={x.barre} rootPc={s.root} active={i === pick} onClick={() => { setPicked({ name: name + inst.id, i }); playGuitar(x.v) }} />)}
            </div>
          ) : (
            <Note tone="warn">No playable shape within a 4-fret stretch. Try another bass note or instrument.</Note>
          )}
          {sel && (
            <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
              Selected: <b>{sel.v.map((f) => (f < 0 ? 'x' : f)).join(' ')}</b> (low → high string) · sounding {voicingNotes(sel.v, inst.tuning).filter((m) => m >= 0).map(midiName).join(' ')}
              {sel.barre ? ` · barre at fret ${sel.barre}` : ''}. Red dots are the root.
            </p>
          )}
        </Panel>
        <Panel title="Piano" actions={<Btn kind="primary" onClick={() => play(piano, s.strum ? 0.06 : 0)}>▶ Play</Btn>}>
          <Seg
            value={String(s.inversion)}
            onChange={(v) => set({ inversion: +v })}
            options={tones.intervals.map((_, i) => [String(i), i === 0 ? 'Root position' : `${i}${['st', 'nd', 'rd', 'th'][Math.min(3, i - 1)]} inversion`] as const)}
          />
          <div style={{ marginTop: 10 }}><Piano notes={piano} /></div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Keys: {piano.map(midiName).join(' – ')}</p>
        </Panel>
        <Panel title="Chord tones">
          <Table
            head={['Degree', 'Note', 'Semitones from root', 'Role']}
            rows={tones.intervals.map((iv, i) => [intervalName(iv, s.quality), NOTES[tones.pcs[i]], iv === 2 && tones.intervals.length > 3 ? 14 : iv, iv === 0 ? 'root' : iv === 3 || iv === 4 ? 'third (major/minor colour)' : iv === 7 ? 'fifth (often omitted)' : iv === 10 || iv === 11 ? 'seventh' : iv === 6 || iv === 8 ? 'altered fifth' : 'colour tone'])}
          />
        </Panel>
      </div>
    </Split>
  )
}
