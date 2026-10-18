import { describe, expect, it } from 'vitest'
import { changePassphrase, createVault, ITERATIONS, openNote, parseVault, sampleNotes, sealNote, strength, unlock } from './encrypted-notes-vault'

describe('encrypted notes vault', () => {
  it('round-trips notes, rejects wrong passphrases and stores no plaintext', async () => {
    const notes = sampleNotes()
    const { vault } = await createVault('correct horse battery staple', notes)
    expect(vault.kdf.iterations).toBeGreaterThanOrEqual(600000)
    expect(vault.kdf.iterations).toBe(ITERATIONS)
    const text = JSON.stringify(vault)
    for (const n of notes) {
      expect(text).not.toContain(n.title)
      expect(text).not.toContain(n.body.slice(0, 20))
    }
    const ivs = Object.values(vault.notes).map((s) => s.iv)
    expect(new Set([...ivs, vault.check.iv]).size).toBe(ivs.length + 1)
    const u = await unlock(parseVault(text), 'correct horse battery staple')
    expect(u.failed).toEqual([])
    expect(u.notes.map((n) => n.title).sort()).toEqual(notes.map((n) => n.title).sort())
    await expect(unlock(vault, 'wrong passphrase!')).rejects.toThrow(/Wrong passphrase/)
  }, 30000)

  it('uses a fresh IV on every save and detects tampering / swapped notes', async () => {
    const { vault, key } = await createVault('another long passphrase')
    const n = sampleNotes()[1]
    const a = await sealNote(key, n), b = await sealNote(key, n)
    expect(a.iv).not.toBe(b.iv)
    expect((await openNote(key, n.id, a)).body).toBe(n.body)
    // ciphertext bound to its id: moving it to another id fails authentication
    await expect(openNote(key, 'other', a)).rejects.toThrow()
    const bad = { ...a, ct: a.ct.slice(0, -4) + (a.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA') }
    await expect(openNote(key, n.id, bad)).rejects.toThrow()
    expect(vault.notes).toEqual({})
  }, 30000)

  it('changes the passphrase by re-encrypting everything', async () => {
    const notes = sampleNotes()
    const old = await createVault('old passphrase 123', notes)
    const nv = await changePassphrase(notes, 'new passphrase 456')
    expect(nv.vault.kdf.salt).not.toBe(old.vault.kdf.salt)
    await expect(unlock(nv.vault, 'old passphrase 123')).rejects.toThrow()
    const u = await unlock(nv.vault, 'new passphrase 456')
    expect(u.notes.length).toBe(notes.length)
  }, 30000)

  it('validates backups', async () => {
    expect(() => parseVault('{"a":1}')).toThrow(/Not an encrypted/)
    const { vault } = await createVault('passphrase for backup')
    expect(() => parseVault(JSON.stringify({ ...vault, kdf: { ...vault.kdf, iterations: 1000 } }))).toThrow(/iterations/)
    await expect(createVault('short')).rejects.toThrow(/8 characters/)
  }, 30000)

  it('rates passphrases', () => {
    expect(strength('abc').label).toBe('weak')
    expect(strength('correct horse battery staple').label).not.toBe('weak')
    expect(strength('Tr0ub4dor&3xQ!9z').bits).toBeGreaterThan(80)
  })
})
