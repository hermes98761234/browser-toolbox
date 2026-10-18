import { describe, expect, it } from 'vitest'
import { csvRows, diff, maskId, merge, newKey, nextSeq, openEntries, parseBlob, search, sealEntries, stats, validate, type Entry } from './notary-journal'

const E = (p: Partial<Entry>): Entry => ({
  id: 'a', seq: 1, when: '2026-10-01T10:30', act: 'Acknowledgment', docType: 'Grant deed', docDate: '2026-09-30', signer: 'Ana Ruiz', address: '1 Oak St', idType: 'Driver licence', idNumber: 'D1234567', idIssuer: 'CA DMV', idExpiry: '2028-01-01',
  witnesses: '', fee: 15, travelFee: 0, location: 'Office', remote: false, thumbprint: false, signature: '', notes: '', created: '2026-10-01T10:31:00Z', history: [], ...p,
})

describe('validate', () => {
  it('accepts a complete entry', () => expect(validate(E({}))).toEqual([]))
  it('flags required fields and mistakes', () => {
    const v = validate(E({ signer: '', idNumber: '', idExpiry: '2026-09-01', fee: 30, docDate: '2026-10-05' }), 15)
    expect(v.map((x) => x.field)).toEqual(['signer', 'idNumber', 'idExpiry', 'fee', 'docDate'])
    const w = validate(E({ idExpiry: '2026-09-01' }))
    expect(w).toEqual([{ field: 'idExpiry', msg: 'The ID had expired on the date of the act', level: 'warn' }])
    expect(validate(E({ idType: 'Credible witness(es)', idNumber: '' }))[0].field).toBe('witnesses')
    expect(validate(E({ idType: 'Personally known', idNumber: '' }))).toEqual([])
  })
})

describe('helpers', () => {
  const list = [E({}), E({ id: 'b', seq: 2, when: '2026-10-03T09:00', act: 'Jurat', signer: 'Ben Cole', idNumber: 'P99887766', fee: 10, travelFee: 25, remote: true }), E({ id: 'c', seq: 3, when: '2025-12-31T16:00', signer: 'Cy Diaz' })]
  it('masks ids and numbers entries', () => {
    expect(maskId('D1234567')).toBe('••••4567')
    expect(maskId('123')).toBe('123')
    expect(nextSeq(list)).toBe(4)
    expect(nextSeq([])).toBe(1)
  })
  it('searches by name, act, dates and ID tail', () => {
    expect(search(list, 'ben').map((e) => e.id)).toEqual(['b'])
    expect(search(list, '7766').map((e) => e.id)).toEqual(['b'])
    expect(search(list, '', 'Acknowledgment').map((e) => e.id)).toEqual(['a', 'c'])
    expect(search(list, '', '', '2026-01-01').map((e) => e.id)).toEqual(['b', 'a'])
    expect(search(list, '#3').map((e) => e.id)).toEqual(['c'])
  })
  it('computes stats', () => {
    const s = stats(list, '2026', '2026-10')
    expect(s).toMatchObject({ month: 2, year: 2, fees: 50, remote: 1 })
    expect(s.byAct).toEqual([['Acknowledgment', 1], ['Jurat', 1]])
  })
  it('describes amendments and exports CSV', () => {
    expect(diff(E({}), E({ fee: 20 }))).toBe('fee: “15” → “20”')
    const rows = csvRows(list)
    expect(rows[1][0]).toBe(1)
    expect(rows[2][8]).toBe('•••••7766')
    expect(csvRows(list, false)[2][8]).toBe('P99887766')
  })
  it('merges by id', () => {
    const m = merge([E({})], [E({ fee: 99 }), E({ id: 'z' })])
    expect(m.added).toBe(1)
    expect(m.entries.find((e) => e.id === 'a')?.fee).toBe(99)
  })
})

describe('encryption', () => {
  it('round-trips and rejects a wrong passphrase or tampering', async () => {
    const k = await newKey('correct horse battery', 100_000)
    const blob = await sealEntries(k, [E({})])
    expect(blob.count).toBe(1)
    const text = JSON.stringify(blob)
    expect(text).not.toContain('Ana Ruiz')
    const back = await openEntries(parseBlob(text), 'correct horse battery')
    expect(back.entries[0].signer).toBe('Ana Ruiz')
    await expect(openEntries(blob, 'wrong passphrase')).rejects.toThrow(/Wrong passphrase/)
    const bad = { ...blob, ct: blob.ct.slice(0, -4) + (blob.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA') }
    await expect(openEntries(bad, 'correct horse battery')).rejects.toThrow()
    await expect(newKey('short')).rejects.toThrow(/8 characters/)
    expect(() => parseBlob('{"format":"x"}')).toThrow()
  })
})
