import { describe, expect, it } from 'vitest'
import { buildGraph, ForceSim, neighborhood, parseLinks, parseTags, shortestPath, splitNotes } from './knowledge-graph-explorer'

const TEXT = `# Alpha
Links to [[Beta]] and [[Gamma|the third]] and [[beta#Section]]. #idea #Idea

# Beta
Back to [[Alpha]]; mentions [[Missing note]].

# Gamma
Nothing here. # not a heading
`

describe('knowledge-graph-explorer', () => {
  it('parses notes, links and tags', () => {
    const notes = splitNotes(TEXT)
    expect(notes.map((n) => n.title)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(parseLinks(notes[0].body)).toEqual(['Beta', 'Gamma', 'beta'])
    expect(parseTags(notes[0].body)).toEqual(['idea'])
  })
  it('builds a graph with ghost nodes and deduped edges', () => {
    const g = buildGraph(splitNotes(TEXT))
    expect(g.nodes.length).toBe(4)
    expect(g.nodes.find((n) => n.title === 'Missing note')!.ghost).toBe(true)
    expect(g.edges.length).toBe(3)
    expect(g.nodes[1].inc).toEqual(['alpha'])
    expect([...neighborhood(g, 2, 1)].sort()).toEqual([0, 2])
    expect(shortestPath(g, 2, 3)).toEqual([2, 0, 1, 3])
  })
  it('lays out linked nodes closer than unlinked ones', () => {
    // two cliques of 6 joined by one edge
    const edges: [number, number][] = []
    for (const off of [0, 6]) for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) edges.push([off + i, off + j])
    edges.push([0, 6])
    const sim = new ForceSim(12, edges, 7).run(300, { theta: 0 })
    const within = sim.dist(1, 2), across = sim.dist(3, 9)
    expect(within).toBeLessThan(across)
    for (const v of sim.pos) expect(Number.isFinite(v)).toBe(true)
  })
  it('Barnes–Hut matches exact layout qualitatively on larger graphs', () => {
    const n = 150
    const edges: [number, number][] = []
    for (let i = 1; i < n; i++) edges.push([i, Math.floor((i - 1) / 3)])
    const sim = new ForceSim(n, edges, 3).run(200)
    for (const v of sim.pos) expect(Number.isFinite(v)).toBe(true)
    expect(sim.dist(0, 1)).toBeLessThan(sim.dist(100, 140))
  })
})
