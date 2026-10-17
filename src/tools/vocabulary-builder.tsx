import { useEffect, useMemo, useState } from 'react'
import { Area, BarChart, Btn, Check, CsvButton, Donut, JsonButtons, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, Txt, today, uid, useToolState } from '../kit'
import { parseCsv } from './lib/spaced-repetition-cards'
import { addDays, cloze, dueQueue, grade, level, makeQuestion, NEW, rng, type Level, type QType, type Question, type Word } from './lib/vocabulary-builder'

const RAW = `ubiquitous|adj|present, appearing or found everywhere|Smartphones have become ubiquitous in modern classrooms.
ephemeral|adj|lasting for a very short time|The beauty of the cherry blossoms is ephemeral, gone within a week.
meticulous|adj|showing great attention to detail; very careful|She kept meticulous notes of every experiment.
candid|adj|truthful and straightforward; frank|He gave a candid answer about the project's problems.
mitigate|verb|make something bad less severe or serious|Planting trees can mitigate the effects of urban heat.
pragmatic|adj|dealing with things sensibly and realistically|We need a pragmatic solution, not a perfect one.
scrutinize|verb|examine or inspect closely and thoroughly|Auditors will scrutinize every expense report.
resilient|adj|able to recover quickly from difficulties|Children are often more resilient than we expect.
ambiguous|adj|open to more than one interpretation|The contract's wording was ambiguous, so both sides claimed victory.
eloquent|adj|fluent or persuasive in speaking or writing|Her eloquent speech moved the whole audience.
alleviate|verb|make suffering or a problem less severe|A short walk can alleviate stress after a long meeting.
benevolent|adj|well meaning and kindly|A benevolent neighbour paid for the new playground.
cogent|adj|clear, logical and convincing|The lawyer presented a cogent argument for appeal.
diligent|adj|having or showing care and conscientiousness in one's work|Diligent practice is the secret behind most talent.
frugal|adj|sparing or economical with money or food|Living a frugal life helped them retire early.
galvanize|verb|shock or excite someone into taking action|The flood galvanized the town into building better defences.
hinder|verb|create difficulties resulting in delay or obstruction|Heavy snow hindered the rescue team's progress.
impeccable|adj|in accordance with the highest standards; faultless|The hotel's service was impeccable.
juxtapose|verb|place close together for contrasting effect|The exhibition juxtaposes ancient pottery with modern design.
lethargic|adj|sluggish and apathetic; lacking energy|The heat made everyone lethargic by mid-afternoon.
nuance|noun|a subtle difference in meaning, expression or sound|Translators must capture every nuance of the original.
obsolete|adj|no longer produced or used; out of date|Fax machines are nearly obsolete in most offices.
plausible|adj|seeming reasonable or probable|Her excuse sounded plausible, so the teacher accepted it.
serendipity|noun|the occurrence of events by chance in a happy way|By pure serendipity, they met their future business partner on a train.`

const seedWords = (): Word[] => RAW.split('\n').map((l, i) => {
  const [word, pos, def, example] = l.split('|')
  return { id: `w${i}`, word, pos, def, example, note: '', s: { ...NEW }, seen: 0, right: 0 }
})
interface List { id: string; name: string; lang: string; words: Word[] }
const DEF = {
  lists: [{ id: 'l1', name: 'Advanced English (sample)', lang: 'en-US', words: seedWords() }] as List[],
  cur: 'l1',
  types: ['def→word', 'cloze', 'word→def'] as QType[],
  history: {} as Record<string, [number, number]>,
  rate: 0.95,
  voice: '',
  session: 15,
}
const LEVEL_COLOR: Record<Level, string> = { new: '#94a3b8', learning: '#f59e0b', familiar: '#0ea5e9', mastered: '#10b981' }
const BLANK = { word: '', pos: 'noun', def: '', example: '' }

