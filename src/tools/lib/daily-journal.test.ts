import { describe, expect, it } from 'vitest'
import { createVault, openVault, promptIndex, putItem, seal, streak, strength, unseal, deriveKey, words, type Entry } from './daily-journal'

const E = (id: string, date: string, text: string): Entry => ({ id, date, mood: 4, tags: ['walk'], prompt: 'p', text, updated: date })

describe('journal encryption', () => {
  it('round-trips entries through a vault', async () => {
    const entries = [E('a', '2026-10-01', 'Quiet morning, strong coffee. ✓ ünïcode'), E('b', '2026-10-02', 'Second day')]
    const { vault, key } = await createVault('correct horse battery', entries, 1000)
    expect(JSON.stringify(vault)).not.toContain('Quiet morning')
    expect(vault.items.map((i) => i.date)).toEqual(['2026-10-01', '2026-10-02'])
    const opened = await openVault('correct horse battery', vault)
    expect(opened.entries).toEqual(entries)
    const v2 = await putItem(vault, key, { ...entries[0], text: 'edited' })
    expect(v2.items.length).toBe(2)
    expect((await openVault('correct horse battery', v2)).entries.find((e) => e.id === 'a')!.text).toBe('edited')
  })
  it('rejects a wrong passphrase', async () => {
    const { vault } = await createVault('right one', [E('a', '2026-10-01', 'x')], 1000)
    await expect(openVault('wrong one', vault)).rejects.toThrow('wrong passphrase')
  })
  it('uses a fresh IV per seal and detects tampering', async () => {
    const key = await deriveKey('k', new Uint8Array(16), 1000)
    const a = await seal(key, 'same'), b = await seal(key, 'same')
    expect(a.iv).not.toBe(b.iv)
    expect(await unseal(key, a)).toBe('same')
    const bad = { ...a, ct: a.ct.slice(0, -4) + (a.ct.endsWith('AAA=') ? 'BBB=' : 'AAA=') }
    await expect(unseal(key, bad)).rejects.toBeTruthy()
  })
})

describe('journal helpers', () => {
  it('streak, words, prompts, strength', () => {
    expect(streak(['2026-10-16', '2026-10-17', '2026-10-18'], '2026-10-18')).toBe(3)
    expect(streak(['2026-10-16', '2026-10-17'], '2026-10-18')).toBe(2)
    expect(streak(['2026-10-15'], '2026-10-18')).toBe(0)
    expect(words('  two  words ')).toBe(2)
    expect(promptIndex('2026-10-18', 40)).toBe(promptIndex('2026-11-27', 40))
    expect(strength('abc')).toBeLessThan(strength('Tr0ub4dor&3-long-phrase'))
  })
})
