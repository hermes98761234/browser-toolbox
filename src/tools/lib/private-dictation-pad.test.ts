import { describe, expect, it } from 'vitest'
import { controlCommand, insertPhrase, tokenize, wordCount } from './private-dictation-pad'

const say = (text: string, ...phrases: string[]) => phrases.reduce((t, p) => insertPhrase(t, t.length, p).text, text)

describe('private-dictation-pad', () => {
  it('tokenizes spoken punctuation', () => {
    expect(tokenize('hello comma world period')).toEqual([{ t: 'w', v: 'hello' }, { t: 'p', v: ',' }, { t: 'w', v: 'world' }, { t: 'p', v: '.' }])
    expect(tokenize('a new paragraph b')[1]).toEqual({ t: 'p', v: '\n\n' })
    expect(tokenize('commander period')[0]).toEqual({ t: 'w', v: 'commander' }) // whole words only
  })
  it('builds sentences with spacing and capitals', () => {
    expect(say('', 'hello comma world period', 'how are you question mark')).toBe('Hello, world. How are you?')
    expect(say('', 'first line new line second line')).toBe('First line\nSecond line')
    expect(say('', 'she said open quote yes close quote period')).toBe('She said “yes”.')
    expect(say('', 'i think i\'m right')).toBe("I think I'm right")
  })
  it('inserts in the middle of text', () => {
    const r = insertPhrase('Hello world.', 5, 'big')
    expect(r.text).toBe('Hello big world.')
    expect(r.cursor).toBe(9)
  })
  it('can disable commands', () => {
    expect(insertPhrase('', 0, 'the period was long', { commands: false }).text).toBe('The period was long')
  })
  it('recognises control phrases', () => {
    expect(controlCommand('Scratch that.')).toBe('scratch')
    expect(controlCommand('stop listening')).toBe('stop')
    expect(controlCommand('scratch that idea')).toBeNull()
    expect(wordCount(' a b\nc ')).toBe(3)
  })
})
