import { describe, expect, it } from 'vitest'
import { parallel, requiredRsa, series, solve, type Net } from './thermal-resistance-network'

const node = (id: string, power = 0, fixed: number | null = null, tmax: number | null = null) => ({ id, name: id, power, fixed, tmax })

describe('thermal network', () => {
  it('series chain: Tj = Ta + P·ΣR', () => {
    const net: Net = {
      nodes: [node('j', 10, null, 150), node('c'), node('s'), node('a', 0, 25)],
      links: [{ id: '1', a: 'j', b: 'c', r: 1.5, label: '' }, { id: '2', a: 'c', b: 's', r: 0.5, label: '' }, { id: '3', a: 's', b: 'a', r: 3, label: '' }],
    }
    const s = solve(net)
    expect(s.error).toBe('')
    expect(s.temps.get('j')).toBeCloseTo(75, 9)
    expect(s.temps.get('s')).toBeCloseTo(55, 9)
    expect(s.flows.get('2')).toBeCloseTo(10, 9)
    // (150 − 25) / (75 − 25) = 2.5
    expect(s.headroom).toBeCloseTo(2.5, 9)
  })
  it('two sources sharing a heatsink', () => {
    const net: Net = {
      nodes: [node('q1', 5), node('q2', 15), node('hs'), node('amb', 0, 40)],
      links: [{ id: 'a', a: 'q1', b: 'hs', r: 2, label: '' }, { id: 'b', a: 'q2', b: 'hs', r: 2, label: '' }, { id: 'c', a: 'hs', b: 'amb', r: 1, label: '' }],
    }
    const s = solve(net)
    expect(s.temps.get('hs')).toBeCloseTo(60, 9)
    expect(s.temps.get('q1')).toBeCloseTo(70, 9)
    expect(s.temps.get('q2')).toBeCloseTo(90, 9)
  })
  it('parallel paths split heat by conductance', () => {
    const net: Net = {
      nodes: [node('j', 12), node('a', 0, 20)],
      links: [{ id: 'top', a: 'j', b: 'a', r: 4, label: '' }, { id: 'pcb', a: 'j', b: 'a', r: 2, label: '' }],
    }
    const s = solve(net)
    expect(s.temps.get('j')).toBeCloseTo(20 + 12 * parallel([4, 2]), 9)
    expect(s.flows.get('pcb')).toBeCloseTo(8, 9)
    expect(s.flows.get('top')).toBeCloseTo(4, 9)
  })
  it('reports floating nodes and missing reference', () => {
    expect(solve({ nodes: [node('x', 1)], links: [] }).error).toMatch(/fixed/)
    expect(solve({ nodes: [node('x', 1), node('a', 0, 25)], links: [] }).error).toMatch(/No heat path/)
  })
  it('helpers', () => {
    expect(series([1, 2, 3])).toBe(6)
    expect(parallel([2, 2])).toBe(1)
    // LM317 style: 10 W, Tj 125, Ta 40, Rjc 4, Rcs 0.5 → Rsa ≤ 4.0
    expect(requiredRsa(10, 125, 40, 4, 0.5)).toBeCloseTo(4, 9)
  })
})
