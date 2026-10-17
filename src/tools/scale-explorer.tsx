import { useEffect, useRef, useState } from 'react'
import { Btn, Check, Note, Num, Panel, Row, Seg, Select, Slider, Table, Txt, useToolState } from '../kit'
import { INTERVALS, midiToFreq, noteName, parseNote, pc, SCALES, spell, triads, TUNINGS } from './lib/scale-explorer'

type Labels = 'note' | 'interval' | 'degree'
const DEF = { root: 9, scale: 8, tuning: 0, custom: 'E2 A2 D3 G3 B3 E4', useCustom: false, frets: 15, from: 0, to: 15, labels: 'note' as Labels, lefty: false, bpm: 140, rootsOnly: false }

/** Colour per semitone interval from the root (root stands out). */
const IC = ['#ef4444', '#f97316', '#f59e0b', '#a855f7', '#6366f1', '#10b981', '#64748b', '#0ea5e9', '#ec4899', '#14b8a6', '#84cc16', '#eab308']
const INLAY = [3, 5, 7, 9, 15, 17, 19, 21]

let ctx: AudioContext | null = null
function pluck(freq: number, when = 0, dur = 1.4) {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  ctx ??= new AC()
  void ctx.resume()
  const t = ctx.currentTime + when
  const g = ctx.createGain()
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(Math.min(8000, freq * 8), t)
  lp.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.5), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  for (const [type, mul, lvl] of [['sawtooth', 1, 0.5], ['triangle', 2, 0.25]] as const) {
    const o = ctx.createOscillator()
    const og = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq * mul, t)
    og.gain.value = lvl
    o.connect(og).connect(lp)
    o.start(t)
    o.stop(t + dur + 0.05)
  }
  lp.connect(g).connect(ctx.destination)
}

