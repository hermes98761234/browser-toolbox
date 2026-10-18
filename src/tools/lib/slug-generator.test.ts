import { describe, expect, it } from 'vitest'
import { lint, parseCustom, slugify, uniqueSlugs } from './slug-generator'

describe('slug-generator', () => {
  it('basics', () => {
    expect(slugify('Hello, World!')).toBe('hello-world')
    expect(slugify('  --Multiple   spaces__and---dashes--  ')).toBe('multiple-spaces-and-dashes')
    expect(slugify("Don't Stop Believin'")).toBe('dont-stop-believin')
    expect(slugify('Crème Brûlée à la carte')).toBe('creme-brulee-a-la-carte')
    expect(slugify('Ærøskøbing Straße Łódź')).toBe('aeroskobing-strasse-lodz')
    expect(slugify('Rock & Roll: 100% Fun')).toBe('rock-and-roll-100-percent-fun')
    expect(slugify('Hello World', { sep: '_', lower: false })).toBe('Hello_World')
  })
  it('umlauts and scripts', () => {
    expect(slugify('Müller über Öl')).toBe('muller-uber-ol')
    expect(slugify('Müller über Öl', { germanUmlauts: true })).toBe('mueller-ueber-oel')
    expect(slugify('Київ — столиця України')).toBe('kyiv-stolytsia-ukrainy')
    expect(slugify('Згорани, Їжакевич, Юрій, Яготин')).toBe('zghorany-yizhakevych-yurii-yahotyn')
    expect(slugify('Щедрий вечір', { cyrillic: 'uk' })).toBe('shchedryi-vechir')
    expect(slugify('Съешь ещё этих булок', { cyrillic: 'ru' })).toBe('sesh-eshchyo-etikh-bulok')
    expect(slugify('Αθήνα')).toBe('athina')
    expect(slugify('東京 Tokyo', { ascii: false })).toBe('東京-tokyo')
    expect(slugify('東京')).toBe('')
    expect(slugify('Київ café', { ascii: false })).toBe('київ-cafe')
  })
  it('stop words and truncation at word boundary', () => {
    expect(slugify('The Quick Guide to the Best Coffee in Town', { stopWords: true })).toBe('quick-guide-best-coffee-town')
    expect(slugify('The', { stopWords: true })).toBe('the')
    expect(slugify('alpha beta gamma delta', { maxLen: 12 })).toBe('alpha-beta')
    expect(slugify('supercalifragilistic', { maxLen: 5 })).toBe('super')
  })
  it('custom replacements, uniqueness, lint', () => {
    expect(parseCustom('C#=csharp\n=x\nbad')).toEqual([['C#', 'csharp']])
    expect(slugify('Learn C# fast', { custom: 'C#=csharp' })).toBe('learn-csharp-fast')
    expect(uniqueSlugs(['a', 'a', 'b', 'a'], '-', ['b'])).toEqual(['a', 'a-2', 'b-2', 'a-3'])
    expect(lint('', 'x')[0].tone).toBe('err')
    expect(lint('hello-world', 'Hello world')[0].tone).toBe('ok')
  })
})
