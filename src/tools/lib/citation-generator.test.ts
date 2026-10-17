import { describe, expect, it } from 'vitest'
import { format, inText, initials, parseBibtex, parseNames, sentenceCase, toPlain, type Source } from './citation-generator'

const base: Source = { id: '1', kind: 'journal', authors: 'Smith, John Adam\nJane Doe', editors: '', title: 'Learning to read: A study', container: 'Journal of Reading', publisher: '', place: '', year: '2020', month: '', day: '', volume: '12', issue: '3', pages: '45-67', edition: '', doi: '10.1000/xyz123', url: '', accessed: '' }

describe('citation generator', () => {
  it('names', () => {
    expect(parseNames('Ludwig van Beethoven')).toEqual([{ family: 'van Beethoven', given: 'Ludwig' }])
    expect(initials('John Adam')).toBe('J. A.')
    expect(initials('Jean-Paul')).toBe('J.-P.')
    expect(parseNames('{World Health Organization}')[0].org).toBe(true)
  })
  it('APA journal', () => {
    expect(toPlain(format(base, 'apa'))).toBe('Smith, J. A., & Doe, J. (2020). Learning to read: A study. Journal of Reading, 12(3), 45–67. https://doi.org/10.1000/xyz123')
    expect(format(base, 'apa')).toContain('<i>Journal of Reading</i>, <i>12</i>(3)')
  })
  it('MLA journal', () => {
    expect(toPlain(format(base, 'mla'))).toBe('Smith, John Adam, and Jane Doe. “Learning to read: A study.” Journal of Reading, vol. 12, no. 3, 2020, pp. 45-67, https://doi.org/10.1000/xyz123.')
  })
  it('Chicago journal', () => {
    expect(toPlain(format(base, 'chicago'))).toBe('Smith, John Adam, and Jane Doe. “Learning to read: A study.” Journal of Reading 12, no. 3 (2020): 45–67. https://doi.org/10.1000/xyz123.')
  })
  it('APA book with edition', () => {
    const b: Source = { ...base, kind: 'book', authors: 'Orwell, George', title: 'Nineteen eighty-four', container: '', publisher: 'Secker & Warburg', edition: '2', volume: '', issue: '', pages: '', doi: '' }
    expect(toPlain(format(b, 'apa'))).toBe('Orwell, G. (2020). Nineteen eighty-four (2nd ed.). Secker & Warburg.')
    expect(toPlain(format({ ...b, place: 'London' }, 'chicago'))).toBe('Orwell, George. Nineteen eighty-four. 2nd ed. London: Secker & Warburg, 2020.')
  })
  it('in-text', () => {
    expect(inText(base, 'apa')).toBe('(Smith & Doe, 2020)')
    expect(inText(base, 'mla')).toBe('(Smith and Doe 45)')
  })
  it('sentence case keeps acronyms', () => {
    expect(sentenceCase('The Rise Of NASA: A New History')).toBe('The rise of NASA: A new history')
  })
  it('bibtex import', () => {
    const r = parseBibtex(`@article{k1, author = {Knuth, Donald E. and Plass, Michael F.}, title = {Breaking Paragraphs into Lines}, journal = "Software: Practice and Experience", year = 1981, volume = {11}, number = {11}, pages = {1119--1184}, month = nov }`, () => 'x')
    expect(r).toHaveLength(1)
    expect(r[0].authors).toBe('Knuth, Donald E.\nPlass, Michael F.')
    expect(r[0].pages).toBe('1119–1184')
    expect(r[0].month).toBe('11')
    expect(r[0].kind).toBe('journal')
  })
})
