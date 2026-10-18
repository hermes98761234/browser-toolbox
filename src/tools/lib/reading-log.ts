// Reading log maths: daily totals, streaks, pace and finish estimates, badges.

export type Status = 'want' | 'reading' | 'finished' | 'abandoned'
export interface Book { id: string; title: string; author: string; pages: number; page: number; status: Status; genre: string; started: string; finished: string; rating: number; isbn: string; cover: string }
export interface Session { id: string; book: string; date: string; minutes: number; pages: number }

const DAY = 86400000
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10)
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY)

export function dailyMinutes(sessions: Session[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const s of sessions) m.set(s.date, (m.get(s.date) ?? 0) + Math.max(0, s.minutes))
  return m
}

/**
 * Current streak = consecutive days ending today (or yesterday, if today has no reading yet)
 * with at least `goal` minutes; best = longest such run.
 */
export function streaks(sessions: Session[], goal: number, today: string) {
  const m = dailyMinutes(sessions)
  const ok = (d: string) => (m.get(d) ?? 0) >= Math.max(1, goal)
  let cur = 0
  let d = ok(today) ? today : addDays(today, -1)
  while (ok(d)) {
    cur++
    d = addDays(d, -1)
  }
  const days = [...m.keys()].filter(ok).sort()
  let best = 0, run = 0
  days.forEach((x, i) => {
    run = i && dayDiff(days[i - 1], x) === 1 ? run + 1 : 1
    best = Math.max(best, run)
  })
  return { cur, best, todayDone: ok(today) }
}

/** Pages per hour from logged sessions of one book (null without data). */
export function pagesPerHour(sessions: Session[], book?: string): number | null {
  const s = sessions.filter((x) => (book === undefined || x.book === book) && x.minutes > 0 && x.pages > 0)
  const min = s.reduce((a, x) => a + x.minutes, 0)
  return min ? (s.reduce((a, x) => a + x.pages, 0) / min) * 60 : null
}

/** Estimated finish date for a book given average minutes per day over the last `window` days. */
export function finishEstimate(book: Book, sessions: Session[], today: string, window = 14) {
  const pph = pagesPerHour(sessions, book.id) ?? pagesPerHour(sessions)
  const since = addDays(today, -window + 1)
  const mins = sessions.filter((x) => x.book === book.id && x.date >= since && x.date <= today).reduce((a, x) => a + x.minutes, 0) / window
  const left = Math.max(0, book.pages - book.page)
  if (!pph || mins <= 0) return { left, hours: pph ? left / pph : null, date: null as string | null }
  const perDay = (pph * mins) / 60
  return { left, hours: left / pph, date: addDays(today, Math.ceil(left / perDay)) }
}

export interface Badge { id: string; icon: string; name: string; desc: string; earned: boolean; progress: number }

export function badges(books: Book[], sessions: Session[], goal: number, today: string): Badge[] {
  const fin = books.filter((b) => b.status === 'finished')
  const st = streaks(sessions, goal, today)
  const minutes = sessions.reduce((a, s) => a + s.minutes, 0)
  const pages = sessions.reduce((a, s) => a + s.pages, 0)
  const genres = new Set(fin.map((b) => b.genre.trim().toLowerCase()).filter(Boolean)).size
  const longest = Math.max(0, ...sessions.map((s) => s.minutes))
  const big = Math.max(0, ...fin.map((b) => b.pages))
  const B = (id: string, icon: string, name: string, desc: string, v: number, target: number): Badge => ({ id, icon, name, desc, earned: v >= target, progress: Math.min(1, v / target) })
  return [
    B('first', '📘', 'First finish', 'Finish a book', fin.length, 1),
    B('five', '📚', 'Bookshelf', 'Finish 5 books', fin.length, 5),
    B('week', '🔥', 'Week streak', '7 days in a row at your daily goal', st.best, 7),
    B('month', '🏅', 'Month streak', '30 days in a row', st.best, 30),
    B('hours', '⏱️', '10 hours', 'Read for 10 hours in total', minutes, 600),
    B('pages', '📄', '1,000 pages', 'Log 1,000 pages', pages, 1000),
    B('marathon', '🏃', 'Marathon', 'One session of 2 hours', longest, 120),
    B('brick', '🧱', 'Doorstopper', 'Finish a book of 500+ pages', big, 500),
    B('explorer', '🧭', 'Genre explorer', 'Finish books in 4 genres', genres, 4),
  ]
}

/** Open Library cover URL from a search result's cover id or an ISBN. */
export const coverUrl = (o: { coverId?: number; isbn?: string }) =>
  o.coverId ? `https://covers.openlibrary.org/b/id/${o.coverId}-M.jpg` : o.isbn ? `https://covers.openlibrary.org/b/isbn/${o.isbn.replace(/[^0-9Xx]/g, '')}-M.jpg?default=false` : ''
