import { describe, expect, it } from 'vitest'
import { addDays, badges, coverUrl, finishEstimate, pagesPerHour, streaks, type Book, type Session } from './reading-log'

const S = (date: string, minutes: number, pages = 0, book = 'a'): Session => ({ id: date + minutes, book, date, minutes, pages })
const book: Book = { id: 'a', title: 'T', author: 'A', pages: 300, page: 100, status: 'reading', genre: 'Novel', started: '2026-01-01', finished: '', rating: 0, isbn: '', cover: '' }

describe('reading log', () => {
  it('streaks count consecutive goal days', () => {
    const s = [S('2026-03-01', 20), S('2026-03-02', 25), S('2026-03-03', 5), S('2026-03-04', 30), S('2026-03-05', 15), S('2026-03-05', 10)]
    expect(streaks(s, 20, '2026-03-05')).toEqual({ cur: 2, best: 2, todayDone: true })
    // today not yet read: streak continues from yesterday
    expect(streaks(s, 20, '2026-03-06').cur).toBe(2)
    expect(streaks(s, 20, '2026-03-07').cur).toBe(0)
    expect(streaks(s, 1, '2026-03-05').best).toBe(5)
  })
  it('pace and finish estimate', () => {
    const s = [S('2026-03-01', 60, 40), S('2026-03-02', 30, 20)]
    expect(pagesPerHour(s, 'a')).toBeCloseTo(40, 9)
    const e = finishEstimate(book, s, '2026-03-02', 2)
    // 45 min/day at 40 p/h = 30 pages/day; 200 left → 7 days
    expect(e.left).toBe(200)
    expect(e.hours).toBeCloseTo(5, 9)
    expect(e.date).toBe(addDays('2026-03-02', 7))
  })
  it('badges and covers', () => {
    const b = badges([{ ...book, status: 'finished', pages: 520 }], [S('2026-03-01', 130, 600)], 20, '2026-03-01')
    expect(b.find((x) => x.id === 'first')!.earned).toBe(true)
    expect(b.find((x) => x.id === 'marathon')!.earned).toBe(true)
    expect(b.find((x) => x.id === 'brick')!.earned).toBe(true)
    expect(b.find((x) => x.id === 'pages')!.progress).toBeCloseTo(0.6, 9)
    expect(coverUrl({ coverId: 42 })).toBe('https://covers.openlibrary.org/b/id/42-M.jpg')
    expect(coverUrl({ isbn: '978-0-14-143951-8' })).toContain('/isbn/9780141439518-M.jpg')
  })
})