export default function VocabularyBuilder() {
  const [s, set, reset] = useToolState('vocabulary-builder', DEF)
  const [tab, setTab] = useState<'quiz' | 'cards' | 'list' | 'progress'>('quiz')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [q, setQ] = useState<Question | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [shownAt, setShownAt] = useState(0)
  const [sess, setSess] = useState({ n: 0, right: 0, seed: Date.now() % 100000 })
  const [flip, setFlip] = useState(false)
  const [cardIdx, setCardIdx] = useState(0)
  const [draft, setDraft] = useState(BLANK)
  const [csv, setCsv] = useState('')
  const [filter, setFilter] = useState('')
  const list = s.lists.find((l) => l.id === s.cur) ?? s.lists[0]
  const words = list.words
  const day = today()

  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const load = () => setVoices(speechSynthesis.getVoices())
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  const langVoices = voices.filter((v) => v.lang.slice(0, 2) === list.lang.slice(0, 2))
  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = list.lang
    u.rate = s.rate
    const v = voices.find((x) => x.name === s.voice)
    if (v) u.voice = v
    speechSynthesis.speak(u)
  }

  const setWords = (fn: (w: Word[]) => Word[]) => set((st) => ({ ...st, lists: st.lists.map((l) => (l.id === list.id ? { ...l, words: fn(l.words) } : l)) }))
  const queue = useMemo(() => dueQueue(words, day, s.session), [words, day, s.session])

  const nextQuestion = () => {
    const r = rng(sess.seed + sess.n * 7919)
    const target = queue[0]
    if (!target || !s.types.length) { setQ(null); return }
    const type = s.types[Math.floor(r() * s.types.length)]
    setQ(makeQuestion(words, target, type, r))
    setPicked(null)
    setShownAt(performance.now())
  }
  useEffect(() => {
    if (tab === 'quiz' && !q) nextQuestion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, queue.length])

  const answer = (i: number) => {
    if (!q || picked !== null) return
    setPicked(i)
    const ok = i === q.answer
    const fast = performance.now() - shownAt < 6000
    setWords((ws) => ws.map((w) => (w.id === q.wordId ? grade(w, ok, day, fast) : w)))
    set((st) => {
      const h = st.history[day] ?? [0, 0]
      return { ...st, history: { ...st.history, [day]: [h[0] + 1, h[1] + (ok ? 1 : 0)] } }
    })
    setSess((x) => ({ ...x, n: x.n + 1, right: x.right + (ok ? 1 : 0) }))
  }
  const qWord = q ? words.find((w) => w.id === q.wordId) : undefined

  const cards = words.filter((w) => !filter || w.word.toLowerCase().includes(filter.toLowerCase()))
  const card = cards[cardIdx % Math.max(1, cards.length)]
  const rateCard = (quality: 'again' | 'good' | 'easy') => {
    if (!card) return
    setWords((ws) => ws.map((w) => (w.id === card.id ? grade(w, quality !== 'again', day, quality === 'easy') : w)))
    setFlip(false)
    setCardIdx((i) => i + 1)
  }

  const counts = { new: 0, learning: 0, familiar: 0, mastered: 0 } as Record<Level, number>
  words.forEach((w) => counts[level(w)]++)
  const dueToday = words.filter((w) => w.seen && w.s.due <= day).length
  const totalSeen = words.reduce((a, w) => a + w.seen, 0)
  const totalRight = words.reduce((a, w) => a + w.right, 0)
  const days = Array.from({ length: 14 }, (_, i) => addDays(day, i - 13))
  let streak = 0
  for (let i = days.length - 1; i >= 0 && (s.history[days[i]]?.[0] ?? 0) > 0; i--) streak++

  const addWord = () => {
    if (!draft.word.trim() || !draft.def.trim()) return
    setWords((ws) => [...ws, { id: uid(), ...draft, word: draft.word.trim(), note: '', s: { ...NEW }, seen: 0, right: 0 }])
    setDraft(BLANK)
  }
  const importCsv = () => {
    const rows = parseCsv(csv).filter((r) => r[0]?.trim() && r[1]?.trim())
    const start = /^word$/i.test(rows[0]?.[0]?.trim() ?? '') ? 1 : 0
    setWords((ws) => [...ws, ...rows.slice(start).map((r) => ({ id: uid(), word: r[0].trim(), def: r[1].trim(), example: (r[2] ?? '').trim(), pos: (r[3] ?? '').trim() || 'noun', note: '', s: { ...NEW }, seen: 0, right: 0 }))])
    setCsv('')
  }

  return (
    <div>
      <Stats>
        <Stat label="Words in list" value={words.length} sub={list.name} />
        <Stat label="Due for review" value={dueToday} sub={`${counts.new} new words waiting`} tone={dueToday ? 'accent' : undefined} />
        <Stat label="Mastered" value={counts.mastered} sub={`${counts.familiar} familiar · ${counts.learning} learning`} tone="good" />
        <Stat label="Accuracy" value={totalSeen ? `${Math.round((totalRight / totalSeen) * 100)}%` : '—'} sub={`${streak}-day streak`} />
      </Stats>
      <Row>
        <Seg value={tab} onChange={setTab} options={[['quiz', '🎯 Quiz'], ['cards', '🃏 Flashcards'], ['list', '📋 Word list'], ['progress', '📈 Progress']]} label="Mode" />
        <Select label="List" value={list.id} onChange={(cur) => { set({ cur }); setQ(null) }} options={s.lists.map((l) => [l.id, `${l.name} (${l.words.length})`] as [string, string])} />
      </Row>

      {tab === 'quiz' && (
        <Split wide="left">
          <Panel title={q ? (q.type === 'cloze' ? 'Fill the gap' : q.type === 'def→word' ? 'Which word means…' : 'What does this word mean?') : 'Quiz'} actions={<span className="muted">session {sess.right}/{sess.n}</span>}>
            {!q ? (
              <Note tone="ok">{queue.length ? 'Pick at least one question type.' : 'Nothing due right now 🎉 Come back tomorrow, add words, or use Flashcards to browse.'}</Note>
            ) : (
              <>
                <p style={{ fontSize: q.type === 'word→def' ? 30 : 20, fontWeight: q.type === 'word→def' ? 800 : 500, margin: '8px 0 16px' }}>
                  {q.prompt}
                  {q.type === 'word→def' && <Btn kind="ghost" onClick={() => speak(q.prompt)} title="Listen">🔊</Btn>}
                </p>
                <div style={{ display: 'grid', gap: 8 }}>
                  {q.options.map((o, i) => {
                    const st = picked === null ? {} : i === q.answer ? { background: 'color-mix(in srgb, var(--ok) 18%, transparent)', borderColor: 'var(--ok)' } : i === picked ? { background: 'color-mix(in srgb, var(--err) 18%, transparent)', borderColor: 'var(--err)' } : { opacity: 0.6 }
                    return (
                      <button key={i} type="button" className="k-btn" onClick={() => answer(i)} style={{ textAlign: 'left', justifyContent: 'flex-start', padding: '12px 14px', whiteSpace: 'normal', ...st }}>
                        <b style={{ marginRight: 8 }}>{'ABCD'[i]}</b> {o}
                      </button>
                    )
                  })}
                </div>
                {picked !== null && qWord && (
                  <div style={{ marginTop: 14 }}>
                    <Note tone={picked === q.answer ? 'ok' : 'err'}>
                      {picked === q.answer ? 'Correct! ' : 'Not quite. '}<b>{qWord.word}</b> <i>({qWord.pos})</i>: {qWord.def}.
                      {qWord.example && <><br />“{qWord.example}”</>}
                    </Note>
                    <Row>
                      <Btn onClick={() => speak(`${qWord.word}. ${qWord.example}`)}>🔊 Hear it</Btn>
                      <Btn kind="primary" onClick={nextQuestion}>Next →</Btn>
                    </Row>
                    <p className="muted" style={{ fontSize: 12 }}>Next review: {words.find((w) => w.id === qWord.id)?.s.due}</p>
                  </div>
                )}
              </>
            )}
          </Panel>
          <Panel title="Quiz settings">
            {(['def→word', 'cloze', 'word→def'] as QType[]).map((t) => (
              <Check key={t} label={t === 'def→word' ? 'Definition → word' : t === 'cloze' ? 'Fill the gap in a sentence' : 'Word → definition'} value={s.types.includes(t)} onChange={(on) => set({ types: on ? [...s.types, t] : s.types.filter((x) => x !== t) })} />
            ))}
            <Slider label="Words per session" value={s.session} min={5} max={50} step={5} onChange={(session) => set({ session })} />
            <p className="muted" style={{ fontSize: 12 }}>Words come back on a spaced-repetition schedule (SM-2): right answers push the next review further out (1 → 6 → ~15 days…), mistakes bring the word back tomorrow. In queue now: {queue.length}.</p>
          </Panel>
        </Split>
      )}

      {tab === 'cards' && (
        <Split wide="left">
          <Panel title={`Card ${cards.length ? (cardIdx % cards.length) + 1 : 0} / ${cards.length}`} actions={<Txt label="" value={filter} onChange={(v) => { setFilter(v); setCardIdx(0) }} placeholder="Filter…" />}>
            {card ? (
              <>
                <div onClick={() => setFlip((f) => !f)} role="button" tabIndex={0} onKeyDown={(e) => e.key === ' ' && setFlip((f) => !f)} style={{ minHeight: 220, border: '1px solid var(--line)', borderRadius: 12, padding: 24, cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', background: 'var(--panel)' }}>
                  <div style={{ fontSize: 34, fontWeight: 800 }}>{card.word}</div>
                  <div className="muted">{card.pos} · <span style={{ color: LEVEL_COLOR[level(card)] }}>{level(card)}</span></div>
                  {flip ? (
                    <>
                      <p style={{ fontSize: 18, margin: '14px 0 6px' }}>{card.def}</p>
                      {card.example && <p className="muted"><i>“{card.example}”</i></p>}
                    </>
                  ) : card.example ? <p className="muted" style={{ marginTop: 14 }}>{cloze(card.example, card.word) ?? 'Tap to reveal'}<br /><small>tap to reveal</small></p> : <p className="muted">tap to reveal</p>}
                </div>
                <Row>
                  <Btn onClick={() => speak(card.word)}>🔊 Word</Btn>
                  {card.example && <Btn onClick={() => speak(card.example)}>🔊 Sentence</Btn>}
                  <span style={{ flex: 1 }} />
                  <Btn kind="danger" onClick={() => rateCard('again')}>Again</Btn>
                  <Btn onClick={() => rateCard('good')}>Good</Btn>
                  <Btn kind="primary" onClick={() => rateCard('easy')}>Easy</Btn>
                </Row>
              </>
            ) : <Note>No cards match.</Note>}
          </Panel>
          <Panel title="Voice">
            {voices.length ? (
              <Select label="Voice" value={s.voice} onChange={(voice) => set({ voice })} options={[['', 'Default for language'], ...langVoices.map((v) => [v.name, `${v.name} (${v.lang})`] as [string, string])]} />
            ) : <Note tone="warn">Speech synthesis voices are not available in this browser.</Note>}
            <Slider label="Speed" value={s.rate} min={0.5} max={1.5} step={0.05} onChange={(rate) => set({ rate })} show={(v) => `${v.toFixed(2)}×`} />
            <Txt label="List language (BCP-47)" value={list.lang} onChange={(lang) => set((st) => ({ ...st, lists: st.lists.map((l) => (l.id === list.id ? { ...l, lang } : l)) }))} placeholder="en-US, es-ES, de-DE…" />
          </Panel>
        </Split>
      )}

      {tab === 'list' && (
        <Split wide="left">
          <Panel title={list.name} actions={<><CsvButton name={`${list.name}.csv`} rows={() => [['word', 'definition', 'example', 'pos', 'level', 'next review'], ...words.map((w) => [w.word, w.def, w.example, w.pos, level(w), w.s.due])]} /><JsonButtons name="vocabulary.json" data={s} onLoad={(d) => d && Array.isArray(d.lists) && set(d)} /></>}>
            <Table
              head={['Word', 'Definition', 'Level', '']}
              rows={words.map((w) => [
                <span key="w"><b>{w.word}</b> <span className="muted">{w.pos}</span> <Btn kind="ghost" onClick={() => speak(w.word)} title="Listen">🔊</Btn></span>,
                <span key="d" style={{ fontSize: 13 }}>{w.def}{w.example && <><br /><i className="muted">{w.example}</i></>}</span>,
                <b key="l" style={{ color: LEVEL_COLOR[level(w)] }}>{level(w)}</b>,
                <Btn key="x" kind="ghost" onClick={() => setWords((ws) => ws.filter((x) => x.id !== w.id))} title="Delete">✕</Btn>,
              ])}
            />
          </Panel>
          <div>
            <Panel title="Add a word">
              <Row>
                <Txt label="Word" value={draft.word} onChange={(word) => setDraft({ ...draft, word })} />
                <Select label="Part of speech" value={draft.pos} onChange={(pos) => setDraft({ ...draft, pos })} options={['noun', 'verb', 'adj', 'adv', 'phrase']} />
              </Row>
              <Txt label="Definition" value={draft.def} onChange={(def) => setDraft({ ...draft, def })} />
              <Txt label="Example sentence (used for fill-the-gap)" value={draft.example} onChange={(example) => setDraft({ ...draft, example })} />
              {draft.word && draft.example && !cloze(draft.example, draft.word) && <Note tone="warn">The example doesn’t contain “{draft.word}”, so it can’t be used for gap questions.</Note>}
              <Btn kind="primary" onClick={addWord} disabled={!draft.word.trim() || !draft.def.trim()}>+ Add word</Btn>
            </Panel>
            <Panel title="Import CSV">
              <Area value={csv} onChange={setCsv} rows={4} mono placeholder={'word,definition,example,pos\nterse,"brief, to the point",His reply was terse.,adj'} />
              <Btn onClick={importCsv} disabled={!csv.trim()}>Import rows</Btn>
            </Panel>
            <Panel title="Lists" actions={<Btn kind="ghost" onClick={() => { reset(); setQ(null) }}>Reset all</Btn>}>
              <Txt label="Rename list" value={list.name} onChange={(name) => set((st) => ({ ...st, lists: st.lists.map((l) => (l.id === list.id ? { ...l, name } : l)) }))} />
              <Row>
                <Btn onClick={() => { const id = uid(); set((st) => ({ ...st, lists: [...st.lists, { id, name: 'New list', lang: 'en-US', words: [] }], cur: id })) }}>+ New list</Btn>
                <Btn kind="danger" disabled={s.lists.length < 2} onClick={() => set((st) => ({ ...st, lists: st.lists.filter((l) => l.id !== list.id), cur: st.lists.find((l) => l.id !== list.id)!.id }))}>Delete list</Btn>
              </Row>
            </Panel>
          </div>
        </Split>
      )}

      {tab === 'progress' && (
        <Split>
          <Panel title="Mastery">
            <Donut slices={(Object.keys(counts) as Level[]).map((k) => ({ label: k, value: counts[k], color: LEVEL_COLOR[k] }))} center={<span>{words.length}<br /><small>words</small></span>} />
          </Panel>
          <Panel title="Reviews, last 14 days">
            <BarChart bars={days.map((d) => ({ label: d.slice(5), value: [s.history[d]?.[1] ?? 0, (s.history[d]?.[0] ?? 0) - (s.history[d]?.[1] ?? 0)] }))} stacks={[{ name: 'Right', color: '#10b981' }, { name: 'Wrong', color: '#ef4444' }]} />
            <Table head={['Hardest words', 'Seen', 'Right']} rows={[...words].filter((w) => w.seen).sort((a, b) => a.right / a.seen - b.right / b.seen).slice(0, 5).map((w) => [w.word, w.seen, `${Math.round((w.right / w.seen) * 100)}%`])} />
          </Panel>
        </Split>
      )}
    </div>
  )
}
