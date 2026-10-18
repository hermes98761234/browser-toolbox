import { describe, expect, it } from 'vitest'
import { expiry, isSealed, isWallet, newKey, sealWallet, toIcs, unlockWallet, type Wallet } from './car-document-wallet'

const T = '2026-10-14'
const W: Wallet = {
  vehicles: [{ id: 'v1', name: 'Family SUV', make: 'Toyota', model: 'RAV4', year: 2021, plate: 'AB 123', vin: 'JT123', odometer: 41200, unit: 'km' }],
  docs: [
    { id: 'd1', vehicle: 'v1', type: 'insurance', title: 'Comprehensive', provider: 'Acme, Inc', number: 'POL-1', issued: '2025-11-01', expires: '2026-11-01', dueOdo: 0, cost: 640, notes: '', files: [] },
    { id: 'd2', vehicle: 'v1', type: 'service', title: 'Annual service', provider: '', number: '', issued: '2025-12-01', expires: '', dueOdo: 42000, cost: 0, notes: '', files: [] },
  ],
}

describe('car document wallet', () => {
  it('expiry by date', () => {
    expect(expiry({ type: 'insurance', expires: '2026-10-10', dueOdo: 0 }, T).status).toBe('expired')
    expect(expiry({ type: 'insurance', expires: '2026-11-01', dueOdo: 0 }, T).status).toBe('renew')
    expect(expiry({ type: 'insurance', expires: '2026-12-20', dueOdo: 0 }, T).status).toBe('soon')
    expect(expiry({ type: 'insurance', expires: '2027-06-01', dueOdo: 0 }, T).status).toBe('ok')
    expect(expiry({ type: 'other', expires: '', dueOdo: 0 }, T).status).toBe('none')
    expect(expiry({ type: 'insurance', expires: '2026-11-01', dueOdo: 0 }, T).renewBy).toBe('2026-10-02')
  })
  it('expiry by odometer takes the worse of both', () => {
    const e = expiry({ type: 'service', expires: '2027-06-01', dueOdo: 42000 }, T, 41200)
    expect(e.kmLeft).toBe(800)
    expect(e.status).toBe('renew')
    expect(expiry({ type: 'service', expires: '', dueOdo: 42000 }, T, 42100).status).toBe('expired')
  })
  it('ics has renew + expiry events with alarms', () => {
    const s = toIcs(W, '20261014T000000Z')
    expect(s.split('BEGIN:VEVENT')).toHaveLength(3)
    expect(s).toContain('DTSTART;VALUE=DATE:20261002')
    expect(s).toContain('SUMMARY:Insurance expires — Family SUV (AB 123)')
    expect(s).toContain('Acme\\, Inc')
    expect(s).toContain('BEGIN:VALARM')
  })
  it('encrypts and decrypts the whole wallet', async () => {
    const { key, salt } = await newKey('correct horse battery', 1000)
    const v = await sealWallet(W, key, salt, 1000)
    const text = JSON.stringify(v)
    expect(text).not.toContain('RAV4')
    expect(isSealed(JSON.parse(text))).toBe(true)
    expect(isWallet(W)).toBe(true)
    expect((await unlockWallet(v, 'correct horse battery')).wallet).toEqual(W)
    await expect(unlockWallet(v, 'wrong passphrase')).rejects.toThrow(/Wrong passphrase/)
    await expect(newKey('short', 1000)).rejects.toThrow()
  })
})
