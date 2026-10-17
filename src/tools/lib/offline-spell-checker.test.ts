import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { adjacent, check, decode, distance, fromWords, isCorrect, suggest, tokenize } from './offline-spell-checker'

const D = decode(readFileSync(new URL('./offline-spell-checker-words.txt', import.meta.url), 'utf8'))

describe('offline-spell-checker', () => {
  it('decodes the front-coded word list', () => {
    expect(D.size).toBeGreaterThan(70000)
    expect(D.lower.has('house')).toBe(true)
    expect(D.lower.has('zygotes')).toBe(true)
    expect(D.proper.get('paris')).toEqual(['Paris'])
    const small = fromWords(['apple', 'apples', 'Bob'])
    expect([...small.lower]).toEqual(['apple', 'apples'])
  })
  it('handles case, possessives, hyphens and affixes', () => {
    for (const w of ['House', 'HOUSE', 'Paris', 'PARIS', "John's", 'teachers’', "dog's", 'well-known', 'reorganize', 'stopping', 'unhappiness', 'teacherlike', 'microservice', 'café', 'I', 'a']) expect(isCorrect(w, D), w).toBe(true)
    for (const w of ['paris', 'teh', 'recieve', 'speling', 'definately', 'occured', 'happyness', 'untill']) expect(isCorrect(w, D), w).toBe(false)
    expect(isCorrect('Kubernetes', D, new Set(['Kubernetes']))).toBe(true)
  })
  it('skips URLs, e-mails, code and numbers', () => {
    const t = tokenize('Visit https://exmaple.com/pth or mail jo@exmple.org, run `npm instal` and getUserNmae() on 3rd v2 snake_cse file.tsx $varr Recieve')
    expect(t.map((x) => x.word)).toEqual(['Visit', 'or', 'mail', 'run', 'and', 'on', 'file', 'Recieve'])
  })
  it('measures keyboard-aware distance', () => {
    expect(adjacent('s', 'd')).toBe(true)
    expect(adjacent('a', 'p')).toBe(false)
    expect(distance('teh', 'the')).toBeLessThan(1)
    expect(distance('hwllo', 'hello')).toBeLessThan(distance('hpllo', 'hello'))
    expect(distance('kitten', 'sitting')).toBeCloseTo(2.8)
  })
  it('suggests sensible corrections', () => {
    expect(suggest('teh', D)[0]).toBe('the')
    expect(suggest('recieve', D)[0]).toBe('receive')
    expect(suggest('definately', D)).toContain('definitely')
    expect(suggest('Speling', D)[0]).toBe('Spelling')
    expect(suggest('alot', D)).toContain('a lot')
    expect(suggest('occured', D)[0]).toBe('occurred')
    expect(suggest('wich', D)[0]).toBe('which')
    expect(suggest('cheking', D)[0]).toBe('checking')
  })
  it('collects unique issues', () => {
    const r = check('Teh cat and teh dog. Teh end.', D, new Set(), new Set())
    expect(r.issues.map((i) => [i.word, i.count])).toEqual([['Teh', 2], ['teh', 1]])
    expect(check('Teh cat', D, new Set(), new Set(['Teh'])).issues).toEqual([])
  })
})
