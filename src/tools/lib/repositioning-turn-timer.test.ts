import { describe, expect, it } from 'vitest'
import { clock, compliance, fmtDur, nextPosition, status, type Room, type Turn } from './repositioning-turn-timer'

const room: Room = { id: 'r1', label: '12A', interval: 120, position: 'Supine', last: 0, rotation: ['Left 30°', 'Supine', 'Right 30°'], paused: false, note: '' }
const M = 60000

describe('repositioning turn timer', () => {
  it('status levels around the due time', () => {
    expect(status(room, 60 * M).level).toBe('ok')
    expect(status(room, 110 * M)).toEqual({ due: 120 * M, left: 10 * M, level: 'soon' })
    expect(status(room, 125 * M).level).toBe('due')
    expect(status(room, 140 * M).level).toBe('overdue')
    expect(status({ ...room, paused: true }, 140 * M).level).toBe('paused')
  })
  it('rotation wraps and handles unknown positions', () => {
    expect(nextPosition('Supine', room.rotation)).toBe('Right 30°')
    expect(nextPosition('Right 30°', room.rotation)).toBe('Left 30°')
    expect(nextPosition('Prone', room.rotation)).toBe('Left 30°')
  })
  it('compliance counts gaps within interval + grace', () => {
    const t = (at: number): Turn => ({ id: String(at), room: 'r1', label: '12A', at: at * M, from: 'Supine', to: 'Supine', skin: '', by: '' })
    const turns = [t(0), t(120), t(250), t(400), { ...t(130), room: 'r2' }]
    expect(compliance(turns, 'r1', 120, 0, 1000 * M)).toEqual({ onTime: 2, total: 3, longest: 150 * M })
  })
  it('formats durations', () => {
    expect(fmtDur(65 * M)).toBe('1 h 05 min')
    expect(fmtDur(-12 * M)).toBe('12 min')
    expect(clock(-(61 * 1000))).toBe('−1:01')
    expect(clock(3723000)).toBe('1:02:03')
  })
})
