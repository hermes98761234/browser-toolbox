import { describe, expect, it } from 'vitest'
import { armor, clearsign, crc24, dearmor, decrypt, encrypt, exportPrivate, exportPublic, generateKey, importKey, inspect, unlock, verifyClearsigned } from './encrypted-message-tool'

const enc = new TextEncoder()

describe('encrypted messages', () => {
  it('crc24 and armor', () => {
    expect(crc24(new Uint8Array())).toBe(0xb704ce)
    const a = armor('MESSAGE', enc.encode('hello world'))
    expect(new TextDecoder().decode(dearmor(a).data)).toBe('hello world')
    expect(() => dearmor(a.replace('aGVsbG8', 'aGVsbG9'))).toThrow(/checksum/)
  })
  it('encrypts to several recipients, signs and verifies', async () => {
    const alice = await generateKey('Alice <a@x>', 'pw-a', 1000)
    const bob = await generateKey('Bob <b@x>', '', 1000)
    const carol = await generateKey('Carol <c@x>', '', 1000)
    const sk = await unlock(alice, 'pw-a')
    const msg = await encrypt('Meet at 6 ☕', { to: [bob, carol], signWith: { key: alice, sig: sk.sig } })
    expect(inspect(msg).recipients).toEqual([bob.fp, carol.fp])
    const bobRing = [bob, { pub: alice.pub, fp: alice.fp }]
    const r = await decrypt(msg, bobRing, () => '')
    expect(r.text).toBe('Meet at 6 ☕')
    expect(r.signature.status).toBe('valid')
    const r2 = await decrypt(msg, [carol], () => '')
    expect(r2.signature.status).toBe('unknown')
    await expect(decrypt(msg, [alice], () => 'pw-a')).rejects.toThrow(/None of your/)
    await expect(unlock(alice, 'nope')).rejects.toThrow(/Wrong passphrase/)
  })
  it('round-trips keys through armor', async () => {
    const k = await generateKey('Dan', 'x', 1000)
    const pub = await importKey(exportPublic(k))
    expect(pub.fp).toBe(k.fp)
    expect(pub.priv).toBeUndefined()
    const priv = await importKey(exportPrivate(k))
    await expect(unlock(priv, 'x')).resolves.toBeTruthy()
  })
  it('password mode and tamper detection', async () => {
    const m = await encrypt('secret', { password: 'hunter2', iter: 1000 })
    expect((await decrypt(m, [], () => '', 'hunter2')).text).toBe('secret')
    await expect(decrypt(m, [], () => '', 'wrong')).rejects.toThrow()
  })
  it('clear-signs', async () => {
    const k = await generateKey('Eve', '', 1000)
    const s = await clearsign('I agree.', k, (await unlock(k, '')).sig)
    expect((await verifyClearsigned(s, [k])).status).toBe('valid')
    expect((await verifyClearsigned(s.replace('I agree.', 'I disagree.'), [k])).status).toBe('invalid')
  })
})
