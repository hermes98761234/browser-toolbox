import { useEffect, useState } from 'react'
import { Bar, Btn, Check, CsvButton, JsonButtons, Note, Num, num, Panel, Ring, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { addDays, badges, coverUrl, dailyMinutes, finishEstimate, pagesPerHour, streaks, type Book, type Session, type Status } from './lib/reading-log'

const localToday = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
const T0 = localToday()
const nowMs = () => Date.now()

function sample(): { books: Book[]; sessions: Session[] } {
  const bk = (id: string, title: string, author: string, pages: number, page: number, status: Status, genre: string, started: string, finished = '', rating = 0, isbn = ''): Book => ({ id, title, author, pages, page, status, genre, started, finished, rating, isbn, cover: '' })
  const books = [
    bk('b1', 'Frankenstein', 'Mary Shelley', 280, 280, 'finished', 'Gothic', addDays(T0, -44), addDays(T0, -30), 5),
    bk('b2', 'The Time Machine', 'H. G. Wells', 118, 118, 'finished', 'Science fiction', addDays(T0, -29), addDays(T0, -22), 4),
    bk('b3', 'Walden', 'Henry David Thoreau', 352, 146, 'reading', 'Essays', addDays(T0, -21)),
    bk('b4', 'Moby-Dick', 'Herman Melville', 635, 212, 'reading', 'Adventure', addDays(T0, -12)),
    bk('b5', 'Pride and Prejudice', 'Jane Austen', 432, 0, 'want', 'Classic romance', ''),
    bk('b6', 'Meditations', 'Marcus Aurelius', 254, 0, 'want', 'Philosophy', ''),
  ]
  let seed = 11
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const sessions: Session[] = []
  for (let d = -44; d <= -1; d++) {
    if (d === -26 || d === -17 || r() < 0.08) continue
    const date = addDays(T0, d)
    const book = d < -30 ? 'b1' : d < -22 ? 'b2' : d < -12 || r() < 0.4 ? 'b3' : 'b4'
    const minutes = Math.round(15 + r() * 40)
    sessions.push({ id: uid(), book, date, minutes, pages: Math.round((minutes * (book === 'b4' ? 0.55 : 0.7)) * (0.85 + r() * 0.3)) })
  }
  return { books, sessions }
}
const SAMPLE = sample()

const DEF = {
  books: SAMPLE.books,
  sessions: SAMPLE.sessions,
  goal: 20,
  yearGoal: 24,
  allowCovers: false,
  timerBook: 'b4',
  timerStart: 0,
  timerAcc: 0,
  draft: { title: '', author: '', pages: 300, genre: '', isbn: '', status: 'reading' as Status },
}
const STATUS: [Status, string][] = [['reading', 'Reading'], ['want', 'Want to read'], ['finished', 'Finished'], ['abandoned', 'Abandoned']]

function Cover({ b, h = 72 }: { b: Book; h?: number }) {
  let hash = 0
  for (const c of b.title) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  if (b.cover) return <img src={b.cover} alt={b.title} style={{ height: h, width: h * 0.66, objectFit: 'cover', borderRadius: 4, flex: '0 0 auto', boxShadow: '0 1px 4px rgba(0,0,0,.25)' }} />
  return (
    <div style={{ height: h, width: h * 0.66, borderRadius: 4, flex: '0 0 auto', background: `linear-gradient(160deg, hsl(${hash % 360} 55% 45%), hsl(${(hash + 50) % 360} 60% 28%))`, color: '#fff', fontSize: Math.max(8, h / 9), fontWeight: 700, padding: 4, overflow: 'hidden', lineHeight: 1.1, wordBreak: 'break-word', hyphens: 'auto', boxShadow: '0 1px 4px rgba(0,0,0,.25)' }}>
      {b.title}
    </div>
  )
}

function Heatmap({ mins, goal, today }: { mins: Map<string, number>; goal: number; today: string }) {
  const weeks = 26
  const end = new Date(today + 'T00:00:00Z')
  const lastCol = end.getUTCDay() // 0 = Sunday row
  const start = addDays(today, -(weeks - 1) * 7 - lastCol)
  const cells = []
  for (let w = 0; w < weeks; w++)
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d)
      if (date > today) continue
      const v = mins.get(date) ?? 0
      const level = v <= 0 ? 0 : v < goal / 2 ? 1 : v < goal ? 2 : v < goal * 2 ? 3 : 4
      cells.push(<rect key={date} x={w * 14} y={d * 14} width={12} height={12} rx={2} fill={level ? `color-mix(in srgb, #16a34a ${[0, 30, 55, 80, 100][level]}%, var(--panel))` : 'var(--line)'}><title>{`${date}: ${v} min`}</title></rect>)
    }
  return <svg viewBox={`0 0 ${weeks * 14} ${7 * 14}`} width="100%" style={{ maxWidth: 560 }} role="img" aria-label="Reading minutes per day">{cells}</svg>
}

