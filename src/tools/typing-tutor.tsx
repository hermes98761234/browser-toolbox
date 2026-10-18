import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, CsvButton, LineChart, Note, num, Panel, pct, Row, Select, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { CUSTOM_SAMPLE, fingerOf, KEY_ROWS, LESSONS, makeDrill, ROW_OFFSET, score, tally, weakKeys, type KeyStats, type Stroke } from './lib/typing-tutor'

interface Run { date: string; lesson: string; wpm: number; acc: number; secs: number }
interface State { mode: 'lesson' | 'custom'; lesson: string; words: number; custom: string; focusWeak: boolean; keys: KeyStats; history: Run[]; seed: number }

const DEF: State = {
  mode: 'lesson', lesson: 'home2', words: 25, custom: CUSTOM_SAMPLE, focusWeak: true, seed: 1,
  // A little practice history so the heatmap and progress chart have something to show on first load.
  keys: { a: { n: 40, err: 1 }, s: { n: 38, err: 2 }, d: { n: 41, err: 1 }, f: { n: 44, err: 0 }, g: { n: 20, err: 3 }, h: { n: 22, err: 4 }, j: { n: 43, err: 1 }, k: { n: 39, err: 2 }, l: { n: 37, err: 5 }, ';': { n: 9, err: 3 }, ' ': { n: 120, err: 2 } },
  history: [
    { date: '2026-10-12', lesson: 'Home row: F J D K', wpm: 18, acc: 0.91, secs: 70 },
    { date: '2026-10-14', lesson: 'Home row: all', wpm: 22, acc: 0.93, secs: 64 },
    { date: '2026-10-16', lesson: 'Home row: all', wpm: 26, acc: 0.95, secs: 58 },
  ],
}

