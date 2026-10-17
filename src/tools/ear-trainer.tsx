import { useCallback, useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, Note, Panel, pct, Row, Select, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { makeQuestion, midiToHz, noteName, pool, record, totals, weakest, type Level, type Mode, type Question, type Stats as Scores } from './lib/ear-trainer'

type Dir = 'up' | 'down' | 'together' | 'mixed'

const DEF = {
  mode: 'interval' as Mode,
  level: 1 as Level,
  dir: 'up' as Dir,
  tempo: 1,
  autoNext: true,
  focusWeak: false,
  stats: {} as Scores,
  streak: 0,
  best: 0,
}

// ---------- tiny additive piano ----------
let ac: AudioContext | null = null
let master: GainNode | null = null
function audio() {
  if (!ac) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ac = new AC()
    const comp = ac.createDynamicsCompressor()
    master = ac.createGain()
    master.gain.value = 0.35
    master.connect(comp).connect(ac.destination)
  }
  if (ac.state === 'suspended') void ac.resume()
  return { ctx: ac, out: master! }
}

function strike(midi: number, t0: number, dur: number) {
  const { ctx, out } = audio()
  const f = midiToHz(midi)
  const bright = Math.max(0.3, 1 - (midi - 48) / 60)
  const g = ctx.createGain()
  g.connect(out)
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(0.28, t0 + 0.006)
  g.gain.setTargetAtTime(0.0001, t0 + 0.02, dur * 0.45)
  for (let h = 1; h <= 7; h++) {
    const o = ctx.createOscillator()
    const hg = ctx.createGain()
    o.frequency.value = f * h * Math.sqrt(1 + 0.00012 * h * h) // slight string inharmonicity
    const amp = (h === 1 ? 1 : 0.55 * bright) / Math.pow(h, 1.4)
    hg.gain.setValueAtTime(amp, t0)
    hg.gain.setTargetAtTime(0.0001, t0, (dur * 0.6) / h)
    o.connect(hg).connect(g)
    o.start(t0)
    o.stop(t0 + dur * 2.5)
  }
}

function playNotes(notes: number[], together: boolean, tempo: number, alsoBlock = false) {
  const { ctx } = audio()
  const t = ctx.currentTime + 0.05
  const step = (notes.length > 4 ? 0.36 : 0.62) / tempo
  if (together) notes.forEach((n) => strike(n, t, 1.8))
  else {
    notes.forEach((n, i) => strike(n, t + i * step, 1.1))
    if (alsoBlock) notes.forEach((n) => strike(n, t + notes.length * step + 0.15, 1.8))
  }
}