export default function ReadingLog() {
  const [s, set, reset] = useToolState('reading-log', DEF)
  const [today] = useState(localToday)
  const [tick, setTick] = useState(0)
  const [endPage, setEndPage] = useState<number | null>(null)
  const [manual, setManual] = useState({ date: today, minutes: 30, pages: 20 })
  const [msg, setMsg] = useState('')
  const running = s.timerStart > 0
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])
  const elapsed = s.timerAcc + (running && tick ? Math.max(0, tick - s.timerStart) : 0)
  const reading = s.books.filter((b) => b.status === 'reading')
  const tb = s.books.find((b) => b.id === s.timerBook) ?? reading[0]
  const mins = dailyMinutes(s.sessions)
  const st = streaks(s.sessions, s.goal, today)
  const year = today.slice(0, 4)
  const finYear = s.books.filter((b) => b.status === 'finished' && b.finished.startsWith(year)).length
  const week = s.sessions.filter((x) => x.date > addDays(today, -7)).reduce((a, x) => a + x.minutes, 0)
  const pph = pagesPerHour(s.sessions)
  const editBook = (id: string, p: Partial<Book>) => set((x) => ({ ...x, books: x.books.map((b) => (b.id === id ? { ...b, ...p } : b)) }))
  const bdg = badges(s.books, s.sessions, s.goal, today)

  const logSession = (book: Book, minutes: number, pages: number, date = today) => {
    if (minutes <= 0) return
    set((x) => ({
      ...x,
      sessions: [...x.sessions, { id: uid(), book: book.id, date, minutes: Math.round(minutes), pages: Math.max(0, Math.round(pages)) }],
      books: x.books.map((b) => {
        if (b.id !== book.id) return b
        const page = Math.min(b.pages, b.page + Math.max(0, Math.round(pages)))
        return { ...b, page, started: b.started || date, ...(page >= b.pages ? { status: 'finished' as Status, finished: date } : {}) }
      }),
    }))
  }
  const stopTimer = () => {
    if (!tb) return
    const total = s.timerAcc + (running ? nowMs() - s.timerStart : 0)
    const minutes = total / 60000
    set({ timerStart: 0, timerAcc: 0 })
    logSession(tb, Math.max(1, minutes), endPage !== null ? endPage - tb.page : 0)
    setEndPage(null)
    setMsg(`Logged ${Math.max(1, Math.round(minutes))} min of “${tb.title}”.`)
  }
  const findCover = async (b: Book) => {
    if (!s.allowCovers) return
    setMsg(`Looking up “${b.title}” on Open Library…`)
    try {
      let url = ''
      if (b.isbn) url = coverUrl({ isbn: b.isbn })
      else {
        const q = `https://openlibrary.org/search.json?title=${encodeURIComponent(b.title)}&author=${encodeURIComponent(b.author)}&limit=1&fields=cover_i,number_of_pages_median`
        const j = (await (await fetch(q)).json()) as { docs?: { cover_i?: number; number_of_pages_median?: number }[] }
        const d = j.docs?.[0]
        if (d?.cover_i) url = coverUrl({ coverId: d.cover_i })
      }
      if (url) {
        editBook(b.id, { cover: url })
        setMsg('')
      } else setMsg(`No cover found for “${b.title}”.`)
    } catch {
      setMsg('Open Library could not be reached (offline?). Covers stay as generated placeholders.')
    }
  }
  const mmss = (ms: number) => `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
  const d = s.draft

  return (
    <Split wide="right">
      <div>
        <Panel title="Reading timer">
          {reading.length ? (
            <>
              <Select label="Book" value={tb?.id ?? ''} onChange={(timerBook) => set({ timerBook })} options={reading.map((b) => [b.id, b.title] as [string, string])} />
              <div style={{ fontSize: 44, fontWeight: 800, textAlign: 'center', fontVariantNumeric: 'tabular-nums', margin: '6px 0' }}>{mmss(elapsed)}</div>
              <Row>
                {running ? (
                  <Btn onClick={() => set({ timerAcc: s.timerAcc + Date.now() - s.timerStart, timerStart: 0 })}>⏸ Pause</Btn>
                ) : (
                  <Btn kind="primary" onClick={() => { set({ timerStart: Date.now() }); setTick(Date.now()) }}>▶ {s.timerAcc ? 'Resume' : 'Start reading'}</Btn>
                )}
                <Btn disabled={!running && !s.timerAcc} onClick={stopTimer}>■ Stop & log</Btn>
                <Btn kind="ghost" disabled={!running && !s.timerAcc} onClick={() => set({ timerStart: 0, timerAcc: 0 })}>Discard</Btn>
              </Row>
              {tb && <Num label={`Page reached (now on ${tb.page} of ${tb.pages})`} value={endPage ?? tb.page} onChange={(v) => setEndPage(Math.max(tb.page, Math.min(tb.pages, Math.round(v))))} min={0} max={tb.pages} step={1} />}
              <details>
                <summary className="muted" style={{ cursor: 'pointer' }}>Log a session manually</summary>
                <Row>
                  <Txt label="Date" type="date" value={manual.date} onChange={(date) => setManual({ ...manual, date })} />
                  <Num label="Minutes" value={manual.minutes} onChange={(minutes) => setManual({ ...manual, minutes })} min={1} />
                  <Num label="Pages" value={manual.pages} onChange={(pages) => setManual({ ...manual, pages })} min={0} />
                </Row>
                <Btn onClick={() => tb && logSession(tb, manual.minutes, manual.pages, manual.date)}>＋ Add session</Btn>
              </details>
            </>
          ) : <Note>Mark a book as “Reading” to use the timer.</Note>}
          {msg && <Note tone="ok">{msg}</Note>}
        </Panel>
        <Panel title="Add a book">
          <Txt label="Title" value={d.title} onChange={(title) => set({ draft: { ...d, title } })} placeholder="e.g. The Odyssey" />
          <Row>
            <Txt label="Author" value={d.author} onChange={(author) => set({ draft: { ...d, author } })} />
            <Num label="Pages" value={d.pages} onChange={(pages) => set({ draft: { ...d, pages } })} min={1} step={1} />
          </Row>
          <Row>
            <Txt label="Genre" value={d.genre} onChange={(genre) => set({ draft: { ...d, genre } })} />
            <Txt label="ISBN (optional)" value={d.isbn} onChange={(isbn) => set({ draft: { ...d, isbn } })} />
          </Row>
          <Select label="Status" value={d.status} onChange={(status) => set({ draft: { ...d, status } })} options={STATUS} />
          <Btn kind="primary" disabled={!d.title.trim()} onClick={() => {
            const id = uid()
            set((x) => ({ ...x, books: [...x.books, { id, title: d.title.trim(), author: d.author.trim(), pages: Math.max(1, d.pages), page: 0, status: d.status, genre: d.genre.trim(), started: d.status === 'reading' ? today : '', finished: '', rating: 0, isbn: d.isbn.trim(), cover: '' }], draft: DEF.draft, timerBook: d.status === 'reading' ? id : x.timerBook }))
          }}>＋ Add book</Btn>
        </Panel>
        <Panel title="Goals & privacy" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
          <Row>
            <Num label="Daily goal" value={s.goal} onChange={(goal) => set({ goal })} unit="min" min={1} />
            <Num label={`Books in ${year}`} value={s.yearGoal} onChange={(yearGoal) => set({ yearGoal })} min={1} step={1} />
          </Row>
          <Check label="Allow cover lookup on Open Library" value={s.allowCovers} onChange={(allowCovers) => set({ allowCovers })} />
          <p className="k-hint">Off by default. When on, the 🔍 button sends that book's title and author (or ISBN) to openlibrary.org and loads the cover image from covers.openlibrary.org. Everything else stays in this browser.</p>
          <Row><JsonButtons name="reading-log.json" data={s} onLoad={(x) => x && Array.isArray(x.books) && set({ ...DEF, ...x })} /></Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Streak" value={`${st.cur} day${st.cur === 1 ? '' : 's'} 🔥`} sub={st.todayDone ? `best ${st.best} · today done ✓` : `best ${st.best} · read ${s.goal} min today`} tone={st.todayDone ? 'good' : 'accent'} />
          <Stat label="This week" value={`${num(week / 60, 1)} h`} sub={`${week} min`} />
          <Stat label="Reading speed" value={pph ? `${Math.round(pph)} p/h` : '—'} sub="pages per hour" />
          <div className="k-stat" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Ring value={finYear / Math.max(1, s.yearGoal)} size={64} label={`${finYear}`} />
            <span><span className="k-stat-label">{year} goal</span><br /><b>{finYear} / {s.yearGoal}</b> books</span>
          </div>
        </Stats>
        <Panel title="Last 26 weeks">
          <Heatmap mins={mins} goal={s.goal} today={today} />
          <p className="k-hint">Darker green = more minutes; full green = twice your daily goal.</p>
        </Panel>
        <Panel title="Currently reading">
          {reading.map((b) => {
            const e = finishEstimate(b, s.sessions, today)
            return (
              <div key={b.id} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                <Cover b={b} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{b.title}</b> <span className="muted">· {b.author}</span>
                  <Bar value={b.page} max={b.pages} />
                  <div className="muted" style={{ fontSize: 13 }}>
                    p. {b.page} / {b.pages} ({Math.round((b.page / b.pages) * 100)}%) · {e.hours !== null ? `${num(e.hours, 1)} h left` : 'no pace yet'}{e.date ? ` · finish ≈ ${e.date}` : ''}
                  </div>
                </div>
              </div>
            )
          })}
          {!reading.length && <p className="muted">Nothing on the go — pick something from your list.</p>}
        </Panel>
        <Panel title="Badges">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {bdg.map((x) => (
              <div key={x.id} title={x.desc} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 8, opacity: x.earned ? 1 : 0.55, background: x.earned ? 'color-mix(in srgb, #f59e0b 12%, var(--panel))' : 'var(--panel)' }}>
                <div style={{ fontSize: 22, filter: x.earned ? undefined : 'grayscale(1)' }}>{x.icon}</div>
                <b style={{ fontSize: 13 }}>{x.name}</b>
                <div className="muted" style={{ fontSize: 11 }}>{x.desc}</div>
                {!x.earned && <Bar value={x.progress} />}
              </div>
            ))}
          </div>
        </Panel>
        <Panel title={`Library (${s.books.length})`}>
          <Table
            head={['', 'Book', 'Status', 'Progress', 'Rating', '']}
            rows={s.books.map((b) => [
              <Cover key="c" b={b} h={48} />,
              <span key="t"><b>{b.title}</b><br /><span className="muted">{b.author}{b.genre ? ` · ${b.genre}` : ''}</span></span>,
              <select key="s" value={b.status} onChange={(e) => { const status = e.target.value as Status; editBook(b.id, { status, ...(status === 'finished' ? { page: b.pages, finished: b.finished || today } : {}), ...(status === 'reading' && !b.started ? { started: today } : {}) }) }}>
                {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>,
              `${b.page}/${b.pages}`,
              <span key="r" style={{ whiteSpace: 'nowrap' }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => editBook(b.id, { rating: n === b.rating ? 0 : n })} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, fontSize: 16, color: n <= b.rating ? '#f59e0b' : 'var(--line)' }} aria-label={`${n} stars`}>★</button>)}</span>,
              <span key="x" style={{ whiteSpace: 'nowrap' }}>
                <Btn kind="ghost" disabled={!s.allowCovers} title={s.allowCovers ? 'Find cover on Open Library' : 'Enable cover lookup under Goals & privacy'} onClick={() => void findCover(b)}>🔍</Btn>
                <Btn kind="ghost" title="Delete" onClick={() => set((x) => ({ ...x, books: x.books.filter((y) => y.id !== b.id), sessions: x.sessions.filter((y) => y.book !== b.id) }))}>✕</Btn>
              </span>,
            ])}
          />
        </Panel>
        <Panel title="Sessions" actions={<CsvButton name="reading-sessions.csv" rows={() => [['Date', 'Book', 'Minutes', 'Pages'], ...s.sessions.map((x) => [x.date, s.books.find((b) => b.id === x.book)?.title ?? '', x.minutes, x.pages])]} />}>
          <Table max={12} head={['Date', 'Book', 'Minutes', 'Pages', '']} rows={[...s.sessions].sort((a, b) => b.date.localeCompare(a.date)).map((x) => [x.date, s.books.find((b) => b.id === x.book)?.title ?? '—', x.minutes, x.pages, <Btn key="d" kind="ghost" onClick={() => set((y) => ({ ...y, sessions: y.sessions.filter((z) => z.id !== x.id) }))}>✕</Btn>])} />
        </Panel>
      </div>
    </Split>
  )
}
