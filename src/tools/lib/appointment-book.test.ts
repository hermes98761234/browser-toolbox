import { describe, expect, it } from 'vitest'
import { conflicts, fold, freeSlots, occurrences, seriesDates, toIcs, utilisation, weekStart, type Appt, type Hours } from './appointment-book'

const A = (p: Partial<Appt>): Appt => ({ id: 'a', clientId: 'c', serviceId: 's', date: '2026-10-19', start: '10:00', minutes: 60, status: 'booked', notes: '', repeat: 'none', count: 1, skip: [], ...p })
const HOURS: Hours = [null, [540, 1020], [540, 1020], [540, 1020], [540, 1020], [540, 960], null]

describe('series', () => {
  it('weekly / biweekly / monthly', () => {
    expect(seriesDates(A({ repeat: 'weekly', count: 3 }))).toEqual(['2026-10-19', '2026-10-26', '2026-11-02'])
    expect(seriesDates(A({ repeat: 'biweekly', count: 2 }))).toEqual(['2026-10-19', '2026-11-02'])
    expect(seriesDates(A({ date: '2026-01-31', repeat: 'monthly', count: 3 }))).toEqual(['2026-01-31', '2026-03-31', '2026-05-31'])
  })
  it('occurrences honour skips, range and cancellations', () => {
    const occ = occurrences([A({ repeat: 'weekly', count: 4, skip: ['2026-10-26'] }), A({ id: 'b', status: 'cancelled' })], '2026-10-01', '2026-11-30')
    expect(occ.map((o) => o.date)).toEqual(['2026-10-19', '2026-11-02', '2026-11-09'])
  })
  it('week starts on Monday', () => {
    expect(weekStart('2026-10-18')).toBe('2026-10-12')
    expect(weekStart('2026-10-19')).toBe('2026-10-19')
  })
})

describe('scheduling', () => {
  const occ = occurrences([A({}), A({ id: 'b', start: '10:30', minutes: 30 }), A({ id: 'c', start: '11:10' })], '2026-10-19', '2026-10-19')
  it('detects overlaps and buffer violations', () => {
    expect(conflicts(occ).length).toBe(1)
    expect(conflicts(occ, 15).length).toBe(3)
  })
  it('finds free slots inside working hours', () => {
    const s = freeSlots(occ, HOURS, '2026-10-19', 1, 60, 0, 30)
    expect(s[0]).toEqual({ date: '2026-10-19', start: 540 })
    expect(s.some((x) => x.start === 600 || x.start === 630)).toBe(false)
    expect(s[s.length - 1].start).toBe(960)
    expect(freeSlots([], HOURS, '2026-10-18', 1, 30, 0)).toEqual([]) // Sunday closed
  })
  it('utilisation', () => {
    const u = utilisation(occurrences([A({})], '2026-10-19', '2026-10-25'), HOURS, '2026-10-19', 7)
    expect(u.open).toBe(4 * 480 + 420)
    expect(u.booked).toBe(60)
  })
})

describe('ics', () => {
  it('produces RFC 5545 events with folding and escaping', () => {
    const occ = occurrences([A({ notes: 'Bring forms; parking, gate B' })], '2026-10-19', '2026-10-19')
    const ics = toIcs(occ, [{ id: 's', name: 'Consultation', minutes: 60, price: 80, color: '#000' }], [{ id: 'c', name: 'Ann Lee', email: 'ann@example.com', phone: '' }], { name: 'Studio', email: 'hi@studio.test', address: '1 Main St' }, new Date('2026-10-01T00:00:00Z'))
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/)
    expect(ics).toContain('SUMMARY:Consultation — Studio')
    expect(ics.replace(/\r\n /g, '')).toContain(String.raw`Bring forms\; parking\, gate B`)
    expect(ics).toContain('ATTENDEE;CN=Ann Lee;ROLE=REQ-PARTICIPANT:mailto:ann@example.com')
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/)
  })
  it('fold keeps content', () => {
    const l = 'DESCRIPTION:' + 'ä'.repeat(80)
    expect(fold(l).replace(/\r\n /g, '')).toBe(l)
  })
})
