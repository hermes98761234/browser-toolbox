import { describe, expect, it } from 'vitest'
import { clean, generate, parseWords, readPlacement, suggestSize, type Dir } from './word-search-maker'

const WORDS = parseWords('Planet, Comet\nGalaxy; Orbit, nebula, Star, moon, ASTEROID, rocket, ice-cream, planet')

describe('word search maker', () => {
  it('parses and cleans words, dropping duplicates', () => {
    expect(clean('Ice-cream cone')).toBe('ICECREAMCONE')
    expect(clean('Über straße')).toBe('ÜBERSTRASSE')
    expect(WORDS.map((w) => w.word)).toContain('ICECREAM')
    expect(WORDS.filter((w) => w.word === 'PLANET').length).toBe(1)
  })
  it('places every word correctly in allowed directions', () => {
    const dirs: Dir[] = ['E', 'S', 'SE']
    const p = generate(WORDS, { rows: 12, cols: 12, dirs, seed: 42, overlap: true, fill: 'alphabet' })
    expect(p.unplaced).toEqual([])
    expect(p.placed.length).toBe(WORDS.length)
    for (const pl of p.placed) {
      expect(readPlacement(p, pl)).toBe(pl.word)
      expect(dirs).toContain(pl.dir)
    }
    expect(p.grid.flat().every((ch) => /^[A-Z]$/.test(ch))).toBe(true)
  })
  it('is deterministic for a seed', () => {
    const o = { rows: 12, cols: 12, dirs: ['E', 'W', 'N', 'S'] as Dir[], seed: 7, overlap: true, fill: 'word-letters' as const }
    expect(generate(WORDS, o)).toEqual(generate(WORDS, o))
    expect(generate(WORDS, { ...o, seed: 8 }).grid).not.toEqual(generate(WORDS, o).grid)
  })
  it('reports words that cannot fit', () => {
    const p = generate(parseWords('supercalifragilistic, cat'), { rows: 6, cols: 6, dirs: ['E'], seed: 1, overlap: false, fill: 'alphabet' })
    expect(p.unplaced).toEqual(['supercalifragilistic'])
    expect(p.placed[0].word).toBe('CAT')
  })
  it('without overlap no cell is shared', () => {
    const p = generate(WORDS, { rows: 14, cols: 14, dirs: ['E', 'S', 'SE', 'NE'], seed: 3, overlap: false, fill: 'alphabet' })
    const cells = new Set<string>()
    let n = 0
    for (const pl of p.placed) {
      const d = { E: [0, 1], S: [1, 0], SE: [1, 1], NE: [-1, 1] }[pl.dir as 'E']
      for (let i = 0; i < pl.word.length; i++) { cells.add(`${pl.r + d[0] * i},${pl.c + d[1] * i}`); n++ }
    }
    expect(cells.size).toBe(n)
  })
  it('suggests a sensible size', () => {
    expect(suggestSize(WORDS)).toBeGreaterThanOrEqual(9)
    expect(suggestSize([{ word: 'AB' }])).toBe(8)
  })
})
