import { useEffect, useState } from 'react'
import { Area, BarChart, Btn, CsvButton, Donut, FileDrop, JsonButtons, Note, Num, Panel, pct, Row, Seg, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { addDays, md, parseCsv, sm2 } from './lib/spaced-repetition-cards'

interface Card { id: string; front: string; back: string; ef: number; reps: number; interval: number; due: string; lapses: number }
interface Deck { id: string; name: string; cards: Card[] }
interface State { decks: Deck[]; active: string; newPerDay: number; log: { d: string; q: number; deck: string }[] }

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const T0 = today()
const mk = (front: string, back: string, ago = -1, interval = 0, reps = 0): Card => ({
  id: uid(), front, back, ef: 2.5, reps, interval, lapses: 0, due: ago < 0 ? '' : addDays(T0, interval - ago),
})

const DEF: State = {
  active: 'math',
  newPerDay: 10,
  // a fortnight of sample review history so the statistics are not empty on first visit
  log: Array.from({ length: 13 }, (_, i) => i).flatMap((i) =>
    Array.from({ length: (i * 7) % 9 + 3 }, (_, k) => ({ d: addDays(T0, i - 13), q: (i + k) % 6 === 0 ? 1 : (k % 3) + 3, deck: k % 2 ? 'caps' : 'math' })),
  ),
  decks: [
    {
      id: 'math', name: 'Math & physics',
      cards: [
        mk('Quadratic formula: roots of $ax^2+bx+c=0$', '$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$', 6, 6, 2),
        mk('Euler’s identity', '$e^{i\\pi} + 1 = 0$\n\nLinks *five* fundamental constants.', 1, 1, 1),
        mk('Kinetic energy', '$E_k = \\frac{1}{2}mv^2$', 0, 1, 1),
        mk('Derivative of $\\sin x$', '$\\cos x$'),
        mk('Area of a circle', '$A = \\pi r^2$'),
        mk('Pythagorean theorem', '$a^2 + b^2 = c^2$ for a right triangle with hypotenuse $c$'),
        mk('Ideal gas law', '$pV = nRT$\n\n- $R \\approx 8.314$ J/(mol·K)'),
        mk('Sum of $1 + 2 + … + n$', '$\\frac{n(n+1)}{2}$'),
        mk('Newton’s second law', '$F = ma$ (force = mass × acceleration)'),
        mk('Speed of light in vacuum', '$c \\approx 299\\,792\\,458$ m/s'),
      ],
    },
    {
      id: 'caps', name: 'World capitals',
      cards: [
        ['Australia', 'Canberra'], ['Canada', 'Ottawa'], ['Brazil', 'Brasília'], ['Turkey', 'Ankara'], ['Switzerland', 'Bern'],
        ['New Zealand', 'Wellington'], ['Morocco', 'Rabat'], ['Vietnam', 'Hanoi'], ['Kazakhstan', 'Astana'], ['Nigeria', 'Abuja'],
      ].map(([c, k], i) => mk(`Capital of **${c}**?`, k, i < 4 ? i : -1, i < 4 ? 6 : 0, i < 4 ? 2 : 0)),
    },
    {
      id: 'es', name: 'Spanish basics',
      cards: [['the house', 'la casa'], ['to eat', 'comer'], ['thank you', 'gracias'], ['tomorrow', 'mañana'], ['the book', 'el libro'], ['to want', 'querer'], ['always', 'siempre'], ['the city', 'la ciudad']]
        .map(([en, es]) => mk(`*${en}*`, `**${es}**`)),
    },
  ],
}

const CSS = `
.srs-card{border:1px solid var(--line);border-radius:14px;padding:22px;min-height:150px;font-size:20px;line-height:1.5;background:var(--panel)}
.srs-card p{margin:.3em 0}.srs-card ul,.srs-card ol{margin:.3em 0;padding-left:1.3em;text-align:left}
.srs-card code,.srs-md code{font-family:var(--mono);font-size:.9em;background:color-mix(in srgb,var(--accent) 10%,transparent);padding:1px 5px;border-radius:5px}
.srs-md p{margin:0}.srs-md{font-size:14px}
.tx{font-family:'Cambria Math','STIX Two Math','Times New Roman',serif;white-space:nowrap}
.tx sup,.tx sub{font-size:.7em}.tx-up{font-style:normal}
.tx-frac{display:inline-flex;flex-direction:column;vertical-align:middle;text-align:center;font-size:.9em;margin:0 2px}
.tx-frac>span:first-child{border-bottom:1px solid currentColor;padding:0 3px}
.tx-sqrt{border-top:1px solid currentColor;padding:0 2px}
.tx-block{text-align:center;font-size:1.15em;margin:.4em 0}
`

const BTN = [
  { q: 1, label: 'Again', kind: 'danger' as const },
  { q: 3, label: 'Hard', kind: 'normal' as const },
  { q: 4, label: 'Good', kind: 'primary' as const },
  { q: 5, label: 'Easy', kind: 'normal' as const },
]
const ivl = (d: number) => (d < 1 ? '<1d' : d < 30 ? `${d}d` : d < 365 ? `${(d / 30).toFixed(1)}mo` : `${(d / 365).toFixed(1)}y`)
const Md = ({ src, className = 'srs-md' }: { src: string; className?: string }) => <div className={className} dangerouslySetInnerHTML={{ __html: md(src) }} />

export default function SpacedRepetitionCards() {
  const [s, set, reset] = useToolState('spaced-repetition-cards', DEF)
  const [view, setView] = useState<'study' | 'cards' | 'import' | 'stats'>('study')
  const [flipped, setFlipped] = useState(false)
  const [again, setAgain] = useState<string[]>([])
  const [draft, setDraft] = useState({ front: '', back: '' })
  const [editing, setEditing] = useState<string | null>(null)
  const [csv, setCsv] = useState('front,back\n"What is $\\sqrt{144}$?",12\nLargest planet,**Jupiter**')
  const [filter, setFilter] = useState('')
  const T = today()
  const deck = s.decks.find((d) => d.id === s.active) ?? s.decks[0]
  const newToday = s.log.filter((l) => l.d === T && l.deck === deck?.id && l.q === -1).length

  const dueCards = deck ? deck.cards.filter((c) => c.due && c.due <= T).sort((a, b) => a.due.localeCompare(b.due)) : []
  const newCards = deck ? deck.cards.filter((c) => !c.due).slice(0, Math.max(0, s.newPerDay - newToday)) : []
  const relearn = deck ? again.map((id) => deck.cards.find((c) => c.id === id)).filter((c): c is Card => !!c) : []
  const queue = [...dueCards.filter((c) => !again.includes(c.id)), ...newCards.filter((c) => !again.includes(c.id)), ...relearn]
  const card = queue[0]

  const updateDeck = (f: (d: Deck) => Deck) => set((st) => ({ ...st, decks: st.decks.map((d) => (d.id === deck.id ? f(d) : d)) }))

  const answer = (q: number) => {
    if (!card) return
    const wasNew = !card.due
    const inRelearn = again.includes(card.id)
    if (inRelearn) {
      // re-drill of a failed card: only leave the session queue once it is recalled
      if (q >= 3) setAgain((a) => a.filter((x) => x !== card.id))
      else setAgain((a) => [...a.filter((x) => x !== card.id), card.id])
    } else {
      const next = sm2(card, q, T)
      updateDeck((d) => ({ ...d, cards: d.cards.map((c) => (c.id === card.id ? { ...c, ...next } : c)) }))
      if (q < 3) setAgain((a) => [...a, card.id])
      set((st) => ({ ...st, log: [...st.log, ...(wasNew ? [{ d: T, q: -1, deck: deck.id }] : []), { d: T, q, deck: deck.id }].slice(-5000) }))
    }
    setFlipped(false)
  }

  useEffect(() => {
    if (view !== 'study') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(true) }
      else if (flipped && ['1', '2', '3', '4'].includes(e.key)) answer(BTN[Number(e.key) - 1].q)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const addCard = () => {
    if (!draft.front.trim() || !draft.back.trim()) return
    if (editing) updateDeck((d) => ({ ...d, cards: d.cards.map((c) => (c.id === editing ? { ...c, ...draft } : c)) }))
    else updateDeck((d) => ({ ...d, cards: [...d.cards, mk(draft.front, draft.back)] }))
    setDraft({ front: '', back: '' })
    setEditing(null)
  }

  const rows = parseCsv(csv)
  const importRows = rows.filter((r, i) => !(i === 0 && /^front$/i.test(r[0]?.trim() ?? '')) && r[0]?.trim() && r[1]?.trim())

  // statistics
  const all = deck?.cards ?? []
  const nNew = all.filter((c) => !c.due).length
  const nMature = all.filter((c) => c.due && c.interval >= 21).length
  const nYoung = all.length - nNew - nMature
  const recent = s.log.filter((l) => l.deck === deck?.id && l.q >= 0 && l.d >= addDays(T, -29))
  const retention = recent.length ? recent.filter((l) => l.q >= 3).length / recent.length : NaN
  const forecast = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(T, i)
    return { label: i === 0 ? 'Today' : d.slice(5), value: all.filter((c) => c.due && (i === 0 ? c.due <= d : c.due === d)).length }
  })
  const history = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(T, i - 13)
    const day = s.log.filter((l) => l.deck === deck?.id && l.d === d && l.q >= 0)
    return { label: d.slice(5), value: [day.filter((l) => l.q >= 3).length, day.filter((l) => l.q < 3).length] }
  })

  return (
    <>
      <style>{CSS}</style>
      <Split>
        <div>
          <Panel title="Decks" actions={<Btn onClick={() => { const id = uid(); set({ decks: [...s.decks, { id, name: 'New deck', cards: [] }], active: id }); setView('cards') }}>+ Deck</Btn>}>
            {s.decks.map((d) => {
              const due = d.cards.filter((c) => c.due && c.due <= T).length
              const nw = d.cards.filter((c) => !c.due).length
              return (
                <button key={d.id} type="button" className={`k-btn ${d.id === deck?.id ? 'primary' : ''}`} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', marginBottom: 6 }} onClick={() => { set({ active: d.id }); setAgain([]); setFlipped(false) }}>
                  <span>{d.name}</span>
                  <span style={{ opacity: 0.85, fontWeight: 500 }}>{due} due · {nw} new</span>
                </button>
              )
            })}
            {deck && <Txt label="Deck name" value={deck.name} onChange={(name) => updateDeck((d) => ({ ...d, name }))} />}
            <Row>
              <Btn kind="danger" disabled={s.decks.length < 2} onClick={() => { if (confirm(`Delete deck “${deck.name}”?`)) set({ decks: s.decks.filter((d) => d.id !== deck.id), active: s.decks.find((d) => d.id !== deck.id)!.id }) }}>Delete deck</Btn>
            </Row>
          </Panel>
          <Panel title="Settings & backup">
            <Num label="New cards per day" value={s.newPerDay} onChange={(newPerDay) => set({ newPerDay: Math.max(0, Math.round(newPerDay)) })} min={0} max={500} />
            <Row>
              <JsonButtons name="flashcards.json" data={s} onLoad={(d) => d && Array.isArray(d.decks) && set({ ...DEF, ...d })} />
              <Btn kind="ghost" onClick={() => confirm('Reset all decks to the samples?') && reset()}>Reset</Btn>
            </Row>
          </Panel>
          <div className="k-note info" style={{ display: 'block' }}>Scheduling uses SuperMemo-2: each answer adjusts the card’s ease factor and the next interval grows 1 → 6 → interval × ease days. Cards are saved in this browser — use Backup to keep a copy.</div>
        </div>
        <div>
          <Stats>
            <Stat label="Due today" value={dueCards.length} tone="accent" />
            <Stat label="New available" value={newCards.length} sub={`${nNew} new in deck`} />
            <Stat label="Cards" value={all.length} sub={`${nMature} mature`} />
            <Stat label="Retention (30 d)" value={Number.isFinite(retention) ? pct(retention, 0) : '—'} sub={`${recent.length} reviews`} />
          </Stats>
          <Panel title={deck?.name ?? 'Deck'} actions={<Seg value={view} onChange={setView} options={[['study', 'Study'], ['cards', 'Cards'], ['import', 'Import'], ['stats', 'Stats']]} />}>
            {view === 'study' && (card ? (
              <div>
                <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
                  {queue.length} left in session · {!card.due ? 'new card' : again.includes(card.id) ? 'relearning' : `interval ${ivl(card.interval)}, ease ${card.ef.toFixed(2)}`}
                </p>
                <div className="srs-card" onClick={() => setFlipped(true)} style={{ cursor: flipped ? 'default' : 'pointer', textAlign: 'center' }}>
                  <Md src={card.front} className="" />
                  {flipped && (
                    <>
                      <hr style={{ border: 0, borderTop: '1px dashed var(--line)', margin: '16px 0' }} />
                      <Md src={card.back} className="" />
                    </>
                  )}
                </div>
                <div style={{ marginTop: 12 }}>
                  {!flipped ? (
                    <Btn kind="primary" onClick={() => setFlipped(true)}>Show answer (Space)</Btn>
                  ) : (
                    <Row>
                      {BTN.map((b, i) => (
                        <Btn key={b.q} kind={b.kind} onClick={() => answer(b.q)} title={`Key ${i + 1}`}>
                          {b.label} <span style={{ opacity: 0.75, fontWeight: 500 }}>· {again.includes(card.id) ? (b.q < 3 ? 'again' : 'done') : ivl(sm2(card, b.q, T).interval)}</span>
                        </Btn>
                      ))}
                    </Row>
                  )}
                </div>
              </div>
            ) : (
              <Note tone="ok"><span>🎉 All done for today in this deck. Next review: {all.filter((c) => c.due > T).map((c) => c.due).sort()[0] ?? 'add cards to start'}.</span></Note>
            ))}

            {view === 'cards' && (
              <>
                <Row>
                  <div style={{ flex: 1, minWidth: 220 }}><Area label="Front (Markdown, $math$)" value={draft.front} onChange={(front) => setDraft({ ...draft, front })} rows={3} /></div>
                  <div style={{ flex: 1, minWidth: 220 }}><Area label="Back" value={draft.back} onChange={(back) => setDraft({ ...draft, back })} rows={3} /></div>
                </Row>
                {(draft.front || draft.back) && (
                  <div className="srs-card" style={{ fontSize: 16, minHeight: 0, padding: 12, marginBottom: 8 }}><Md src={draft.front} className="" /><hr style={{ border: 0, borderTop: '1px dashed var(--line)' }} /><Md src={draft.back} className="" /></div>
                )}
                <Row>
                  <Btn kind="primary" onClick={addCard} disabled={!draft.front.trim() || !draft.back.trim()}>{editing ? 'Save card' : '+ Add card'}</Btn>
                  {editing && <Btn kind="ghost" onClick={() => { setEditing(null); setDraft({ front: '', back: '' }) }}>Cancel</Btn>}
                  <CsvButton name={`${deck.name}.csv`} rows={() => [['front', 'back', 'due', 'interval', 'ease'], ...all.map((c) => [c.front, c.back, c.due, c.interval, +c.ef.toFixed(2)])]} />
                </Row>
                <Txt label="Search" value={filter} onChange={setFilter} placeholder="Filter cards…" />
                <Table
                  max={50}
                  head={['Front', 'Back', 'Due', 'Interval', '']}
                  rows={all.filter((c) => !filter || (c.front + c.back).toLowerCase().includes(filter.toLowerCase())).map((c) => [
                    <Md key="f" src={c.front} />,
                    <Md key="b" src={c.back} />,
                    c.due || <span key="n" className="muted">new</span>,
                    c.due ? ivl(c.interval) : '—',
                    <Row key="a" wrap={false}>
                      <Btn kind="ghost" onClick={() => { setEditing(c.id); setDraft({ front: c.front, back: c.back }) }} title="Edit">✎</Btn>
                      <Btn kind="ghost" onClick={() => updateDeck((d) => ({ ...d, cards: d.cards.filter((x) => x.id !== c.id) }))} title="Delete">✕</Btn>
                    </Row>,
                  ])}
                />
              </>
            )}

            {view === 'import' && (
              <>
                <FileDrop accept=".csv,.tsv,.txt" onFiles={async (f) => setCsv(await f[0].text())} label="Drop a CSV / TSV file (front, back)" />
                <Area label="…or paste rows: front,back (comma, semicolon or tab separated)" value={csv} onChange={setCsv} rows={7} mono />
                <p className="muted">{importRows.length} card(s) ready to import into “{deck.name}”. Quoted fields may contain commas and line breaks.</p>
                <Btn kind="primary" disabled={!importRows.length} onClick={() => { updateDeck((d) => ({ ...d, cards: [...d.cards, ...importRows.map((r) => mk(r[0].trim(), r[1].trim()))] })); setCsv(''); setView('cards') }}>Import {importRows.length} cards</Btn>
              </>
            )}

            {view === 'stats' && (
              <>
                <h4 style={{ margin: '4px 0' }}>Due forecast — next 14 days</h4>
                <BarChart bars={forecast} height={200} fy={(v) => (Number.isInteger(v) ? String(v) : '')} />
                <h4 style={{ margin: '12px 0 4px' }}>Reviews — last 14 days</h4>
                <BarChart bars={history} height={200} fy={(v) => (Number.isInteger(v) ? String(v) : '')} stacks={[{ name: 'Recalled', color: 'var(--ok)' }, { name: 'Forgot', color: 'var(--err)' }]} />
                <h4 style={{ margin: '12px 0 4px' }}>Card maturity</h4>
                <Donut size={180} slices={[{ label: 'New', value: nNew, color: '#94a3b8' }, { label: 'Young (<21 d)', value: nYoung, color: '#f59e0b' }, { label: 'Mature (≥21 d)', value: nMature, color: '#10b981' }]} fv={(v) => String(v)} center={<b>{all.length}</b>} />
              </>
            )}
          </Panel>
        </div>
      </Split>
    </>
  )
}