export default function ScaleExplorer() {
  const [s, set, reset] = useToolState('scale-explorer', DEF)
  const [playing, setPlaying] = useState<string | null>(null)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const customNotes = s.custom.trim().split(/[\s,]+/).map(parseNote)
  const customOk = customNotes.length >= 1 && customNotes.length <= 10 && customNotes.every((n) => n !== null)
  const strings = s.useCustom && customOk ? (customNotes as number[]) : (TUNINGS[s.tuning] ?? TUNINGS[0]).notes
  const scale = SCALES[s.scale] ?? SCALES[0]
  const names = spell(s.root, scale.steps)
  const nameOf = (m: number) => names[scale.steps.indexOf(pc(m - s.root))] ?? ''
  const inScale = (m: number) => scale.steps.includes(pc(m - s.root))
  const frets = Math.max(5, Math.min(24, Math.round(s.frets)))
  const lo = Math.max(0, Math.min(s.from, frets)), hi = Math.max(lo, Math.min(s.to, frets))
  const tri = triads(s.root, scale.steps)

  // Geometry: real fret spacing (rule of 18 / 2^(1/12)), open-string column left of the nut.
  const W = 1000, padL = 72, padR = 14, top = 26, gap = 30
  const H = top + gap * (strings.length - 1) + 34
  const L = (W - padL - padR) / (1 - 2 ** (-frets / 12))
  const fx = (f: number) => padL + L * (1 - 2 ** (-f / 12))
  const mid = (f: number) => (f === 0 ? padL - 26 : (fx(f - 1) + fx(f)) / 2)
  const X = (x: number) => (s.lefty ? W - x : x)
  const sy = (i: number) => top + gap * (strings.length - 1 - i) // highest string on top

  const lbl = (m: number) => {
    const iv = pc(m - s.root)
    if (s.labels === 'interval') return INTERVALS[iv]
    if (s.labels === 'degree') return String(scale.steps.indexOf(iv) + 1)
    return nameOf(m)
  }

  const play = (seq: { m: number; key: string }[]) => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    const dt = 60 / Math.max(30, s.bpm)
    seq.forEach((n, i) => {
      pluck(midiToFreq(n.m), i * dt, 1.2)
      timers.current.push(window.setTimeout(() => setPlaying(n.key), i * dt * 1000))
    })
    timers.current.push(window.setTimeout(() => setPlaying(null), seq.length * dt * 1000 + 300))
  }

  // Ascending-then-descending run inside the chosen fret window, low string to high.
  const runScale = () => {
    const seq: { m: number; key: string }[] = []
    let last = -1
    strings.forEach((open, si) => {
      for (let f = lo; f <= hi; f++) {
        const m = open + f
        if (inScale(m) && m > last && (si === strings.length - 1 || m < strings[si + 1] + lo)) {
          seq.push({ m, key: `${si}:${f}` })
          last = m
        }
      }
    })
    play([...seq, ...seq.slice(0, -1).reverse()])
  }

  return (
    <div>
      <Panel
        title={<>{names[0]} {scale.name} <span className="muted" style={{ fontWeight: 400 }}>· {names.join(' ')}</span></>}
        actions={<><Btn kind="primary" onClick={runScale}>▶ Play scale</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}
      >
        <div style={{ overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 640, display: 'block' }} role="img" aria-label="fretboard">
            <rect x={Math.min(X(padL), X(fx(frets)))} y={top - 10} width={fx(frets) - padL} height={gap * (strings.length - 1) + 20} fill="#7c5a3a" opacity={0.18} rx={4} />
            {lo > 0 || hi < frets ? <rect x={Math.min(X(lo === 0 ? padL - 44 : fx(lo - 1)), X(fx(hi)))} y={top - 14} width={Math.abs(fx(hi) - (lo === 0 ? padL - 44 : fx(lo - 1)))} height={gap * (strings.length - 1) + 28} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="6 4" rx={8} /> : null}
            {INLAY.filter((f) => f <= frets).map((f) => <circle key={f} cx={X(mid(f))} cy={top + (gap * (strings.length - 1)) / 2} r={6} fill="var(--muted)" opacity={0.35} />)}
            {[12, 24].filter((f) => f <= frets).map((f) => [0.25, 0.75].map((k) => <circle key={`${f}-${k}`} cx={X(mid(f))} cy={top + gap * (strings.length - 1) * k} r={6} fill="var(--muted)" opacity={0.35} />))}
            {Array.from({ length: frets + 1 }, (_, f) => (
              <g key={f}>
                <line x1={X(fx(f))} x2={X(fx(f))} y1={top - 10} y2={top + gap * (strings.length - 1) + 10} stroke={f === 0 ? 'var(--fg)' : 'var(--muted)'} strokeWidth={f === 0 ? 5 : 1.5} opacity={f === 0 ? 0.8 : 0.6} />
                {f > 0 && <text x={X(mid(f))} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--muted)">{f}</text>}
              </g>
            ))}
            {strings.map((open, i) => (
              <g key={i}>
                <line x1={X(padL)} x2={X(fx(frets))} y1={sy(i)} y2={sy(i)} stroke="var(--muted)" strokeWidth={0.8 + (1 - i / strings.length) * 1.8} />
                <text x={X(14)} y={sy(i) + 4} fontSize={12} fontWeight={700} fill="var(--muted)" textAnchor="middle">{noteName(open).replace(/-?\d+$/, '')}</text>
              </g>
            ))}
            {strings.map((open, si) =>
              Array.from({ length: frets + 1 }, (_, f) => {
                const m = open + f
                const iv = pc(m - s.root)
                if (!inScale(m) || (s.rootsOnly && iv !== 0)) return null
                const dim = f < lo || f > hi
                const key = `${si}:${f}`
                const on = playing === key
                return (
                  <g key={key} style={{ cursor: 'pointer' }} opacity={dim ? 0.25 : 1} onClick={() => { pluck(midiToFreq(m)); setPlaying(key); window.setTimeout(() => setPlaying((p) => (p === key ? null : p)), 400) }}>
                    <title>{`${nameOf(m)}${Math.floor(m / 12) - 1} · ${INTERVALS[iv]} · string ${strings.length - si}, fret ${f}`}</title>
                    <circle cx={X(mid(f))} cy={sy(si)} r={on ? 15 : 12} fill={IC[iv]} stroke={on ? 'var(--fg)' : iv === 0 ? '#7f1d1d' : 'none'} strokeWidth={on ? 3 : 2} />
                    <text x={X(mid(f))} y={sy(si) + 4} textAnchor="middle" fontSize={lbl(m).length > 2 ? 9 : 11} fontWeight={700} fill="#fff" pointerEvents="none">{lbl(m)}</text>
                  </g>
                )
              }),
            )}
          </svg>
        </div>
        <div className="k-legend" style={{ marginTop: 6 }}>
          {scale.steps.map((st, i) => (
            <span key={st}>
              <i style={{ background: IC[st] }} />
              {names[i]} <b>{INTERVALS[st]}</b>
            </span>
          ))}
        </div>
      </Panel>

      <div className="k-split">
        <div>
          <Panel title="Scale">
            <Row>
              <Select label="Root" value={s.root} onChange={(root) => set({ root })} options={['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'].map((n, i) => [i, n] as [number, string])} />
              <Select label="Scale / mode" value={s.scale} onChange={(scale) => set({ scale })} options={SCALES.map((x, i) => [i, `${x.name} · ${x.group}`] as [number, string])} />
            </Row>
            <div className="k-field">
              <span className="k-label">Dot labels</span>
              <Seg value={s.labels} onChange={(labels) => set({ labels })} options={[['note', 'Note names'], ['interval', 'Intervals'], ['degree', 'Degrees']]} />
            </div>
            <Row>
              <Check label="Roots only" value={s.rootsOnly} onChange={(rootsOnly) => set({ rootsOnly })} />
              <Check label="Left-handed" value={s.lefty} onChange={(lefty) => set({ lefty })} />
            </Row>
            <p className="muted" style={{ fontSize: 13 }}>Formula: <b>{scale.steps.map((x) => INTERVALS[x]).join(' – ')}</b> · steps {scale.steps.map((x, i) => (scale.steps[i + 1] ?? 12) - x).map((d) => (d === 1 ? 'H' : d === 2 ? 'W' : d === 3 ? 'W+H' : `${d}`)).join(' ')}</p>
          </Panel>
          {tri.length > 0 && (
            <Panel title="Chords in this scale">
              <Table head={['Degree', 'Chord', 'Quality', '']} rows={tri.map((t, i) => [t.roman, <b key="c">{t.name}</b>, t.quality, <Btn key="p" kind="ghost" onClick={() => { const r = 48 + pc(s.root + scale.steps[i]); [0, 2, 4].forEach((k, j) => pluck(midiToFreq(r + ((scale.steps[(i + k) % 7] - scale.steps[i] + 12) % 12)), j * 0.03, 1.8)) }}>▶</Btn>])} />
            </Panel>
          )}
        </div>
        <div>
          <Panel title="Instrument & tuning">
            <Select label="Tuning" value={s.tuning} onChange={(tuning) => set({ tuning, useCustom: false })} options={TUNINGS.map((t, i) => [i, t.name] as [number, string])} />
            <Check label="Use custom tuning" value={s.useCustom} onChange={(useCustom) => set({ useCustom })} />
            {s.useCustom && <Txt label="Strings, low to high" value={s.custom} onChange={(custom) => set({ custom })} placeholder="E2 A2 D3 G3 B3 E4" hint="Note + octave, e.g. D2 A2 D3 F#3 A3 D4" />}
            {s.useCustom && !customOk && <Note tone="err">Couldn't read that tuning. Use 1–10 notes like "C2 G2 D3 A3".</Note>}
            <Row>
              <Num label="Frets" value={s.frets} min={5} max={24} step={1} onChange={(f) => set({ frets: f, to: Math.min(s.to, f) })} />
              <Num label="Show from fret" value={s.from} min={0} max={24} step={1} onChange={(from) => set({ from })} />
              <Num label="to fret" value={s.to} min={0} max={24} step={1} onChange={(to) => set({ to })} />
            </Row>
            <Row>
              {[[0, frets], [0, 4], [5, 8], [7, 10], [12, 15]].map(([a, b]) => (
                <Btn key={`${a}-${b}`} kind={lo === a && hi === Math.min(b, frets) ? 'primary' : 'normal'} onClick={() => set({ from: a, to: Math.min(b, frets) })}>{a === 0 && b === frets ? 'Whole neck' : `Frets ${a}–${b}`}</Btn>
              ))}
            </Row>
            <Slider label="Playback tempo" value={s.bpm} min={40} max={320} step={5} onChange={(bpm) => set({ bpm })} unit=" BPM" show={(v) => String(v)} />
            <p className="muted" style={{ fontSize: 12 }}>Click any dot to hear it. "Play scale" runs up and back down through the highlighted fret window.</p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
