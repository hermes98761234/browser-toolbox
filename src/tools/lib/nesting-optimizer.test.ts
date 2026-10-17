import { describe, expect, it } from 'vitest'
import { evolve, expand, loopsToParts, pack, parseDxf, SAMPLE_DXF, utilisation, type Part } from './nesting-optimizer'

const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('nesting optimizer', () => {
  const parts: Part[] = [
    { id: 'a', name: 'A', w: 500, h: 300, qty: 4, rotate: true },
    { id: 'b', name: 'B', w: 250, h: 250, qty: 6, rotate: true },
  ]
  const cfg = { W: 1000, H: 1000, gap: 5 }
  it('packs without overlap and inside the sheet', () => {
    const pcs = expand(parts)
    const l = pack(pcs, [...pcs.keys()], pcs.map(() => false), cfg)
    expect(l.unplaced).toEqual([])
    for (const sh of l.sheets) {
      for (const p of sh) {
        expect(p.x + p.w).toBeLessThanOrEqual(cfg.W + 1e-9)
        expect(p.y + p.h).toBeLessThanOrEqual(cfg.H + 1e-9)
      }
      for (let i = 0; i < sh.length; i++) for (let j = i + 1; j < sh.length; j++) expect(overlap(sh[i], sh[j])).toBe(false)
    }
    expect(l.sheets.reduce((a, s) => a + s.length, 0)).toBe(10)
  })
  it('GA never gets worse than the greedy seed', () => {
    const parts2: Part[] = [{ ...parts[0] }, { id: 'b', name: 'B', w: 200, h: 200, qty: 8, rotate: true }]
    const cfg0 = { W: 1000, H: 1000, gap: 0 }
    const pcs = expand(parts2)
    const it = evolve(pcs, cfg0, { gens: 15, pop: 12, seed: 3 })
    const first = it.next().value as { best: { score: number } }
    let r = it.next()
    while (!r.done) r = it.next()
    expect(r.value.score).toBeLessThanOrEqual(first.best.score)
    expect(r.value.sheets.length).toBe(1)
    const u = utilisation(r.value, parts2, cfg0)
    expect(u.util).toBeCloseTo(0.92, 3)
  })
  it('reports parts that cannot fit', () => {
    const l = pack([{ part: 0, w: 2000, h: 10, rotate: true }], [0], [false], cfg)
    expect(l.unplaced).toEqual([0])
  })
  it('parses DXF loops with holes', () => {
    const loops = parseDxf(SAMPLE_DXF)
    expect(loops.length).toBe(5)
    const p = loopsToParts(loops)
    expect(p.length).toBe(2)
    const bracket = p.find((x) => x.w === 220)!
    expect(bracket.h).toBe(180)
    expect(bracket.outline!.length).toBe(3)
    expect(bracket.area).toBeCloseTo(220 * 60 + 60 * 120 - 2 * Math.PI * 64, -1)
  })
})
