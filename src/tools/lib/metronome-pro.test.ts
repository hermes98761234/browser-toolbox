import { describe, expect, it } from 'vitest'
import { barSeconds, barTicks, tapBpm, tempoName, trainerBpm } from './metronome-pro'

describe('metronome-pro', () => {
  it('lays out a 4/4 bar with eighths', () => {
    const t = barTicks([2, 1, 1, 1], 2, 0)
    expect(t.length).toBe(8)
    expect(t.map((x) => x.at)).toEqual([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875])
    expect(t[0].level).toBe(1)
    expect(t[1].layer).toBe('sub')
  })
  it('adds a 3-against-4 polyrhythm', () => {
    const p = barTicks([2, 1, 1, 1], 1, 3).filter((x) => x.layer === 'poly')
    expect(p.map((x) => +x.at.toFixed(4))).toEqual([0, 0.3333, 0.6667])
  })
  it('muted beats silence their subdivisions', () => {
    const t = barTicks([2, 0], 3, 0)
    expect(t.filter((x) => x.beat === 1).every((x) => x.level === 0)).toBe(true)
  })
  it('bar length', () => {
    expect(barSeconds(120, 4)).toBe(2)
    expect(barSeconds(90, 3)).toBe(2)
  })
  it('tap tempo uses median and resets after a pause', () => {
    expect(tapBpm([0])).toBeNull()
    expect(tapBpm([0, 500, 1000, 1500, 2100])).toBe(120)
    expect(tapBpm([0, 300, 600, 5000, 5600, 6200])).toBe(100)
  })
  it('tempo names', () => {
    expect(tempoName(60)).toBe('Adagio')
    expect(tempoName(120)).toBe('Allegro')
    expect(tempoName(210)).toBe('Prestissimo')
  })
  it('trainer steps and caps', () => {
    expect(trainerBpm(80, 100, 5, 4, 0)).toBe(80)
    expect(trainerBpm(80, 100, 5, 4, 7)).toBe(85)
    expect(trainerBpm(80, 100, 5, 4, 100)).toBe(100)
  })
})
