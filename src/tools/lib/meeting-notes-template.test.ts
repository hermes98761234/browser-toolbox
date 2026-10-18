import { describe, expect, it } from 'vitest'
import { bucket, clock, dow, matches, parseAction, parseDue, parseEntry, toIcs, toMarkdown, type Meeting } from './meeting-notes-template'

const REF = '2026-10-14' // Wednesday

describe('quick capture', () => {
  it('parses prefixes', () => {
    expect(parseEntry('A: send deck @mia fri')).toEqual({ kind: 'action', text: 'send deck @mia fri' })
    expect(parseEntry('d) go with vendor B')).toEqual({ kind: 'decision', text: 'go with vendor B' })
    expect(parseEntry('Q: who owns QA?').kind).toBe('question')
    expect(parseEntry('[] book room').kind).toBe('action')
    expect(parseEntry('Budget looks fine').kind).toBe('note')
    expect(parseEntry('Agenda: budget').kind).toBe('note')
  })
})

describe('natural due dates', () => {
  it('relative words', () => {
    expect(dow(REF)).toBe(3)
    expect(parseDue('by today', REF)?.date).toBe(REF)
    expect(parseDue('tomorrow please', REF)?.date).toBe('2026-10-15')
    expect(parseDue('before EOW', REF)?.date).toBe('2026-10-16')
    expect(parseDue('next week', REF)?.date).toBe('2026-10-19')
    expect(parseDue('in 3 days', REF)?.date).toBe('2026-10-17')
    expect(parseDue('in two weeks', REF)?.date).toBe('2026-10-28')
    expect(parseDue('end of month', REF)?.date).toBe('2026-10-31')
    expect(parseDue('next month', REF)?.date).toBe('2026-11-01')
  })
  it('weekdays', () => {
    expect(parseDue('send it fri', REF)?.date).toBe('2026-10-16')
    expect(parseDue('by Friday', REF)?.date).toBe('2026-10-16')
    expect(parseDue('by wed', REF)?.date).toBe('2026-10-21')
    expect(parseDue('this wed', REF)?.date).toBe(REF)
    expect(parseDue('next fri', REF)?.date).toBe('2026-10-23')
    expect(parseDue('next monday', REF)?.date).toBe('2026-10-19')
    expect(parseDue('fix the monitor stand', REF)).toBeNull()
    expect(parseDue('we sat down with legal', REF)).toBeNull()
  })
  it('explicit dates', () => {
    expect(parseDue('due 2026-11-03', REF)?.date).toBe('2026-11-03')
    expect(parseDue('by Nov 3rd', REF)?.date).toBe('2026-11-03')
    expect(parseDue('3 january', REF)?.date).toBe('2027-01-03')
  })
})

describe('actions', () => {
  it('extracts owner, due and a clean task', () => {
    expect(parseAction('send revised budget to finance @mia by Friday', REF)).toEqual({ task: 'Send revised budget to finance', owner: 'mia', due: '2026-10-16' })
    expect(parseAction('@Olek: check licences next week.', REF)).toEqual({ task: 'Check licences', owner: 'Olek', due: '2026-10-19' })
    expect(parseAction('update roadmap', REF)).toEqual({ task: 'Update roadmap', owner: '', due: '' })
  })
  it('buckets', () => {
    expect(bucket('2026-10-10', REF)).toBe('overdue')
    expect(bucket(REF, REF)).toBe('today')
    expect(bucket('2026-10-20', REF)).toBe('week')
    expect(bucket('2026-12-01', REF)).toBe('later')
    expect(bucket('', REF)).toBe('none')
    expect(clock(65)).toBe('1:05')
    expect(clock(3725)).toBe('1:02:05')
    expect(clock(-30)).toBe('−0:30')
  })
})

describe('export', () => {
  const m: Meeting = {
    id: 'm', title: 'Sync', date: REF, attendees: 'Mia, Olek',
    items: [{ id: 'i1', title: 'Budget', minutes: 10, spent: 540 }],
    entries: [{ id: 'e1', at: 0, item: 'i1', kind: 'decision', text: 'Go with plan B' }, { id: 'e2', at: 0, item: 'i1', kind: 'note', text: 'Costs up 4 %' }],
    actions: [{ id: 'a1', task: 'Send deck', owner: 'mia', due: '2026-10-16', done: false }],
  }
  it('markdown', () => {
    const md = toMarkdown(m)
    expect(md).toContain('# Sync — 2026-10-14')
    expect(md).toContain('## Budget _(10 min planned, 9 min used)_')
    expect(md).toContain('- **Decision:** Go with plan B')
    expect(md).toContain('- [ ] Send deck — @mia (due 2026-10-16)')
  })
  it('ics and search', () => {
    const ics = toIcs(m.actions, '20261014T000000Z')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261016')
    expect(ics).toContain('DTEND;VALUE=DATE:20261017')
    expect(ics.split('BEGIN:VEVENT')).toHaveLength(2)
    expect(matches(m, 'plan b')).toBe(true)
    expect(matches(m, '@mia deck')).toBe(true)
    expect(matches(m, 'zebra')).toBe(false)
  })
})
