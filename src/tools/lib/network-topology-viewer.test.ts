import { describe, expect, it } from 'vitest'
import { articulationPoints, components, forceLayout3D, guessType, parseCsv, parseJson, SAMPLE_CSV, SAMPLE_JSON, shortestPath } from './network-topology-viewer'

describe('network topology', () => {
  it('parses the JSON sample', () => {
    const t = parseJson(SAMPLE_JSON)
    expect(t.nodes.length).toBe(23)
    expect(t.links.length).toBe(27)
    expect(t.warnings).toEqual([])
  })
  it('parses CSV with header and types', () => {
    const t = parseCsv(SAMPLE_CSV)
    expect(t.links.length).toBe(19)
    expect(t.nodes.find((n) => n.id === 'MAD-pop')?.type).toBe('cloud')
    expect(t.links[0].latency).toBe(7)
  })
  it('drops self-loops and duplicates, adds missing nodes', () => {
    const t = parseCsv('a,b,1\nb,a,2\nc,c,1')
    expect(t.links.length).toBe(1)
    expect(t.warnings.length).toBe(2)
    expect(t.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
  })
  it('guesses device types', () => {
    expect(guessType('core-rtr-1')).toBe('router')
    expect(guessType('pg-db')).toBe('database')
    expect(guessType('leaf-sw3')).toBe('switch')
  })
  it('finds the lowest-latency path', () => {
    const t = parseCsv('a,b,10\nb,c,10\na,c,25\nc,d,1')
    const p = shortestPath(t, 'a', 'd')!
    expect(p.path).toEqual(['a', 'b', 'c', 'd'])
    expect(p.latency).toBe(21)
    expect(shortestPath(parseCsv('a,b,1\nc,d,1'), 'a', 'd')).toBeNull()
  })
  it('finds single points of failure and components', () => {
    const t = parseCsv('a,b,1\nb,c,1\nc,a,1\nc,d,1\nx,y,1')
    expect([...articulationPoints(t)]).toEqual(['c'])
    expect(components(t).length).toBe(2)
  })
  it('lays out deterministically within the radius', () => {
    const t = parseJson(SAMPLE_JSON)
    const a = forceLayout3D(t, 100, 5), b = forceLayout3D(t, 100, 5)
    expect(a.get('db1')).toEqual(b.get('db1'))
    for (const p of a.values()) expect(Math.hypot(...p)).toBeLessThanOrEqual(5.0001)
  })
})
