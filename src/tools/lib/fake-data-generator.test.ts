import { describe, expect, it } from 'vitest'
import { fromPattern, gen, generate, hashSeed, parseOptions, rng, sqlValue, toCsv, toSql, uuid, type Field } from './fake-data-generator'

const F = (type: Field['type'], extra: Partial<Field> = {}): Field => ({ id: type, name: type, type, ...extra })

describe('fake-data-generator', () => {
  it('is deterministic per seed and per row', () => {
    const fields = [F('id'), F('fullName'), F('email'), F('int', { min: 1, max: 6 })]
    const a = generate(fields, 20, 42), b = generate(fields, 20, 42), c = generate(fields, 20, 43)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect(generate(fields, 5, 42, 10)).toEqual(a.slice(10, 15))
    expect(hashSeed('abc')).toBe(hashSeed('abc'))
  })
  it('keeps names and emails consistent within a row', () => {
    const rows = generate([F('firstName'), F('lastName'), F('fullName'), F('email')], 50, 7)
    for (const r of rows) {
      expect(r.fullName).toBe(`${r.firstName} ${r.lastName}`)
      expect(String(r.email)).toMatch(/@example\.(com|org|net)$/)
    }
  })
  it('respects ranges and probabilities', () => {
    const r = rng(1)
    for (let i = 0; i < 500; i++) {
      const v = gen(F('int', { min: 3, max: 5 }), r, i, {}) as number
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(5)
      const d = gen(F('date', { from: '2024-02-01', to: '2024-02-29' }), r, i, {}) as string
      expect(d >= '2024-02-01' && d <= '2024-02-29').toBe(true)
      const x = gen(F('decimal', { min: 1, max: 2, decimals: 2 }), r, i, {}) as number
      expect(Math.round(x * 100)).toBeCloseTo(x * 100)
    }
    const trues = Array.from({ length: 4000 }, (_, i) => gen(F('bool', { prob: 25 }), r, i, {})).filter(Boolean).length
    expect(trues / 4000).toBeGreaterThan(0.21)
    expect(trues / 4000).toBeLessThan(0.29)
    expect(Array.from({ length: 200 }, (_, i) => gen(F('int', { nulls: 100 }), r, i, {})).every((v) => v === null)).toBe(true)
  })
  it('handles patterns, options and uuids', () => {
    const r = rng(9)
    expect(fromPattern(r, 'AB-###-??')).toMatch(/^AB-\d{3}-[A-Z]{2}$/)
    expect(parseOptions('new:3, paid, void:0.5')).toEqual([{ v: 'new', w: 3 }, { v: 'paid', w: 1 }, { v: 'void', w: 0.5 }])
    expect(uuid(r)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
  it('exports CSV and SQL safely', () => {
    const fields = [F('id'), F('constant', { name: 'note', value: `O'Neil, "Jr"` }), F('bool')]
    fields[1].name = 'note'
    const rows = [{ id: 1, note: `O'Neil, "Jr"`, bool: true }, { id: 2, note: null, bool: false }]
    expect(toCsv(fields, rows)).toBe('id,note,bool\r\n1,"O\'Neil, ""Jr""",true\r\n2,,false\r\n')
    expect(sqlValue(`it's`)).toBe(`'it''s'`)
    expect(sqlValue(true, 'sqlite')).toBe('1')
    expect(sqlValue('a\\b', 'mysql')).toBe(`'a\\\\b'`)
    const sql = toSql(fields, rows, 'people', 'ansi', 1, true)
    expect(sql).toContain('CREATE TABLE "people"')
    expect(sql).toContain(`INSERT INTO "people" ("id", "note", "bool") VALUES\n  (1, 'O''Neil, "Jr"', TRUE);`)
    expect(sql).toContain('(2, NULL, FALSE);')
  })
})
