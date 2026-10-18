import { describe, expect, it } from 'vitest'
import { BOX_W, descendantLayout, fromGedcom, index, parseLines, pedigreeLayout, relationship, sampleTree, siblingsOf, toGedcom } from './family-tree-builder'

const t = sampleTree()
const rel = (a: string, b: string) => relationship(t, a, b).label

describe('family tree builder', () => {
  it('GEDCOM round trip is lossless', () => {
    const tree = sampleTree()
    tree.people[0].notes = 'Line one\nLine two ' + 'x'.repeat(600)
    const g1 = toGedcom(tree, { date: '1 JAN 2026' })
    expect(g1).toMatch(/^0 HEAD\n1 SOUR BROWSER_TOOLBOX/)
    expect(g1).toContain('2 VERS 5.5.1')
    expect(g1).toContain('1 NAME Arthur /Penhallow/')
    expect(g1.split('\n').every((l) => l.length <= 255)).toBe(true)
    const back = fromGedcom(g1)
    expect(back).toEqual(tree)
    expect(toGedcom(back, { date: '1 JAN 2026' })).toBe(g1)
  })
  it('parses foreign GEDCOM quirks (CRLF, CONC, BOM, missing GIVN)', () => {
    const g = '﻿0 HEAD\r\n0 @P1@ INDI\r\n1 NAME Mary Ann /Doe/\r\n1 SEX F\r\n1 NOTE Hello\r\n2 CONC  world\r\n2 CONT next\r\n1 BIRT\r\n2 DATE ABT 1850\r\n0 @P2@ INDI\r\n1 NAME John /Doe/\r\n0 @F1@ FAM\r\n1 WIFE @P1@\r\n1 CHIL @P2@\r\n1 CHIL @X9@\r\n0 TRLR'
    const r = fromGedcom(g)
    expect(r.people[0]).toMatchObject({ given: 'Mary Ann', surname: 'Doe', sex: 'F', notes: 'Hello world\nnext' })
    expect(r.people[0].birth.date).toBe('ABT 1850')
    expect(r.families[0].children).toEqual(['P2'])
    expect(parseLines('0 HEAD\n1 SOUR X').length).toBe(1)
    expect(() => fromGedcom('hello')).toThrow()
  })
  it('names blood relationships', () => {
    expect(rel('I16', 'I8')).toBe('father')
    expect(rel('I16', 'I1')).toBe('great-grandfather')
    expect(rel('I1', 'I16')).toBe('great-granddaughter')
    expect(rel('I16', 'I17')).toBe('brother')
    expect(rel('I8', 'I10')).toBe('half-brother')
    expect(rel('I16', 'I18')).toBe('first cousin')
    expect(rel('I16', 'I19')).toBe('second cousin')
    expect(rel('I16', 'I21')).toBe('second cousin once removed')
    expect(rel('I21', 'I1')).toBe('great-great-grandfather')
    expect(rel('I16', 'I9')).toBe('aunt')
    expect(rel('I16', 'I4')).toBe('great-aunt')
    expect(rel('I9', 'I16')).toBe('niece')
    expect(rel('I16', 'I10')).toBe('half-uncle')
    expect(rel('I16', 'I22')).toBe('half first cousin')
    expect(rel('I16', 'I11')).toBe('first cousin once removed')
  })
  it('names spouses and in-laws', () => {
    expect(rel('I8', 'I13')).toBe('wife')
    expect(rel('I11', 'I15')).toBe('former husband')
    expect(rel('I13', 'I3')).toBe('father-in-law')
    expect(rel('I13', 'I9')).toBe('sister-in-law')
    expect(rel('I8', 'I14')).toBe('brother-in-law')
    expect(rel('I3', 'I13')).toBe('daughter-in-law')
    expect(rel('I8', 'I6')).toBe('stepmother')
    expect(rel('I6', 'I8')).toBe('stepson')
    expect(rel('I16', 'I5')).toBe('grandmother')
  })
  it('finds half-siblings', () => {
    const s = siblingsOf(index(t), 'I8')
    expect(s).toEqual(expect.arrayContaining([{ id: 'I9', half: false }, { id: 'I10', half: true }]))
  })
  it('descendant layout places everyone once without overlaps', () => {
    const L = descendantLayout(t, 'I1')
    const ids = L.boxes.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(22)
    for (const a of L.boxes) for (const b of L.boxes) if (a !== b && a.y === b.y) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(BOX_W)
  })
  it('pedigree layout has empty slots for unknown parents', () => {
    const L = pedigreeLayout(t, 'I16', 4)
    expect(L.boxes.map((b) => b.id)).toEqual(expect.arrayContaining(['I16', 'I8', 'I13', 'I3', 'I5', 'I1', 'I2']))
    expect(L.slots.some((s) => s.child === 'I13')).toBe(true)
  })
})
