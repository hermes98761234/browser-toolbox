import { describe, expect, it } from 'vitest'
import { daily, dewPoint, excursions, merge, parseCsv, parseTime, sampleReadings, svp, vpd, vpdZone, type Limits, type Reading } from './greenhouse-climate-log'

const L: Limits = { tMin: 10, tMax: 30, rhMin: 40, rhMax: 90, vpdMin: 0.4, vpdMax: 1.6 }

describe('greenhouse-climate-log', () => {
  it('psychrometrics', () => {
    expect(svp(25)).toBeCloseTo(3.168, 2)
    expect(vpd(25, 60)).toBeCloseTo(1.267, 2)
    expect(vpd(25, 60, -2)).toBeCloseTo(0.908, 2)
    expect(dewPoint(25, 60)).toBeCloseTo(16.7, 1)
    expect(dewPoint(20, 100)).toBeCloseTo(20, 5)
    expect(vpdZone(1.0).name).toBe('Vegetative')
    expect(vpdZone(0.2).name).toBe('Too humid')
  })
  it('parses timestamps', () => {
    expect(parseTime('2026-05-03 14:30')).toBe(new Date(2026, 4, 3, 14, 30).getTime())
    expect(parseTime('03/05/2026 2:30 PM')).toBe(new Date(2026, 4, 3, 14, 30).getTime())
    expect(parseTime('05/03/2026 14:30', false)).toBe(new Date(2026, 4, 3, 14, 30).getTime())
    expect(parseTime('1700000000')).toBe(1700000000000)
    expect(parseTime('nonsense')).toBeNaN()
  })
  it('imports CSV with header detection and °F', () => {
    const r = parseCsv('Timestamp;Temperature °F;Humidity %\n2026-05-03 10:00;77;"55,5"\n2026-05-03 09:00;68;60\nbad;row;x')
    expect(r.fahrenheit).toBe(true)
    expect(r.skipped).toBe(1)
    expect(r.readings.length).toBe(2)
    expect(r.readings[0][1]).toBeCloseTo(20, 5)
    expect(r.readings[1]).toEqual([new Date(2026, 4, 3, 10).getTime(), 25, 55.5])
    const n = parseCsv('2026-05-03T10:00,21.5,70')
    expect(n.readings).toEqual([[new Date(2026, 4, 3, 10).getTime(), 21.5, 70]])
  })
  it('merge de-duplicates', () => {
    expect(merge([[1, 20, 50], [2, 21, 50]], [[2, 22, 55]])).toEqual([[1, 20, 50], [2, 22, 55]])
  })
  it('excursions are contiguous runs', () => {
    const h = 3600_000
    const rs: Reading[] = [[0, 20, 60], [h, 32, 60], [2 * h, 34, 60], [3 * h, 25, 60], [4 * h, 31, 60], [10 * h, 31, 60]]
    const ex = excursions(rs, L).filter((e) => e.metric === 'Temperature')
    expect(ex.length).toBe(3)
    const first = ex[ex.length - 1]
    expect(first).toMatchObject({ kind: 'high', start: h, end: 2 * h, peak: 34, count: 2 })
  })
  it('daily summary', () => {
    const t0 = new Date(2026, 4, 3, 8).getTime()
    const d = daily([[t0, 20, 50], [t0 + 3600_000, 30, 40], [t0 + 7200_000, 35, 30]], L)
    expect(d[0]).toMatchObject({ day: '2026-05-03', n: 3, tMin: 20, tMax: 35, tAvg: 85 / 3 })
    expect(d[0].inRange).toBeCloseTo(1 / 3, 10) // 30 °C/40 % has VPD 2.5 kPa
    expect(sampleReadings(Date.now()).length).toBeGreaterThan(300)
  })
})
