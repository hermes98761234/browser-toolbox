import { useCallback, useEffect, useMemo, useState } from 'react'
import { Area, Bar, Btn, Check, FileDrop, LineChart, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { effectiveWpm, frames, orpIndex, prevSentence, remainingMs, words } from './lib/speed-reading-trainer'

interface Q { q: string; a: string[]; ok: number }
interface Passage { title: string; text: string; qs: Q[] }

// Original passages written for this tool.
const PASSAGES: Passage[] = [
  {
    title: 'How a swarm picks a home',
    text: `In late spring a crowded honeybee colony often splits. The old queen leaves with roughly half of the workers, and the swarm settles on a branch while it decides where to live. The choice is not made by the queen. A few hundred older bees become scouts and fly off to inspect hollow trees, wall cavities and old boxes. A good site is dry, has a small entrance near the bottom, and holds about forty litres of space. When a scout returns, she dances on the surface of the cluster. The length of her dance reflects how much she liked the place, so better sites recruit more inspectors. Scouts that found poor sites dance briefly and soon stop. Over hours or days, support shifts toward the best options. Scouts also count how many other bees are present at a site. Once enough of them gather there at the same time, they return and make a high piping sound that warms up the flight muscles of the whole swarm. Minutes later thousands of bees lift off together and stream toward the new home, guided by the few that know the way. Researchers admire this process because no single bee compares all of the options. Good decisions emerge from many small, independent judgements and a simple rule for when to stop debating.`,
    qs: [
      { q: 'Who decides where the swarm will live?', a: ['The queen', 'Scout bees, collectively', 'The youngest workers', 'The beekeeper'], ok: 1 },
      { q: 'What does the length of a scout’s dance signal?', a: ['Distance to the site', 'How much she liked the site', 'The time of day', 'Her age'], ok: 1 },
      { q: 'What triggers the swarm to take off?', a: ['Sunset', 'Enough scouts gathered at one site, then piping', 'The queen flying first', 'Rain'], ok: 1 },
    ],
  },
  {
    title: 'The ledger in the lighthouse',
    text: `When Mara took over the lighthouse on the northern point, the previous keeper left her a single instruction: write something in the ledger every night, even if nothing happens. The first week she wrote only the weather. Wind from the west, light rain, lamp lit at six. By the second month she was noting the colour of the sea at dawn, the number of gulls on the rail, and the name of every fishing boat that passed close enough to read. In winter the supply boat failed to arrive for nineteen days. Mara rationed coffee, mended a cracked window with tape and cardboard, and kept writing. On the twentieth morning she paged back through the ledger and noticed something she had missed. Every storm that autumn had been preceded by two days of unusually calm water and a sudden absence of gulls. She wrote a short note to the harbour office, and they began to watch for the same signs. The next spring a young fisherman climbed the hill to thank her. His boat had stayed in port on a calm, gull-less morning, and the storm that followed had been the worst in a decade. That evening Mara opened the ledger and wrote: wind from the south, sky clear, lamp lit at seven, one visitor.`,
    qs: [
      { q: 'What was the previous keeper’s instruction?', a: ['Polish the lamp daily', 'Write in the ledger every night', 'Never leave the island', 'Count the boats'], ok: 1 },
      { q: 'How long was the supply boat late?', a: ['Nine days', 'Two weeks', 'Nineteen days', 'A month'], ok: 2 },
      { q: 'Which signs came before the storms?', a: ['Heavy rain and fog', 'Calm water and no gulls', 'Strong east winds', 'Red sunsets'], ok: 1 },
    ],
  },
  {
    title: 'Why bread rises',
    text: `A loaf of bread begins as little more than flour, water, salt and yeast, yet it can double in size before it reaches the oven. The yeast is a living fungus. When it is mixed into dough it feeds on sugars released from the starch in the flour and produces carbon dioxide and a small amount of alcohol. On its own the gas would simply escape. What traps it is gluten, a network formed when two proteins in wheat flour meet water and are stretched by kneading. Kneading lines the proteins up into elastic sheets, a little like the rubber of a balloon. Each tiny bubble of gas pushes on these sheets and the dough swells. Temperature matters a great deal. Yeast works slowly in a cold kitchen and quickly in a warm one, which is why many bakers let dough rise overnight in the refrigerator to develop more flavour. In the oven the trapped gas expands further, the alcohol evaporates and the yeast dies once the dough passes about sixty degrees Celsius. The proteins then set and the starch firms up, fixing the bubbles in place. The open, airy crumb of a good loaf is a record of all that invisible activity, frozen at the moment the heat took over.`,
    qs: [
      { q: 'What gas makes dough rise?', a: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Steam only'], ok: 2 },
      { q: 'What traps the gas in the dough?', a: ['Salt crystals', 'The gluten network', 'Sugar syrup', 'The crust'], ok: 1 },
      { q: 'Why do some bakers rise dough in the fridge?', a: ['To kill the yeast', 'To develop more flavour slowly', 'To stop gluten forming', 'To save time'], ok: 1 },
    ],
  },
  {
    title: 'The quiet carriage',
    text: `The night train left the coast a few minutes after eleven, and Tomas found the quiet carriage almost empty. An older woman sat by the window with a crossword folded into a small square. A student slept against her rucksack. Tomas had meant to work, but the rhythm of the wheels and the dim lamps made it hard to concentrate, so he watched the dark fields slide past and tried to guess the names of the towns from their lights. Somewhere after midnight the train stopped between stations. Nobody announced anything. The engine hummed, then fell silent, and the carriage grew so quiet that Tomas could hear the woman’s pencil. After ten minutes she leaned across the aisle and asked whether he knew a seven-letter word for a feeling of calm after a long effort. He thought for a while and offered relief, which was too short. The student, who was apparently not asleep, said solace without opening her eyes. The woman counted the letters, shook her head, and then laughed and wrote in respite. The lights flickered, the engine woke, and the train moved on. None of them spoke again before the city, but when Tomas stepped onto the platform at dawn he realised he had not looked at his phone once.`,
    qs: [
      { q: 'Where did Tomas sit?', a: ['The dining car', 'The quiet carriage', 'A sleeper cabin', 'Near the driver'], ok: 1 },
      { q: 'Which word did the woman finally write in?', a: ['Relief', 'Solace', 'Respite', 'Comfort'], ok: 2 },
      { q: 'What did Tomas notice when he arrived?', a: ['He had missed his stop', 'He had not looked at his phone', 'His bag was gone', 'It was raining'], ok: 1 },
    ],
  },
]

interface Session { date: string; title: string; wpm: number; chunk: number; score: number | null; words: number }
interface State { src: number; custom: string; wpm: number; chunk: number; smart: boolean; ramp: boolean; guide: boolean; history: Session[] }
const DEF: State = { src: 0, custom: '', wpm: 300, chunk: 1, smart: true, ramp: true, guide: true, history: [] }

function Word({ text, orp }: { text: string; orp: boolean }) {
  if (!orp || !text) return <span>{text}</span>
  // for chunks, highlight the ORP of the middle word and align on it
  const ws = text.split(' ')
  const mid = Math.floor((ws.length - 1) / 2)
  const before = ws.slice(0, mid).join(' ') + (mid ? ' ' : '')
  const w = ws[mid]
  const k = orpIndex(w)
  const left = before + w.slice(0, k), pivot = w[k], right = w.slice(k + 1) + (ws.length > mid + 1 ? ' ' + ws.slice(mid + 1).join(' ') : '')
  return (
    <span style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', width: '100%' }}>
      <span style={{ textAlign: 'right', whiteSpace: 'pre' }}>{left}</span>
      <span style={{ color: '#ef4444' }}>{pivot}</span>
      <span style={{ textAlign: 'left', whiteSpace: 'pre' }}>{right}</span>
    </span>
  )
}

export default function SpeedReadingTrainer() {
  const [s, set, reset] = useToolState('speed-reading-trainer', DEF)
  const [pos, setPos] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [done, setDone] = useState(false)
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [graded, setGraded] = useState(false)
  const custom = s.src === -1
  const passage = custom ? null : PASSAGES[s.src] ?? PASSAGES[0]
  const text = custom ? s.custom : passage!.text
  const fs = useMemo(() => frames(text, s.wpm, s.chunk, s.smart), [text, s.wpm, s.chunk, s.smart])
  const nWords = words(text).length
  const frame = fs[Math.min(pos, fs.length - 1)]

  const finish = useCallback(() => {
    setPlaying(false)
    setDone(true)
    setAnswers([])
    setGraded(false)
    if (custom) set((st) => ({ ...st, history: [...st.history, { date: new Date().toISOString().slice(0, 10), title: 'Custom text', wpm: st.wpm, chunk: st.chunk, score: null, words: nWords }].slice(-60) }))
  }, [custom, nWords, set])

  useEffect(() => {
    if (!playing || !frame) return
    const ramp = s.ramp && pos < 10 ? 1 + (10 - pos) * 0.08 : 1
    const id = setTimeout(() => {
      if (pos + 1 >= fs.length) finish()
      else setPos(pos + 1)
    }, frame.delay * ramp)
    return () => clearTimeout(id)
  }, [playing, pos, frame, fs.length, s.ramp, finish])

  const start = () => {
    if (pos >= fs.length - 1 || done) setPos(0)
    setDone(false)
    setPlaying(true)
  }
  const restart = () => {
    setPos(0)
    setDone(false)
    setPlaying(false)
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('textarea,input,select')) return
      if (e.code === 'Space') {
        e.preventDefault()
        setPlaying((p) => !p)
      } else if (e.code === 'ArrowLeft') setPos((p) => prevSentence(fs, p))
      else if (e.code === 'ArrowUp') set((st) => ({ ...st, wpm: Math.min(1000, st.wpm + 25) }))
      else if (e.code === 'ArrowDown') set((st) => ({ ...st, wpm: Math.max(100, st.wpm - 25) }))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [fs, set])

  const grade = () => {
    if (!passage) return
    const score = passage.qs.filter((q, i) => answers[i] === q.ok).length / passage.qs.length
    setGraded(true)
    set((st) => ({ ...st, history: [...st.history, { date: new Date().toISOString().slice(0, 10), title: passage.title, wpm: st.wpm, chunk: st.chunk, score, words: nWords }].slice(-60) }))
  }
  const last = s.history[s.history.length - 1]
  const scored = s.history.filter((h) => h.score !== null)
  const best = scored.reduce((a, h) => Math.max(a, effectiveWpm(h.wpm, h.score!)), 0)
  const pick = (src: number) => {
    set({ src })
    restart()
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Text">
          <Seg value={String(s.src)} onChange={(v) => pick(+v)} options={[...PASSAGES.map((p, i) => [String(i), p.title] as [string, string]), ['-1', 'My text']]} />
          {custom && (
            <>
              <Area label="Paste text" value={s.custom} onChange={(c) => { set({ custom: c }); restart() }} rows={7} placeholder="Paste an article, chapter or notes…" />
              <FileDrop accept=".txt,.md,text/plain" onFiles={async ([f]) => { set({ custom: (await f.text()).slice(0, 200000) }); restart() }} label="…or drop a .txt / .md file" />
            </>
          )}
          <p className="muted" style={{ fontSize: 13 }}>{nWords} words · about {Math.ceil(remainingMs(fs) / 60000)} min at {s.wpm} wpm. Built-in passages have a short comprehension check.</p>
        </Panel>
        <Panel title="Settings">
          <Slider label="Speed" value={s.wpm} onChange={(wpm) => set({ wpm })} min={100} max={1000} step={25} unit=" wpm" show={(v) => String(v)} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '8px 0' }}>
            <span className="muted">Words per flash</span>
            <Seg value={String(s.chunk)} onChange={(v) => set({ chunk: +v })} options={[['1', '1'], ['2', '2'], ['3', '3']]} />
          </div>
          <Check label="Smart pauses (longer at punctuation and long words)" value={s.smart} onChange={(smart) => set({ smart })} />
          <Check label="Ease in over the first words" value={s.ramp} onChange={(ramp) => set({ ramp })} />
          <Check label="Highlight the recognition point (red letter)" value={s.guide} onChange={(guide) => set({ guide })} />
          <p className="muted" style={{ fontSize: 13 }}>Keys: Space play/pause · ← previous sentence · ↑/↓ speed ±25.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Speed" value={`${s.wpm} wpm`} sub={s.chunk > 1 ? `${s.chunk} words per flash` : 'single words'} />
          <Stat label="Progress" value={`${Math.round(((pos + (done ? 1 : 0)) / Math.max(1, fs.length)) * 100)}%`} sub={`${Math.ceil(remainingMs(fs, pos) / 1000)} s left`} />
          <Stat label="Best effective" value={best ? `${best} wpm` : '—'} sub="speed × comprehension" tone="good" />
        </Stats>
        <Panel title="Reader">
          <div style={{ position: 'relative', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--panel)', padding: '34px 12px', textAlign: 'center' }}>
            {s.guide && <div style={{ position: 'absolute', left: '50%', top: 8, bottom: 8, borderLeft: '2px solid var(--line)', opacity: 0.6 }} aria-hidden />}
            <div style={{ fontSize: 'clamp(26px, 5vw, 44px)', fontFamily: 'var(--mono)', minHeight: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }} aria-live="off">
              {done ? <span style={{ fontFamily: 'inherit', fontSize: 24 }}>✓ Finished</span> : <Word text={frame?.text ?? ''} orp={s.guide} />}
            </div>
          </div>
          <div style={{ margin: '10px 0' }}>
            <input type="range" min={0} max={Math.max(0, fs.length - 1)} value={Math.min(pos, fs.length - 1)} onChange={(e) => { setPos(+e.target.value); setDone(false) }} style={{ width: '100%' }} aria-label="Position" />
          </div>
          <Row>
            {playing ? <Btn onClick={() => setPlaying(false)}>⏸ Pause</Btn> : <Btn kind="primary" onClick={start} disabled={!fs.length}>▶ {pos > 0 && !done ? 'Resume' : 'Start'}</Btn>}
            <Btn onClick={() => setPos((p) => prevSentence(fs, p))}>⟲ Sentence</Btn>
            <Btn kind="ghost" onClick={restart}>↺ Restart</Btn>
          </Row>
          {!playing && pos > 0 && !done && (
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>…{fs.slice(Math.max(0, pos - 12), pos).map((f) => f.text).join(' ')} <b style={{ color: 'var(--fg)' }}>{frame?.text}</b></p>
          )}
        </Panel>
        {done && passage && (
          <Panel title="Comprehension check">
            {passage.qs.map((q, i) => (
              <div key={q.q} style={{ marginBottom: 10 }}>
                <b>{i + 1}. {q.q}</b>
                <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
                  {q.a.map((a, j) => {
                    const col = graded ? (j === q.ok ? 'var(--ok)' : answers[i] === j ? 'var(--err)' : undefined) : undefined
                    return (
                      <label key={a} className="k-check" style={{ color: col }}>
                        <input type="radio" name={`q${i}`} checked={answers[i] === j} disabled={graded} onChange={() => setAnswers((x) => { const n = [...x]; n[i] = j; return n })} /> {a}
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
            {!graded ? (
              <Btn kind="primary" onClick={grade} disabled={passage.qs.some((_, i) => answers[i] == null)}>Check answers</Btn>
            ) : last && last.score !== null && (
              <Note tone={last.score >= 0.67 ? 'ok' : 'warn'}>
                {Math.round(last.score * 100)}% correct at {last.wpm} wpm → effective <b>{effectiveWpm(last.wpm, last.score)} wpm</b>.{' '}
                {last.score === 1 ? 'Try 25–50 wpm faster next time.' : last.score >= 0.67 ? 'Good balance; hold this speed for a few sessions.' : 'Slow down a little: understanding matters more than speed.'}
              </Note>
            )}
          </Panel>
        )}
        <Panel title="Progress" actions={s.history.length > 0 && <Btn kind="ghost" onClick={() => set({ history: [] })}>Clear</Btn>}>
          {scored.length > 1 ? (
            <LineChart
              height={180}
              series={[
                { name: 'Speed (wpm)', points: scored.map((h, i) => [i + 1, h.wpm]) },
                { name: 'Effective wpm', points: scored.map((h, i) => [i + 1, effectiveWpm(h.wpm, h.score!)]) },
              ]}
              fx={(v) => `#${Math.round(v)}`}
              fy={(v) => String(Math.round(v))}
            />
          ) : <p className="muted">Finish a built-in passage and answer its questions to start tracking.</p>}
          {s.history.length > 0 && (
            <Table
              max={8}
              head={['Date', 'Text', 'WPM', 'Comprehension']}
              rows={[...s.history].reverse().map((h) => [h.date, h.title, h.wpm, h.score === null ? '—' : <span key="c" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', minWidth: 100 }}>{Math.round(h.score * 100)}% <Bar value={h.score} /></span>])}
            />
          )}
          <Btn kind="ghost" onClick={reset}>Reset settings</Btn>
        </Panel>
        <Panel title="About RSVP">
          <p style={{ fontSize: 14 }}>
            Rapid serial visual presentation flashes words in one spot so your eyes don’t have to jump along lines. The red letter marks the <b>optimal recognition point</b>,
            slightly left of a word’s centre, where the eye identifies it fastest; keeping it fixed removes re-aiming. RSVP removes the chance to glance back, so comprehension
            usually drops at high speeds: train in small steps and watch the effective rate, not just the raw wpm. Typical silent reading is 200–300 wpm.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