const FINGER_COL = ['#f472b6', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#818cf8', '#c084fc', '#f87171']
const FINGERS = ['L pinky', 'L ring', 'L middle', 'L index', 'R index', 'R middle', 'R ring', 'R pinky']

function heat(rate: number) {
  // 0 % errors → green, ≥ 25 % → red
  const t = Math.min(1, rate / 0.25)
  return `hsl(${Math.round(140 - 140 * t)} 70% ${55 - t * 8}%)`
}

export default function TypingTutor() {
  const [s, set] = useToolState<State>('typing-tutor', DEF)
  const lesson = LESSONS.find((l) => l.id === s.lesson) ?? LESSONS[1]
  const weak = useMemo(() => weakKeys(s.keys, 5), [s.keys])
  const target = useMemo(() => {
    if (s.mode === 'custom') return s.custom.replace(/\s+/g, ' ').trim() || CUSTOM_SAMPLE
    return makeDrill(lesson, s.words, s.seed, s.focusWeak ? weak.map((w) => w.key) : [])
    // weak keys are read when a new drill is generated (seed change), not on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.mode, s.custom, lesson, s.words, s.seed, s.focusWeak])

  const [typed, setTyped] = useState('')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [now, setNow] = useState(0)
  const [focused, setFocused] = useState(false)
  const [done, setDone] = useState(false)
  const inp = useRef<HTMLTextAreaElement>(null)

  const [prevTarget, setPrevTarget] = useState(target)
  if (prevTarget !== target) {
    setPrevTarget(target)
    setTyped('')
    setStrokes([])
    setDone(false)
  }

  const running = strokes.length > 0 && !done
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(id)
  }, [running])

  const live = useMemo(() => {
    const r = score(strokes, typed, target)
    if (done || !strokes.length) return r
    // While typing, measure up to "now" so the speed decays during pauses.
    const ms = Math.max(r.ms, now - strokes[0].t)
    const min = ms / 60000
    return { ...r, ms, wpm: min > 0.02 ? r.correct / 5 / min : 0, rawWpm: min > 0.02 ? r.chars / 5 / min : 0 }
  }, [strokes, typed, target, now, done])

  const restart = (newDrill: boolean) => {
    setTyped('')
    setStrokes([])
    setDone(false)
    if (newDrill) set({ seed: s.seed + 1 })
    inp.current?.focus()
  }

  const onInput = (v: string) => {
    if (done) return
    v = v.replace(/\n/g, ' ')
    if (v.length > target.length) v = v.slice(0, target.length)
    const t = performance.now()
    if (v.length > typed.length) {
      const add: Stroke[] = []
      for (let i = typed.length; i < v.length; i++) add.push({ expected: target[i], typed: v[i], t })
      const all = [...strokes, ...add]
      setStrokes(all)
      setTyped(v)
      setNow(t)
      if (v.length === target.length) {
        setDone(true)
        const r = score(all, v, target)
        set((p) => ({
          ...p,
          keys: tally(p.keys, all),
          history: [...p.history, { date: new Date().toISOString().slice(0, 10), lesson: p.mode === 'custom' ? 'Custom text' : lesson.name, wpm: Math.round(r.wpm * 10) / 10, acc: Math.round(r.accuracy * 1000) / 1000, secs: Math.round(r.ms / 1000) }].slice(-200),
        }))
      }
    } else setTyped(v)
  }

  const nextKey = done ? '' : (target[typed.length] ?? '')
  const errorsNow = [...typed].filter((c, i) => c !== target[i]).length
  const best = s.history.reduce((a, r) => Math.max(a, r.wpm), 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Lesson">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['lesson', '⌨ Key-row lessons'], ['custom', '📝 Custom text']]} />
          {s.mode === 'lesson' ? (
            <>
              <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                {LESSONS.map((l, i) => (
                  <button key={l.id} type="button" className={`k-btn ${l.id === s.lesson ? 'primary' : ''}`} style={{ textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => set({ lesson: l.id, seed: s.seed + 1 })}>
                    {i + 1}. {l.name}
                  </button>
                ))}
              </div>
              <Row>
                <Select label="Drill length" value={s.words} onChange={(words) => set({ words })} options={[[15, '15 words'], [25, '25 words'], [40, '40 words'], [60, '60 words']]} />
              </Row>
              <Check label={`Extra practice on weak keys${weak.length ? ` (${weak.map((w) => (w.key === ' ' ? '␣' : w.key)).join(' ')})` : ''}`} value={s.focusWeak} onChange={(focusWeak) => set({ focusWeak, seed: s.seed + 1 })} />
              <p className="muted" style={{ fontSize: 13 }}>{lesson.note}</p>
            </>
          ) : (
            <>
              <Area label="Paste or write your own practice text" value={s.custom} onChange={(custom) => set({ custom })} rows={6} />
              <p className="muted" style={{ fontSize: 13 }}>Whitespace and line breaks are collapsed to single spaces. Great for practising code snippets, names or work vocabulary.</p>
            </>
          )}
        </Panel>
        <Panel title="Progress" actions={<CsvButton name="typing-history.csv" rows={() => [['Date', 'Lesson', 'WPM', 'Accuracy', 'Seconds'], ...s.history.map((r) => [r.date, r.lesson, r.wpm, r.acc, r.secs])]} />}>
          <LineChart height={180} series={[{ name: 'WPM', points: s.history.map((r, i) => [i + 1, r.wpm]), area: true }, { name: 'Accuracy %', points: s.history.map((r, i) => [i + 1, r.acc * 100]), dashed: true }]} xLabel="Session" fx={(v) => (Number.isInteger(v) ? String(v) : '')} fy={(v) => num(v, 0)} />
          <Table head={['Date', 'Lesson', 'WPM', 'Acc.']} rows={[...s.history].reverse().map((r) => [r.date, r.lesson, num(r.wpm, 1), pct(r.acc, 0)])} max={6} />
          <Row>
            <Btn kind="ghost" onClick={() => set({ history: [], keys: {} })}>Clear history & key stats</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Speed" value={`${num(live.wpm, 0)} WPM`} sub={`raw ${num(live.rawWpm, 0)} WPM`} tone="accent" />
          <Stat label="Accuracy" value={pct(live.accuracy, 1)} sub={`${live.errors} wrong keystroke${live.errors === 1 ? '' : 's'}`} tone={live.accuracy >= 0.95 ? 'good' : live.accuracy < 0.9 ? 'bad' : undefined} />
          <Stat label="Time" value={`${num(live.ms / 1000, 0)} s`} sub={`${typed.length} / ${target.length} chars`} />
          <Stat label="Best" value={`${num(best, 0)} WPM`} sub={`${s.history.length} sessions`} />
        </Stats>
        <Panel title={s.mode === 'custom' ? 'Custom text' : lesson.name} actions={<><Btn onClick={() => restart(false)}>↺ Restart</Btn>{s.mode === 'lesson' && <Btn kind="primary" onClick={() => restart(true)}>New drill</Btn>}</>}>
          <div style={{ position: 'relative' }} onClick={() => inp.current?.focus()}>
            <div
              style={{ fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace', fontSize: 22, lineHeight: 1.7, padding: '14px 16px', borderRadius: 10, background: 'var(--panel)', border: `2px solid ${focused ? 'var(--accent)' : 'var(--line)'}`, wordBreak: 'break-word', minHeight: 120, cursor: 'text' }}
              aria-hidden
            >
              {[...target].map((c, i) => {
                const t = typed[i]
                const st: React.CSSProperties = i < typed.length ? (t === c ? { color: 'var(--ok)' } : { color: '#fff', background: 'var(--err)', borderRadius: 3 }) : { color: 'var(--muted)' }
                if (i === typed.length && !done) Object.assign(st, { borderBottom: '3px solid var(--accent)', color: 'var(--text, inherit)' })
                return <span key={i} style={st}>{c === ' ' && i < typed.length && t !== c ? '·' : c}</span>
              })}
            </div>
            <textarea
              ref={inp}
              value={typed}
              onChange={(e) => onInput(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onPaste={(e) => e.preventDefault()}
              autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
              aria-label="Type the text shown"
              style={{ position: 'absolute', inset: 0, opacity: 0, resize: 'none', width: '100%', height: '100%' }}
            />
            {!focused && !done && <div style={{ position: 'absolute', right: 10, bottom: 8, fontSize: 12, background: 'var(--accent)', color: '#fff', padding: '3px 8px', borderRadius: 6, pointerEvents: 'none' }}>Click here and start typing</div>}
          </div>
          {done ? (
            <Note tone={live.accuracy >= 0.95 ? 'ok' : 'warn'}>
              Finished: <b>{num(live.wpm, 1)} WPM</b> at <b>{pct(live.accuracy, 1)}</b> accuracy in {num(live.ms / 1000, 0)} s.{' '}
              {live.accuracy < 0.95 ? 'Slow down a little — accuracy above 95 % builds speed faster than rushing.' : live.wpm > best - 0.05 ? 'New personal best!' : 'Solid run. Press “New drill” for another.'}
            </Note>
          ) : (
            <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
              The timer starts with your first key. Mistakes stay red — fix them with Backspace (they still count against accuracy). {errorsNow > 0 && <b style={{ color: 'var(--err)' }}>{errorsNow} uncorrected</b>}
            </p>
          )}
        </Panel>
        <Panel title="Weak-key heatmap">
          <Keyboard keys={s.keys} next={nextKey} />
          <Row>
            <span className="muted" style={{ fontSize: 12 }}>Error rate:</span>
            {[0, 0.06, 0.12, 0.25].map((r) => <span key={r} style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 14, height: 14, borderRadius: 3, background: heat(r), display: 'inline-block' }} />{r === 0.25 ? '≥25 %' : `${Math.round(r * 100)} %`}</span>)}
            <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 14, height: 14, borderRadius: 3, border: '1px solid var(--line)', display: 'inline-block' }} />not practised</span>
          </Row>
          {nextKey && fingerOf(nextKey) >= 0 && <p style={{ fontSize: 13, margin: '6px 0 0' }}>Next key <kbd>{nextKey}</kbd> → <b style={{ color: FINGER_COL[fingerOf(nextKey)] }}>{FINGERS[fingerOf(nextKey)]}</b></p>}
          {weak.length > 0 ? (
            <Table head={['Key', 'Seen', 'Error rate']} rows={weak.map((w) => [<kbd key="k">{w.key === ' ' ? 'space' : w.key}</kbd>, w.n, pct(w.rate, 0)])} />
          ) : <Note tone="ok">No weak keys yet — keep practising.</Note>}
        </Panel>
      </div>
    </Split>
  )
}

function Keyboard({ keys, next }: { keys: KeyStats; next: string }) {
  const U = 40, G = 4
  const W = 13.5 * U
  const nk = next.toLowerCase()
  const shift = next !== nk || '?!:"'.includes(next)
  return (
    <svg viewBox={`0 0 ${W} ${5 * U + 4}`} style={{ width: '100%', maxWidth: 620, display: 'block', margin: '0 auto' }} role="img" aria-label="Keyboard heatmap">
      {KEY_ROWS.map((row, r) => row.map((k, i) => {
        const x = (ROW_OFFSET[r] + i) * U
        const y = r * U
        const st = keys[k]
        const fill = st && st.n ? heat(st.err / st.n) : 'transparent'
        const isNext = k === nk
        return (
          <g key={k}>
            <rect x={x + G / 2} y={y + G / 2} width={U - G} height={U - G} rx={6} fill={fill} stroke={isNext ? 'var(--accent)' : 'var(--line)'} strokeWidth={isNext ? 3 : 1} />
            <rect x={x + G / 2 + 4} y={y + U - G / 2 - 6} width={U - G - 8} height={3} rx={1.5} fill={FINGER_COL[fingerOf(k)]} opacity={0.8} />
            <text x={x + U / 2} y={y + U / 2 + 3} textAnchor="middle" fontSize={15} fontWeight={600} fill="currentColor">{k.toUpperCase()}</text>
            {st && st.n > 0 && <title>{`${k}: ${st.err} errors / ${st.n} (${Math.round((st.err / st.n) * 100)} %)`}</title>}
          </g>
        )
      }))}
      {[0, 11.25].map((x, i) => <g key={i}><rect x={x * U + G / 2} y={3 * U + G / 2} width={(i ? 2.2 : 1.25) * U - G} height={U - G} rx={6} fill="none" stroke={shift ? 'var(--accent)' : 'var(--line)'} strokeWidth={shift ? 3 : 1} /><text x={x * U + (i ? 1.1 : 0.62) * U} y={3 * U + U / 2 + 3} textAnchor="middle" fontSize={11} fill="currentColor">shift</text></g>)}
      {(() => {
        const st = keys[' ']
        return <g><rect x={3.5 * U} y={4 * U + G / 2} width={6 * U} height={U - G} rx={6} fill={st && st.n ? heat(st.err / st.n) : 'transparent'} stroke={nk === ' ' ? 'var(--accent)' : 'var(--line)'} strokeWidth={nk === ' ' ? 3 : 1} /><text x={6.5 * U} y={4 * U + U / 2 + 3} textAnchor="middle" fontSize={12} fill="currentColor">space (thumbs)</text></g>
      })()}
    </svg>
  )
}