// ---------- keyboard ----------
const LO = 48, HI = 84
const BLACK = new Set([1, 3, 6, 8, 10])
function Keyboard({ lit, root }: { lit: number[]; root?: number }) {
  const whites: number[] = []
  for (let m = LO; m <= HI; m++) if (!BLACK.has(m % 12)) whites.push(m)
  const W = 22, H = 90
  const xOf = (m: number) => whites.indexOf(m) * W
  return (
    <svg viewBox={`0 0 ${whites.length * W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="Piano keyboard">
      {whites.map((m) => (
        <g key={m}>
          <rect x={xOf(m)} y={0} width={W - 1} height={H} rx={3} fill={lit.includes(m) ? (m === root ? 'var(--accent)' : 'var(--accent2)') : '#fafafa'} stroke="#999" />
          {m % 12 === 0 && <text x={xOf(m) + W / 2} y={H - 6} textAnchor="middle" fontSize={8} fill="#555">{noteName(m)}</text>}
        </g>
      ))}
      {Array.from({ length: HI - LO + 1 }, (_, i) => LO + i).filter((m) => BLACK.has(m % 12)).map((m) => (
        <rect key={m} x={xOf(m - 1) + W * 0.68} y={0} width={W * 0.62} height={H * 0.6} rx={2} fill={lit.includes(m) ? (m === root ? 'var(--accent)' : 'var(--accent2)') : '#222'} />
      ))}
    </svg>
  )
}

export default function EarTrainer() {
  const [s, set, reset] = useToolState('ear-trainer', DEF)
  const [q, setQ] = useState<Question>(() => makeQuestion(s.mode, s.level, s.dir))
  const [picked, setPicked] = useState<string | null>(null)
  const [wrong, setWrong] = useState<string[]>([])
  const timer = useRef(0)
  const items = pool(s.mode, s.level)
  const done = picked === q.item.id

  const play = useCallback((qq: Question = q) => playNotes(qq.notes, qq.direction === 'together', s.tempo, qq.mode === 'chord'), [q, s.tempo])

  const next = useCallback(
    (autoplay = true) => {
      clearTimeout(timer.current)
      const focus = s.focusWeak && Math.random() < 0.6 ? weakest(s.stats, s.mode, s.level).slice(0, 3) : undefined
      const nq = makeQuestion(s.mode, s.level, s.dir, Math.random, q.item.id, focus)
      setQ(nq)
      setPicked(null)
      setWrong([])
      if (autoplay) play(nq)
    },
    [s.mode, s.level, s.dir, s.focusWeak, s.stats, q.item.id, play],
  )

  const change = (p: Partial<typeof DEF>) => {
    // Settings changed: fresh question (silent until the user presses play).
    const n = { ...s, ...p }
    set(p)
    setQ(makeQuestion(n.mode, n.level, n.dir))
    setPicked(null)
    setWrong([])
  }

  const answer = (id: string) => {
    if (done || wrong.includes(id)) return
    const first = wrong.length === 0
    const ok = id === q.item.id
    if (first) set((p) => ({ ...p, stats: record(p.stats, q.mode, q.item.id, ok), streak: ok ? p.streak + 1 : 0, best: ok ? Math.max(p.best, p.streak + 1) : p.best }))
    if (ok) {
      setPicked(id)
      if (s.autoNext && first) timer.current = window.setTimeout(() => next(), 1400)
    } else {
      setWrong((w) => [...w, id])
      const it = items.find((i) => i.id === id)
      if (it) playNotes(it.steps.map((st) => q.root + st), q.direction === 'together', s.tempo * 1.3)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,select,textarea')) return
      if (e.code === 'Space') {
        e.preventDefault()
        play()
      }
      else if (e.key === 'Enter') next()
      else if (/^[1-9]$/.test(e.key) && items[Number(e.key) - 1]) answer(items[Number(e.key) - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const tot = totals(s.stats, s.mode)
  const all = totals(s.stats)
  const showKeys = done || wrong.length >= 2

  return (
    <Split wide="right">
      <div>
        <Panel title="Exercise">
          <Seg value={s.mode} onChange={(mode) => change({ mode, dir: mode === 'scale' && s.dir === 'together' ? 'up' : s.dir })} options={[['interval', 'Intervals'], ['chord', 'Chords'], ['scale', 'Scales']]} />
          <div style={{ height: 10 }} />
          <Seg value={String(s.level) as '1' | '2' | '3'} onChange={(v) => change({ level: Number(v) as Level })} options={[['1', 'Beginner'], ['2', 'Intermediate'], ['3', 'Advanced']]} />
          <Select
            label="Playback"
            value={s.dir}
            onChange={(dir) => change({ dir })}
            options={s.mode === 'scale' ? [['up', 'Ascending'], ['down', 'Descending'], ['mixed', 'Random direction']] : [['up', 'Ascending (melodic)'], ['down', 'Descending (melodic)'], ['together', 'Harmonic (together)'], ['mixed', 'Random']]}
          />
          <Slider label="Tempo" value={s.tempo} min={0.5} max={2} step={0.1} show={(v) => `${v.toFixed(1)}×`} onChange={(tempo) => set({ tempo })} />
          <Check label="Next question after a correct answer" value={s.autoNext} onChange={(autoNext) => set({ autoNext })} />
          <Check label="Focus on my weakest items" value={s.focusWeak} onChange={(focusWeak) => set({ focusWeak })} />
          <p className="muted" style={{ fontSize: 13 }}>
            Keys: <b>Space</b> replay · <b>1–9</b> answer · <b>Enter</b> next. Only your first guess counts toward stats.
          </p>
        </Panel>
        <Panel title={`Progress · ${s.mode}s`} actions={<Btn kind="ghost" onClick={() => confirm('Clear all ear-training stats?') && reset()}>Reset stats</Btn>}>
          {items.map((it) => {
            const sc = s.stats[`${s.mode}:${it.id}`]
            const a = sc ? sc.right / sc.total : 0
            return (
              <div key={it.id} style={{ marginBottom: 8 }}>
                <Row wrap={false}>
                  <span style={{ flex: 1 }}>{it.name}</span>
                  <span className="muted">{sc ? `${sc.right}/${sc.total} · ${pct(a, 0)}` : 'not tried'}</span>
                </Row>
                <Bar value={a} color={!sc ? 'var(--line)' : a >= 0.8 ? 'var(--ok)' : a >= 0.5 ? 'var(--warn)' : 'var(--err)'} />
              </div>
            )
          })}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Streak" value={s.streak} sub={`best ${s.best}`} tone={s.streak >= 5 ? 'good' : undefined} />
          <Stat label={`Accuracy (${s.mode}s)`} value={tot.total ? pct(tot.right / tot.total, 0) : '—'} sub={`${tot.right} of ${tot.total}`} />
          <Stat label="All exercises" value={all.total} sub={all.total ? `${pct(all.right / all.total, 0)} correct` : 'answers so far'} />
        </Stats>
        <Panel title="Listen and identify">
          <Row>
            <Btn kind="primary" onClick={() => play()}>▶ Play {s.mode}</Btn>
            <Btn onClick={() => playNotes([q.root], true, s.tempo)}>Root only</Btn>
            <Btn onClick={() => next()}>Next ⏭</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 12px' }}>
            {q.direction === 'together' ? 'Played together' : q.direction === 'down' ? 'Played descending' : 'Played ascending'}
            {q.mode === 'chord' && q.direction !== 'together' ? ', then as a block chord' : ''} · {items.length} choices
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {items.map((it, i) => {
              const isWrong = wrong.includes(it.id)
              const isRight = done && it.id === q.item.id
              return (
                <button
                  key={it.id}
                  type="button"
                  className="k-btn"
                  onClick={() => answer(it.id)}
                  style={{
                    padding: '12px 10px',
                    justifyContent: 'flex-start',
                    background: isRight ? 'var(--ok)' : isWrong ? 'var(--err)' : undefined,
                    color: isRight || isWrong ? '#fff' : undefined,
                    opacity: done && !isRight ? 0.6 : 1,
                  }}
                >
                  <span className="muted" style={{ color: isRight || isWrong ? '#fff' : undefined, marginRight: 6 }}>{i < 9 ? i + 1 : ''}</span>
                  {it.name}
                </button>
              )
            })}
          </div>
          <div style={{ marginTop: 12 }}>
            {done ? (
              <Note tone={wrong.length ? 'warn' : 'ok'}>
                {wrong.length ? 'Got there' : 'Correct!'} It was a <b>{q.item.name}</b> from {noteName(q.root)}: {q.item.steps.map((st) => noteName(q.root + st)).join(' – ')}.
              </Note>
            ) : wrong.length ? (
              <Note tone="err">Not quite: you just heard your guess from the same root. Compare and try again.</Note>
            ) : (
              <Note>Press play, then pick what you heard. Tip: sing the root and the top note to compare.</Note>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <Keyboard lit={showKeys ? q.notes : [q.root]} root={q.root} />
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{showKeys ? 'Notes of the answer (root highlighted)' : 'Root note shown; the rest is revealed after you answer'}</p>
          </div>
        </Panel>
      </div>
    </Split>
  )
}
