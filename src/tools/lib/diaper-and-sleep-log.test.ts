import { describe, expect, it } from 'vitest'
import { dur, sleepWithin, summarize, type Ev, type Sleep } from './diaper-and-sleep-log'

const at = (d: number, h: number, m = 0) => new Date(2024, 0, d, h, m).getTime()

describe('diaper-and-sleep-log', () => {
  it('splits sleep across midnight', () => {
    const s: Sleep[] = [{ id: 'a', start: at(1, 22), end: at(2, 3) }]
    expect(sleepWithin(s, at(1, 0), at(2, 0), at(3, 0)) / 3600000).toBe(2)
    expect(sleepWithin(s, at(2, 0), at(3, 0), at(3, 0)) / 3600000).toBe(3)
  })
  it('counts open sessions until now', () => {
    expect(sleepWithin([{ id: 'a', start: at(1, 10), end: null }], at(1, 0), at(2, 0), at(1, 11, 30)) / 60000).toBe(90)
  })
  it('summarizes days', () => {
    const ev: Ev[] = [{ id: '1', t: at(2, 8), kind: 'wet' }, { id: '2', t: at(2, 9), kind: 'both' }, { id: '3', t: at(1, 9), kind: 'dirty' }, { id: '4', t: at(2, 10), kind: 'feed' }]
    const sl: Sleep[] = [{ id: 'a', start: at(1, 22), end: at(2, 3) }, { id: 'b', start: at(2, 13), end: at(2, 14, 30) }]
    const [d1, d2] = summarize(ev, sl, at(2, 20), 2)
    expect(d1).toMatchObject({ wet: 0, dirty: 1, sleepH: 2, longestH: 2 })
    expect(d2).toMatchObject({ wet: 2, dirty: 1, feeds: 1, sleepH: 4.5, longestH: 3 })
  })
  it('formats durations', () => {
    expect(dur(45 * 60000)).toBe('45m')
    expect(dur(135 * 60000)).toBe('2h 15m')
  })
})
