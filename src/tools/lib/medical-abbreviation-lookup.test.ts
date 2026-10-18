import { describe, expect, it } from 'vitest'
import { ABBRS, scan, search } from './medical-abbreviation-lookup'

describe('medical abbreviations', () => {
  it('dataset is large, unique and flags the Joint Commission list', () => {
    expect(ABBRS.length).toBeGreaterThanOrEqual(250)
    expect(new Set(ABBRS.map((a) => a.abbr)).size).toBe(ABBRS.length)
    const dnu = ABBRS.filter((a) => a.flag === 'dnu').map((a) => a.abbr)
    for (const x of ['U', 'IU', 'QD', 'Q.D.', 'QOD', 'Q.O.D.', 'MS', 'MSO4', 'MgSO4', 'X.0 mg', '.X mg']) expect(dnu).toContain(x)
    expect(ABBRS.every((a) => !a.flag || a.note.length > 10)).toBe(true)
  })
  it('search ranks exact abbreviations first, ignoring dots and case', () => {
    expect(search('qd')[0].abbr).toMatch(/^Q\.?D\.?$/)
    expect(search('ms')[0].abbr).toBe('MS')
    expect(search('ms')[0].meanings.length).toBeGreaterThan(1)
    expect(search('hypertension')[0].abbr).toBe('HTN')
    expect(search('pulmonary embol').some((a) => a.abbr === 'PE')).toBe(true)
  })
  it('scans text for unsafe abbreviations and zeros', () => {
    const f = scan('Give MSO4 2.0 mg IV q.d. and insulin 10 U SQ; Lasix .5 mg qhs. Patient in bed as ordered, CC: chest pain, temp 37.0')
    const t = f.map((x) => x.text)
    expect(t).toContain('MSO4')
    expect(t).toContain('2.0 mg')
    expect(t).toContain('q.d.')
    expect(t).toContain('U')
    expect(t).toContain('SQ')
    expect(t).toContain('.5 mg')
    expect(t).toContain('qhs')
    expect(t).not.toContain('in')
    expect(t).not.toContain('as')
    expect(t).not.toContain('CC')
    expect(t.some((x) => x.startsWith('37'))).toBe(false)
  })
})
