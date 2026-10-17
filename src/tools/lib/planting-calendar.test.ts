import { describe, expect, it } from 'vitest'
import { CROPS, schedule, seasonDays, toIcs } from './planting-calendar'

const crop = (n: string) => CROPS.find((c) => c.n === n)!

describe('planting calendar', () => {
  it('tomato: indoors 8–6 weeks before last frost, harvest after transplant + DTM', () => {
    const t = schedule(crop('Tomato'), '2026-05-01', '2026-09-20')
    expect(t.find((x) => x.kind === 'indoor')).toMatchObject({ start: '2026-03-06', end: '2026-03-20' })
    expect(t.find((x) => x.kind === 'transplant')).toMatchObject({ start: '2026-05-08', end: '2026-05-22' })
    // 2026-05-08 + 70 days
    expect(t.find((x) => x.kind === 'harvest')?.start).toBe('2026-07-17')
    // tender: clipped at first frost
    expect(t.find((x) => x.kind === 'harvest')?.end).toBe('2026-09-20')
  })
  it('radish gets a fall sowing ending before frost', () => {
    const t = schedule(crop('Radish'), '2026-04-15', '2026-10-20')
    const fall = t.find((x) => x.kind === 'fall-sow')!
    expect(fall).toBeTruthy()
    expect(fall.end < '2026-10-20').toBe(true)
  })
  it('season length', () => {
    expect(seasonDays('2026-05-01', '2026-10-01')).toBe(153)
  })
  it('ICS uses all-day dates with exclusive end', () => {
    const ics = toIcs([{ crop: 'Peas', kind: 'direct', start: '2026-03-20', end: '2026-04-10' }])
    expect(ics).toContain('DTSTART;VALUE=DATE:20260320')
    expect(ics).toContain('DTEND;VALUE=DATE:20260411')
    expect(ics).toContain('SUMMARY:Peas: Direct sow outdoors')
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR')
  })
})
