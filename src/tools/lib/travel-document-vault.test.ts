import { describe, expect, it } from 'vitest'
import { addMonths, createVault, expiry, mask, openFile, parseVault, pruneFiles, rekey, sealDoc, sealFile, unlock, VaultError, type Doc } from './travel-document-vault'

const IT = 1000
const doc = (over: Partial<Doc> = {}): Doc => ({ id: 'd1', type: 'passport', title: 'My passport', holder: 'A. Traveller', number: 'X1234567', country: 'NL', issued: '2020-01-10', expires: '2030-01-09', notes: '', files: [{ id: 'f1', name: 'scan.jpg', mime: 'image/jpeg', size: 3 }], updated: '', ...over })

describe('travel-document-vault crypto', () => {
  it('round-trips docs and files, never stores plaintext', async () => {
    const { vault, key } = await createVault('correct horse battery', IT)
    const d = doc()
    vault.docs[d.id] = await sealDoc(key, d)
    vault.files.f1 = await sealFile(key, 'f1', new Uint8Array([1, 2, 3]))
    const text = JSON.stringify(vault)
    expect(text).not.toContain('X1234567')
    expect(text).not.toContain('Traveller')
    const v2 = parseVault(text, IT)
    const u = await unlock(v2, 'correct horse battery')
    expect(u.docs).toEqual([d])
    expect([...(await openFile(u.key, v2, 'f1'))]).toEqual([1, 2, 3])
  })
  it('rejects wrong passphrase and tampering', async () => {
    const { vault, key } = await createVault('correct horse battery', IT)
    vault.docs.d1 = await sealDoc(key, doc())
    await expect(unlock(vault, 'wrong passphrase')).rejects.toBeInstanceOf(VaultError)
    // swapping a record under another id fails authentication (id bound as AAD)
    vault.docs.d2 = vault.docs.d1
    const u = await unlock(vault, 'correct horse battery')
    expect(u.failed).toEqual(['d2'])
    await expect(createVault('short', IT)).rejects.toThrow(/8 characters/)
    expect(() => parseVault('{"format":"x"}')).toThrow(/Not a travel/)
    expect(() => parseVault(JSON.stringify(vault))).toThrow(/iterations/)
  })
  it('re-keys and prunes', async () => {
    const { vault, key } = await createVault('first passphrase', IT)
    const d = doc()
    vault.docs[d.id] = await sealDoc(key, d)
    vault.files.f1 = await sealFile(key, 'f1', new Uint8Array([9, 8]))
    vault.files.orphan = await sealFile(key, 'orphan', new Uint8Array([0]))
    const r = await rekey(vault, key, [d], null, 'second passphrase', IT)
    const u = await unlock(r.vault, 'second passphrase')
    expect([...(await openFile(u.key, r.vault, 'f1'))]).toEqual([9, 8])
    expect(Object.keys(pruneFiles(vault, [d]).files)).toEqual(['f1'])
  })
})

describe('travel-document-vault expiry', () => {
  it('month arithmetic clamps', () => {
    expect(addMonths('2027-08-31', -6)).toBe('2027-02-28')
    expect(addMonths('2026-01-15', 6)).toBe('2026-07-15')
  })
  it('passport 6-month rule', () => {
    expect(expiry({ type: 'passport', expires: '2027-03-01' }, '2026-10-18')).toMatchObject({ status: 'renew', renewBy: '2026-09-01' })
    expect(expiry({ type: 'passport', expires: '2027-06-01' }, '2026-10-18').status).toBe('soon')
    expect(expiry({ type: 'passport', expires: '2030-06-01' }, '2026-10-18').status).toBe('ok')
    expect(expiry({ type: 'passport', expires: '2027-12-01' }, '2026-10-18', '2027-07-10').status).toBe('renew')
    expect(expiry({ type: 'passport', expires: '2026-10-01' }, '2026-10-18').status).toBe('expired')
  })
  it('other types', () => {
    expect(expiry({ type: 'insurance', expires: '2026-11-01' }, '2026-10-18').status).toBe('soon')
    expect(expiry({ type: 'visa', expires: '2026-11-20' }, '2026-10-18', '2026-12-01').message).toMatch(/before your trip ends/)
    expect(expiry({ type: 'other', expires: '' }, '2026-10-18').status).toBe('none')
    expect(mask('X1234567')).toBe('••••4567')
  })
})

describe('travel-document-vault events', () => {
  it('tickets are dates, not expiries', () => {
    expect(expiry({ type: 'ticket', expires: '2027-02-14' }, '2026-10-18', '2027-03-02')).toMatchObject({ status: 'ok', message: 'In 119 days' })
  })
})
